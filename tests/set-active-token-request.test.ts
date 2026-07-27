/**
 * `setActiveToken` routing (BUS-35): a deliberate user switch persists the
 * chosen denom as the new sticky active token, so the wallet reopens on it. The
 * write goes through the same settings store as the first-received bootstrap, so
 * it survives popup reopen and lock/unlock (settings live outside the vault).
 */

import { describe, expect, it } from 'vitest';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { DEFAULT_AUTO_LOCK_MINUTES } from '../src/keyring/settings';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import { FakeBalanceService, MemorySettingsStore, services } from './support/services';

const PASSWORD = 'correct horse battery staple';

class MemoryStore implements VaultStore {
  vault: EncryptedVault | null = null;
  load = async (): Promise<EncryptedVault | null> => this.vault;
  save = async (vault: EncryptedVault): Promise<void> => {
    this.vault = sanitizeVault(vault);
  };
  clear = async (): Promise<void> => {
    this.vault = null;
  };
}

async function keyringWithAccount(): Promise<Keyring> {
  const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
  await keyring.createAccount(PASSWORD);
  return keyring;
}

describe('setActiveToken request (BUS-35)', () => {
  it('persists the chosen denom and reports it back as the active token', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore();

    const response = await handleKeyringRequest(services(keyring, settings), {
      type: 'setActiveToken',
      denom: 'factory/bze1abc/xyz',
    });

    expect(response).toEqual({ ok: true, data: { denom: 'factory/bze1abc/xyz' } });
    expect(settings.settings.activeTokenDenom).toBe('factory/bze1abc/xyz');
  });

  it('replaces a previously-chosen active token (a switch, not an append)', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      activeTokenDenom: 'ubze',
      tokenSwitchingEnabled: false,
    });

    await handleKeyringRequest(services(keyring, settings), {
      type: 'setActiveToken',
      denom: 'factory/bze1abc/xyz',
    });

    expect(settings.settings.activeTokenDenom).toBe('factory/bze1abc/xyz');
  });

  it('keeps other settings intact — a switch must not reset the auto-lock timeout', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore({
      autoLockMinutes: 5,
      activeTokenDenom: null,
      tokenSwitchingEnabled: false,
    });

    await handleKeyringRequest(services(keyring, settings), {
      type: 'setActiveToken',
      denom: 'ubze',
    });

    expect(settings.settings).toEqual({
      autoLockMinutes: 5,
      activeTokenDenom: 'ubze',
      tokenSwitchingEnabled: false,
    });
  });

  it('is sticky once set: getActiveToken returns it without a balance query', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore();
    // Held balances start with ubze, but the deliberate switch below must win.
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, [
      { denom: 'ubze', amount: '1000000' },
    ]);

    await handleKeyringRequest(services(keyring, settings, balance), {
      type: 'setActiveToken',
      denom: 'factory/bze1abc/xyz',
    });
    const active = await handleKeyringRequest(services(keyring, settings, balance), {
      type: 'getActiveToken',
    });

    expect(active).toEqual({ ok: true, data: { denom: 'factory/bze1abc/xyz' } });
    // Stored choice wins — balances are never queried to override a switch.
    expect(balance.allQueriedAddress).toBeNull();
  });

  it('rejects an empty denom as the error envelope, leaving the choice unchanged', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      activeTokenDenom: 'ubze',
      tokenSwitchingEnabled: false,
    });

    const response = await handleKeyringRequest(services(keyring, settings), {
      type: 'setActiveToken',
      denom: '',
    });

    expect(response.ok).toBe(false);
    expect(settings.settings.activeTokenDenom).toBe('ubze');
  });
});
