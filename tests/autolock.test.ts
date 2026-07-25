/**
 * Unlock / lock and auto-lock on inactivity (BUS-18).
 *
 * The alarm scheduler is faked so the suite can assert on *what was scheduled*
 * and fire the alarm on demand — a real 15-minute wait is untestable, and
 * mocking timers would only prove `setTimeout` works, not that the alarm-based
 * design does.
 */

import { describe, expect, it } from 'vitest';
import { AUTO_LOCK_ALARM, AutoLock, type AlarmScheduler } from '../src/keyring/autolock';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import {
  assertValidAutoLockMinutes,
  DEFAULT_AUTO_LOCK_MINUTES,
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  withDefaults,
} from '../src/keyring/settings';
import type { VaultStore } from '../src/keyring/storage';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import type { EncryptedVault } from '../src/keyring/vault';
import { MemorySettingsStore, services } from './support/services';

const PASSWORD = 'correct horse battery staple';

class MemoryStore implements VaultStore {
  vault: EncryptedVault | null = null;
  load = async (): Promise<EncryptedVault | null> => this.vault;
  save = async (vault: EncryptedVault): Promise<void> => {
    this.vault = vault;
  };
  clear = async (): Promise<void> => {
    this.vault = null;
  };
}

/** Records scheduling calls instead of talking to `chrome.alarms`. */
class FakeAlarms implements AlarmScheduler {
  /** Every schedule call, in order: `[name, delayMinutes]`. */
  scheduled: Array<[string, number]> = [];
  cancelled: string[] = [];
  /** The alarm currently pending, or null once cancelled/fired. */
  pending: string | null = null;

  schedule = async (name: string, delayMinutes: number): Promise<void> => {
    this.scheduled.push([name, delayMinutes]);
    this.pending = name;
  };

  cancel = async (name: string): Promise<void> => {
    this.cancelled.push(name);
    if (this.pending === name) this.pending = null;
  };

  /** Last delay we were asked to schedule. */
  get lastDelay(): number | undefined {
    return this.scheduled.at(-1)?.[1];
  }
}

/** A wallet that exists and is ready to unlock, plus its collaborators. */
async function setUpWallet(settings = new MemorySettingsStore()) {
  const store = new MemoryStore();
  const keyring = new Keyring(store, webCryptoVaultCrypto);
  await keyring.createAccount(PASSWORD);
  await keyring.lock();

  const alarms = new FakeAlarms();
  return { store, keyring, settings, alarms, autoLock: new AutoLock(keyring, settings, alarms) };
}

// --- Settings ---------------------------------------------------------------

describe('auto-lock settings (BUS-18)', () => {
  it('defaults to 15 minutes', () => {
    expect(DEFAULT_AUTO_LOCK_MINUTES).toBe(15);
    expect(withDefaults(undefined).autoLockMinutes).toBe(15);
  });

  it('accepts a value inside the bounds', () => {
    expect(() => assertValidAutoLockMinutes(MIN_AUTO_LOCK_MINUTES)).not.toThrow();
    expect(() => assertValidAutoLockMinutes(MAX_AUTO_LOCK_MINUTES)).not.toThrow();
    expect(() => assertValidAutoLockMinutes(5)).not.toThrow();
  });

  it('rejects zero, negatives, out-of-range and non-integers', () => {
    for (const bad of [0, -1, MAX_AUTO_LOCK_MINUTES + 1, 2.5, Number.NaN]) {
      expect(() => assertValidAutoLockMinutes(bad)).toThrow();
    }
  });

  it('falls back to the default for malformed stored settings — never to "no timeout"', () => {
    for (const stored of [null, {}, { autoLockMinutes: 0 }, { autoLockMinutes: 'soon' }]) {
      expect(withDefaults(stored).autoLockMinutes).toBe(DEFAULT_AUTO_LOCK_MINUTES);
    }
  });

  it('keeps a valid stored value', () => {
    expect(withDefaults({ autoLockMinutes: 42 }).autoLockMinutes).toBe(42);
  });
});

// --- Arming / disarming the alarm -------------------------------------------

describe('AutoLock.sync (BUS-18)', () => {
  it('arms the alarm at the configured timeout once unlocked', async () => {
    const { keyring, autoLock, alarms } = await setUpWallet();
    await keyring.unlock(PASSWORD);
    await autoLock.sync();

    expect(alarms.scheduled).toEqual([[AUTO_LOCK_ALARM, DEFAULT_AUTO_LOCK_MINUTES]]);
  });

  it('uses the configured timeout, not the default, when one is set', async () => {
    const { keyring, autoLock, alarms } = await setUpWallet(
      new MemorySettingsStore({
        autoLockMinutes: 3,
      }),
    );
    await keyring.unlock(PASSWORD);
    await autoLock.sync();

    expect(alarms.lastDelay).toBe(3);
  });

  it('restarts the countdown on every activity', async () => {
    const { keyring, autoLock, alarms } = await setUpWallet();
    await keyring.unlock(PASSWORD);

    await autoLock.sync();
    await autoLock.sync();
    await autoLock.sync();

    // Three fresh schedules of the SAME alarm name — chrome.alarms.create
    // replaces an existing alarm, which is exactly "reset the countdown".
    expect(alarms.scheduled).toHaveLength(3);
    expect(new Set(alarms.scheduled.map(([name]) => name))).toEqual(new Set([AUTO_LOCK_ALARM]));
  });

  it('cancels the alarm when the wallet is locked', async () => {
    const { keyring, autoLock, alarms } = await setUpWallet();
    await keyring.unlock(PASSWORD);
    await autoLock.sync();

    await keyring.lock();
    await autoLock.sync();

    expect(alarms.cancelled).toContain(AUTO_LOCK_ALARM);
    expect(alarms.pending).toBeNull();
  });

  it('schedules nothing while locked or uninitialized', async () => {
    const { autoLock, alarms } = await setUpWallet();
    await autoLock.sync();
    expect(alarms.scheduled).toEqual([]);

    const bare = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    await new AutoLock(bare, new MemorySettingsStore(), alarms).sync();
    expect(alarms.scheduled).toEqual([]);
  });
});

// --- The alarm firing -------------------------------------------------------

describe('AutoLock.onAlarm (BUS-18)', () => {
  it('locks the wallet when the auto-lock alarm fires', async () => {
    const { keyring, autoLock } = await setUpWallet();
    await keyring.unlock(PASSWORD);
    expect((await keyring.getState()).status).toBe('unlocked');

    expect(await autoLock.onAlarm(AUTO_LOCK_ALARM)).toBe(true);
    expect((await keyring.getState()).status).toBe('locked');
  });

  it('clears the in-memory signer, so signing is refused again', async () => {
    const { keyring, autoLock } = await setUpWallet();
    await keyring.unlock(PASSWORD);

    await autoLock.onAlarm(AUTO_LOCK_ALARM);
    await expect(keyring.sign({ payload: 'x' })).rejects.toThrow('locked');
  });

  it('leaves the persisted vault intact — auto-lock is not a wipe', async () => {
    const { store, keyring, autoLock } = await setUpWallet();
    await keyring.unlock(PASSWORD);
    const before = JSON.stringify(store.vault);

    await autoLock.onAlarm(AUTO_LOCK_ALARM);

    expect(JSON.stringify(store.vault)).toBe(before);
    expect((await keyring.unlock(PASSWORD)).status).toBe('unlocked');
  });

  it('ignores alarms belonging to anything else', async () => {
    const { keyring, autoLock } = await setUpWallet();
    await keyring.unlock(PASSWORD);

    expect(await autoLock.onAlarm('some-other-alarm')).toBe(false);
    expect((await keyring.getState()).status).toBe('unlocked');
  });
});

// --- Unlock / lock over the message API -------------------------------------

describe('unlock and lock (BUS-18)', () => {
  it('unlock with the correct password makes the account usable', async () => {
    const { keyring } = await setUpWallet();

    const response = await handleKeyringRequest(services(keyring), {
      type: 'unlock',
      password: PASSWORD,
    });

    expect(response).toMatchObject({ ok: true });
    await expect(keyring.sign({ payload: 'x' })).rejects.toThrow('Epic 3'); // reached the signer
  });

  it('unlock with a wrong password leaves the wallet locked, with a generic error', async () => {
    const { keyring } = await setUpWallet();

    expect(
      await handleKeyringRequest(services(keyring), { type: 'unlock', password: 'wrong' }),
    ).toEqual({ ok: false, error: 'invalid password' });
    expect((await keyring.getState()).status).toBe('locked');
  });

  it('lock clears secrets and rejects signing again', async () => {
    const { keyring } = await setUpWallet();
    await keyring.unlock(PASSWORD);

    await handleKeyringRequest(services(keyring), { type: 'lock' });

    expect((await keyring.getState()).status).toBe('locked');
    await expect(keyring.sign({ payload: 'x' })).rejects.toThrow('locked');
  });

  it('rejects sign while locked and after auto-lock, but not while unlocked', async () => {
    const { keyring, autoLock } = await setUpWallet();

    expect(await handleKeyringRequest(services(keyring), { type: 'sign', request: {} })).toEqual({
      ok: false,
      error: 'locked',
    });

    await keyring.unlock(PASSWORD);
    const unlocked = await handleKeyringRequest(services(keyring), { type: 'sign', request: {} });
    // Reaches the signer — real signing is Epic 3, so it reports that instead of 'locked'.
    expect(unlocked).toEqual({ ok: false, error: 'signing not implemented yet (Epic 3)' });

    await autoLock.onAlarm(AUTO_LOCK_ALARM);
    expect(await handleKeyringRequest(services(keyring), { type: 'sign', request: {} })).toEqual({
      ok: false,
      error: 'locked',
    });
  });

  it('keeps account metadata visible while locked, so the unlock screen has a label', async () => {
    const { keyring } = await setUpWallet();
    const state = await keyring.getState();

    expect(state.status).toBe('locked');
    expect(state.accounts[0]?.address).toMatch(/^bze1/u);
  });
});

// --- Settings over the message API ------------------------------------------

describe('settings over the message API (BUS-18)', () => {
  it('reports the default timeout before anything is configured', async () => {
    const { keyring, settings } = await setUpWallet();

    expect(
      await handleKeyringRequest(services(keyring, settings), { type: 'getSettings' }),
    ).toEqual({ ok: true, data: { autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES } });
  });

  it('persists a new timeout and applies it to the next arming', async () => {
    const { keyring, settings, autoLock, alarms } = await setUpWallet();

    await handleKeyringRequest(services(keyring, settings), {
      type: 'setAutoLockMinutes',
      minutes: 2,
    });
    await keyring.unlock(PASSWORD);
    await autoLock.sync();

    expect(settings.settings.autoLockMinutes).toBe(2);
    expect(alarms.lastDelay).toBe(2);
  });

  it('rejects an out-of-range timeout without changing the stored value', async () => {
    const { keyring, settings } = await setUpWallet();

    const response = await handleKeyringRequest(services(keyring, settings), {
      type: 'setAutoLockMinutes',
      minutes: 0,
    });

    expect(response.ok).toBe(false);
    expect(settings.settings.autoLockMinutes).toBe(DEFAULT_AUTO_LOCK_MINUTES);
  });
});
