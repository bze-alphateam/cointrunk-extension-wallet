/**
 * `ChromeSettingsStore` over a fake `chrome.storage.local` (BUS-18): the
 * settings blob is separate from the vault and carries only known fields. The
 * sticky active-token denom (BUS-34) and the token-switching toggle (BUS-36)
 * ride alongside the auto-lock timeout, each field recovering independently from
 * corrupt storage.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  ChromeSettingsStore,
  DEFAULT_AUTO_LOCK_MINUTES,
  SETTINGS_STORAGE_KEY,
  type WalletSettings,
} from '../src/keyring/settings';
import { VAULT_STORAGE_KEY } from '../src/keyring/storage';

function installFakeChromeStorage(): Record<string, unknown> {
  const backing: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => (key in backing ? { [key]: backing[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          Object.assign(backing, items);
        },
        remove: async (key: string) => {
          delete backing[key];
        },
      },
    },
  };
  return backing;
}

/** A full settings object with the given overrides — keeps the tests terse. */
function settings(overrides: Partial<WalletSettings> = {}): WalletSettings {
  return {
    autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    activeTokenDenom: null,
    tokenSwitchingEnabled: false,
    ...overrides,
  };
}

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe('ChromeSettingsStore (BUS-18)', () => {
  it('returns the defaults when nothing has been stored', async () => {
    installFakeChromeStorage();
    expect(await new ChromeSettingsStore().load()).toEqual(settings());
  });

  it('round-trips a saved timeout', async () => {
    installFakeChromeStorage();
    const store = new ChromeSettingsStore();
    await store.save(settings({ autoLockMinutes: 7 }));
    expect(await store.load()).toEqual(settings({ autoLockMinutes: 7 }));
  });

  it('writes only known fields — anything attached to the object is dropped', async () => {
    const backing = installFakeChromeStorage();
    const leaky = {
      ...settings({ autoLockMinutes: 7 }),
      password: 'hunter2',
    } as unknown as WalletSettings;

    await new ChromeSettingsStore().save(leaky);

    expect(backing[SETTINGS_STORAGE_KEY]).toEqual(settings({ autoLockMinutes: 7 }));
  });

  it('refuses to persist an invalid timeout', async () => {
    const backing = installFakeChromeStorage();
    await expect(
      new ChromeSettingsStore().save(settings({ autoLockMinutes: 0 })),
    ).rejects.toThrow();
    expect(backing[SETTINGS_STORAGE_KEY]).toBeUndefined();
  });

  it('lives under its own key, so a settings write cannot touch the vault', async () => {
    const backing = installFakeChromeStorage();
    backing[VAULT_STORAGE_KEY] = { version: 1, ciphertext: 'blob' };

    await new ChromeSettingsStore().save(settings({ autoLockMinutes: 30 }));

    expect(SETTINGS_STORAGE_KEY).not.toBe(VAULT_STORAGE_KEY);
    expect(backing[VAULT_STORAGE_KEY]).toEqual({ version: 1, ciphertext: 'blob' });
  });

  it('recovers to the defaults if the stored settings are corrupt', async () => {
    const backing = installFakeChromeStorage();
    backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 'whenever' };

    expect(await new ChromeSettingsStore().load()).toEqual(settings());
  });

  describe('sticky active-token denom (BUS-34)', () => {
    it('round-trips a saved active-token denom', async () => {
      installFakeChromeStorage();
      const store = new ChromeSettingsStore();
      await store.save(settings({ autoLockMinutes: 15, activeTokenDenom: 'ubze' }));
      expect(await store.load()).toEqual(settings({ autoLockMinutes: 15, activeTokenDenom: 'ubze' }));
    });

    it('normalises an empty or malformed stored denom to null', async () => {
      const backing = installFakeChromeStorage();
      backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 15, activeTokenDenom: '' };
      expect((await new ChromeSettingsStore().load()).activeTokenDenom).toBeNull();

      backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 15, activeTokenDenom: 42 };
      expect((await new ChromeSettingsStore().load()).activeTokenDenom).toBeNull();
    });

    it('recovers each field independently — a corrupt timeout keeps the denom', async () => {
      const backing = installFakeChromeStorage();
      backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 'whenever', activeTokenDenom: 'ubze' };

      expect(await new ChromeSettingsStore().load()).toEqual(
        settings({ activeTokenDenom: 'ubze' }),
      );
    });
  });

  describe('token-switching toggle (BUS-36)', () => {
    it('defaults to off when nothing has been stored', async () => {
      installFakeChromeStorage();
      expect((await new ChromeSettingsStore().load()).tokenSwitchingEnabled).toBe(false);
    });

    it('round-trips the toggle without disturbing the other fields', async () => {
      installFakeChromeStorage();
      const store = new ChromeSettingsStore();
      await store.save(settings({ autoLockMinutes: 20, tokenSwitchingEnabled: true }));
      expect(await store.load()).toEqual(
        settings({ autoLockMinutes: 20, tokenSwitchingEnabled: true }),
      );
    });

    it('coerces a non-boolean stored flag to off (fail-safe, no accidental switcher)', async () => {
      const backing = installFakeChromeStorage();
      backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 15, tokenSwitchingEnabled: 'yes' };
      expect((await new ChromeSettingsStore().load()).tokenSwitchingEnabled).toBe(false);

      backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 15, tokenSwitchingEnabled: 1 };
      expect((await new ChromeSettingsStore().load()).tokenSwitchingEnabled).toBe(false);
    });

    it('recovers the toggle independently — a corrupt timeout keeps it on', async () => {
      const backing = installFakeChromeStorage();
      backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 'whenever', tokenSwitchingEnabled: true };

      expect(await new ChromeSettingsStore().load()).toEqual(
        settings({ tokenSwitchingEnabled: true }),
      );
    });
  });
});
