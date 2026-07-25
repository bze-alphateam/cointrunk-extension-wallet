import { afterEach, describe, expect, it } from 'vitest';
import type { Signer, VaultCrypto } from '../src/keyring/crypto';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest, type KeyringRequest } from '../src/keyring/messages';
import { ChromeVaultStore, VAULT_STORAGE_KEY, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';

// A representative persisted vault: encrypted blob + non-secret metadata only.
const VAULT: EncryptedVault = {
  version: 1,
  kdf: { algo: 'pbkdf2', hash: 'SHA-256', iterations: 600000, salt: 'c2FsdA==' },
  cipher: { algo: 'aes-256-gcm', iv: 'aXYtMTItYnl0ZXM=' },
  ciphertext: 'Y2lwaGVydGV4dA==',
  accounts: [{ address: 'bze1example', hdPath: "m/44'/118'/0'/0/0", label: 'Account 1' }],
};

// --- Test doubles -----------------------------------------------------------

/** In-memory VaultStore for keyring state-machine tests. */
class MemoryStore implements VaultStore {
  constructor(private vault: EncryptedVault | null = null) {}
  load = async (): Promise<EncryptedVault | null> => this.vault;
  save = async (vault: EncryptedVault): Promise<void> => {
    this.vault = vault;
  };
  clear = async (): Promise<void> => {
    this.vault = null;
  };
}

const fakeSigner: Signer = {
  sign: async (request) => ({ signed: true, request }),
};

/** Crypto that always "decrypts" — stands in for BUS-17 with a correct password. */
const okCrypto: VaultCrypto = { decrypt: async () => fakeSigner };

/** Crypto that rejects — stands in for a wrong password / tampered blob. */
const rejectCrypto: VaultCrypto = {
  decrypt: async () => {
    throw new Error('bad password');
  },
};

/** Install a promise-based fake `chrome.storage.local` backed by a plain object. */
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

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

// --- Storage layer: no plaintext ever written (AC2) -------------------------

describe('ChromeVaultStore', () => {
  it('persists only the whitelisted vault fields — never attached secrets', async () => {
    const backing = installFakeChromeStorage();
    const store = new ChromeVaultStore();

    // A caller accidentally hands over an object with secret material attached.
    const leaky = {
      ...VAULT,
      mnemonic: 'abandon abandon abandon abandon abandon abandon',
      privateKey: 'deadbeef',
      kdf: { ...VAULT.kdf, derivedKey: 'SECRET' },
    } as unknown as EncryptedVault;

    await store.save(leaky);

    const stored = backing[VAULT_STORAGE_KEY] as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      'accounts',
      'cipher',
      'ciphertext',
      'kdf',
      'version',
    ]);
    expect(stored).not.toHaveProperty('mnemonic');
    expect(stored).not.toHaveProperty('privateKey');
    // Nested objects are reconstructed too, so a smuggled key inside kdf is dropped.
    expect(Object.keys(stored.kdf as object).sort()).toEqual([
      'algo',
      'hash',
      'iterations',
      'salt',
    ]);
  });

  it('round-trips a saved vault', async () => {
    installFakeChromeStorage();
    const store = new ChromeVaultStore();
    await store.save(VAULT);
    expect(await store.load()).toEqual(VAULT);
  });

  it('returns null when no vault is stored', async () => {
    installFakeChromeStorage();
    expect(await new ChromeVaultStore().load()).toBeNull();
  });

  it('clear removes the vault', async () => {
    installFakeChromeStorage();
    const store = new ChromeVaultStore();
    await store.save(VAULT);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

// --- Keyring state machine (AC1) --------------------------------------------

describe('Keyring state machine', () => {
  it('is uninitialized when no vault exists', async () => {
    const keyring = new Keyring(new MemoryStore(null), okCrypto);
    expect(await keyring.getState()).toEqual({ status: 'uninitialized', accounts: [] });
  });

  it('is locked when a vault exists but nothing is unlocked', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    const state = await keyring.getState();
    expect(state.status).toBe('locked');
    expect(state.accounts).toEqual(VAULT.accounts);
  });

  it('exposes account metadata while locked', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    expect(await keyring.getAccounts()).toEqual(VAULT.accounts);
  });

  it('unlocks with a correct password and reports unlocked', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    const state = await keyring.unlock('correct horse');
    expect(state.status).toBe('unlocked');
    expect((await keyring.getState()).status).toBe('unlocked');
  });

  it('stays locked when the password is wrong', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), rejectCrypto);
    await expect(keyring.unlock('nope')).rejects.toThrow('bad password');
    expect((await keyring.getState()).status).toBe('locked');
  });

  it('rejects unlock when there is no vault', async () => {
    const keyring = new Keyring(new MemoryStore(null), okCrypto);
    await expect(keyring.unlock('whatever')).rejects.toThrow('no wallet to unlock');
  });

  it('lock() drops the signer and returns to locked', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    await keyring.unlock('correct horse');
    const state = await keyring.lock();
    expect(state.status).toBe('locked');
  });

  it('gates signing on unlock', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    await expect(keyring.sign({ payload: 'x' })).rejects.toThrow('locked');

    await keyring.unlock('correct horse');
    await expect(keyring.sign({ payload: 'x' })).resolves.toEqual({
      signed: true,
      request: { payload: 'x' },
    });
  });
});

// --- MV3 teardown: secrets die, metadata survives, wallet relocks (AC4) ------

describe('service-worker teardown', () => {
  it('respawns locked with only ciphertext + metadata persisted', async () => {
    const backing = installFakeChromeStorage();

    // Set up and unlock in the first "worker instance".
    await new ChromeVaultStore().save(VAULT);
    const before = new Keyring(new ChromeVaultStore(), okCrypto);
    await before.unlock('correct horse');
    expect((await before.getState()).status).toBe('unlocked');

    // Simulate teardown: a brand-new keyring over the same persisted storage,
    // with a fresh (empty) in-memory signer — exactly what a respawn produces.
    const after = new Keyring(new ChromeVaultStore(), okCrypto);
    const state = await after.getState();
    expect(state.status).toBe('locked');
    expect(state.accounts).toEqual(VAULT.accounts);

    // Nothing secret survived: persisted blob is only the whitelisted fields.
    const stored = backing[VAULT_STORAGE_KEY] as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      'accounts',
      'cipher',
      'ciphertext',
      'kdf',
      'version',
    ]);
  });
});

// --- Typed message API (AC3) ------------------------------------------------

describe('handleKeyringRequest', () => {
  it('answers getState', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    expect(await handleKeyringRequest(keyring, { type: 'getState' })).toEqual({
      ok: true,
      data: { status: 'locked', accounts: VAULT.accounts },
    });
  });

  it('answers unlock and lock', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    const unlocked = await handleKeyringRequest(keyring, { type: 'unlock', password: 'pw' });
    expect(unlocked).toEqual({ ok: true, data: { status: 'unlocked', accounts: VAULT.accounts } });

    const locked = await handleKeyringRequest(keyring, { type: 'lock' });
    expect(locked).toEqual({ ok: true, data: { status: 'locked', accounts: VAULT.accounts } });
  });

  it('answers getAccounts', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    expect(await handleKeyringRequest(keyring, { type: 'getAccounts' })).toEqual({
      ok: true,
      data: VAULT.accounts,
    });
  });

  it('reports a failed unlock as a non-throwing error response', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), rejectCrypto);
    expect(await handleKeyringRequest(keyring, { type: 'unlock', password: 'bad' })).toEqual({
      ok: false,
      error: 'bad password',
    });
  });

  it('reports the locked guard when signing while locked', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    expect(await handleKeyringRequest(keyring, { type: 'sign', request: {} })).toEqual({
      ok: false,
      error: 'locked',
    });
  });

  it('rejects an unknown request type', async () => {
    const keyring = new Keyring(new MemoryStore(VAULT), okCrypto);
    const response = await handleKeyringRequest(keyring, {
      type: 'bogus',
    } as unknown as KeyringRequest);
    expect(response).toEqual({ ok: false, error: 'unknown keyring request: {"type":"bogus"}' });
  });
});
