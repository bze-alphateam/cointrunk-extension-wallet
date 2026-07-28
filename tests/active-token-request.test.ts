/**
 * `getActiveToken` routing (BUS-34): the background resolves the sticky active
 * token, persisting the first-received choice and never re-querying once one is
 * set. The popup only ever learns the denom (its skin follows from it).
 */

import { describe, expect, it } from 'vitest';
import type { EncryptedVault } from '../src/keyring/vault';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { DEFAULT_AUTO_LOCK_MINUTES } from '../src/keyring/settings';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
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

async function keyringWithAccount(): Promise<{ keyring: Keyring; address: string }> {
  const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
  const [account] = (await keyring.createAccount(PASSWORD)).state.accounts;
  return { keyring, address: account!.address };
}

describe('getActiveToken request (BUS-34)', () => {
  it('picks the first held token, persisting it as the sticky active token', async () => {
    const { keyring, address } = await keyringWithAccount();
    const settings = new MemorySettingsStore();
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, [
      { denom: 'ubze', amount: '1000000' },
      { denom: 'factory/bze1abc/xyz', amount: '5' },
    ]);

    const response = await handleKeyringRequest(services(keyring, settings, balance), {
      type: 'getActiveToken',
    });

    expect(response).toEqual({ ok: true, data: { denom: 'ubze' } });
    expect(balance.allQueriedAddress).toBe(address);
    expect(settings.settings.activeTokenDenom).toBe('ubze');
  });

  it('is sticky: an already-chosen token is returned without a chain read', async () => {
    const { keyring } = await keyringWithAccount();
    const settings = new MemorySettingsStore({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      activeTokenDenom: 'factory/bze1abc/xyz',
      tokenSwitchingEnabled: false,
    });
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, [
      { denom: 'ubze', amount: '1000000' },
    ]);

    const response = await handleKeyringRequest(services(keyring, settings, balance), {
      type: 'getActiveToken',
    });

    expect(response).toEqual({ ok: true, data: { denom: 'factory/bze1abc/xyz' } });
    // Stored choice wins — balances are never queried, so nothing can override it.
    expect(balance.allQueriedAddress).toBeNull();
  });

  it('resolves to null for a brand-new account that holds nothing', async () => {
    const { keyring } = await keyringWithAccount();
    const settings = new MemorySettingsStore();
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, []);

    const response = await handleKeyringRequest(services(keyring, settings, balance), {
      type: 'getActiveToken',
    });

    expect(response).toEqual({ ok: true, data: { denom: null } });
    // Nothing held → nothing chosen → nothing persisted (stays neutral default).
    expect(settings.settings.activeTokenDenom).toBeNull();
  });

  it('resolves to null before there is an account — the balance is never queried', async () => {
    const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, [
      { denom: 'ubze', amount: '1' },
    ]);

    const response = await handleKeyringRequest(services(keyring, undefined, balance), {
      type: 'getActiveToken',
    });

    expect(response).toEqual({ ok: true, data: { denom: null } });
    expect(balance.allQueriedAddress).toBeNull();
  });

  it('surfaces a balance-service failure as the error envelope, not a throw', async () => {
    const { keyring } = await keyringWithAccount();
    const balance = new FakeBalanceService(
      { denom: 'ubze', amount: '0' },
      new Error('Balances are unavailable right now.'),
    );

    const response = await handleKeyringRequest(services(keyring, undefined, balance), {
      type: 'getActiveToken',
    });

    expect(response).toEqual({ ok: false, error: 'Balances are unavailable right now.' });
  });
});
