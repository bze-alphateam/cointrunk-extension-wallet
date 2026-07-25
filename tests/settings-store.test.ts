/**
 * `ChromeSettingsStore` over a fake `chrome.storage.local` (BUS-18): the
 * settings blob is separate from the vault and carries only known fields.
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

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe('ChromeSettingsStore (BUS-18)', () => {
  it('returns the default timeout when nothing has been stored', async () => {
    installFakeChromeStorage();
    expect(await new ChromeSettingsStore().load()).toEqual({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    });
  });

  it('round-trips a saved timeout', async () => {
    installFakeChromeStorage();
    const store = new ChromeSettingsStore();
    await store.save({ autoLockMinutes: 7 });
    expect(await store.load()).toEqual({ autoLockMinutes: 7 });
  });

  it('writes only known fields — anything attached to the object is dropped', async () => {
    const backing = installFakeChromeStorage();
    const leaky = { autoLockMinutes: 7, password: 'hunter2' } as unknown as WalletSettings;

    await new ChromeSettingsStore().save(leaky);

    expect(backing[SETTINGS_STORAGE_KEY]).toEqual({ autoLockMinutes: 7 });
  });

  it('refuses to persist an invalid timeout', async () => {
    const backing = installFakeChromeStorage();
    await expect(new ChromeSettingsStore().save({ autoLockMinutes: 0 })).rejects.toThrow();
    expect(backing[SETTINGS_STORAGE_KEY]).toBeUndefined();
  });

  it('lives under its own key, so a settings write cannot touch the vault', async () => {
    const backing = installFakeChromeStorage();
    backing[VAULT_STORAGE_KEY] = { version: 1, ciphertext: 'blob' };

    await new ChromeSettingsStore().save({ autoLockMinutes: 30 });

    expect(SETTINGS_STORAGE_KEY).not.toBe(VAULT_STORAGE_KEY);
    expect(backing[VAULT_STORAGE_KEY]).toEqual({ version: 1, ciphertext: 'blob' });
  });

  it('recovers to the default if the stored settings are corrupt', async () => {
    const backing = installFakeChromeStorage();
    backing[SETTINGS_STORAGE_KEY] = { autoLockMinutes: 'whenever' };

    expect(await new ChromeSettingsStore().load()).toEqual({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    });
  });
});
