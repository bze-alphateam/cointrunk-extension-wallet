/**
 * `getBalance` routing (BUS-19): the popup asks for its balance, the background
 * resolves the active account itself and delegates to the `BalanceService`. The
 * popup never names an address, so it cannot query an arbitrary one.
 */

import { describe, expect, it } from 'vitest';
import type { EncryptedVault } from '../src/keyring/vault';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import { FakeBalanceService, services } from './support/services';

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

/** A keyring with one derived account, ready to answer `getBalance`. */
async function keyringWithAccount(): Promise<{ keyring: Keyring; address: string }> {
  const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
  const [account] = (await keyring.createAccount(PASSWORD)).state.accounts;
  return { keyring, address: account!.address };
}

describe('getBalance request (BUS-19)', () => {
  it('returns the service balance, queried for the active account address', async () => {
    const { keyring, address } = await keyringWithAccount();
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '1234567' });

    const response = await handleKeyringRequest(services(keyring, undefined, balance), {
      type: 'getBalance',
    });

    expect(response).toEqual({ ok: true, data: { denom: 'ubze', amount: '1234567' } });
    expect(balance.queriedAddress).toBe(address);
  });

  it('fails cleanly when there is no account yet — the service is never called', async () => {
    const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '1' });

    const response = await handleKeyringRequest(services(keyring, undefined, balance), {
      type: 'getBalance',
    });

    expect(response.ok).toBe(false);
    expect(balance.queriedAddress).toBeNull();
  });

  it('surfaces a service failure as the error envelope, not a throw', async () => {
    const { keyring } = await keyringWithAccount();
    const balance = new FakeBalanceService(new Error('Balance is unavailable right now.'));

    const response = await handleKeyringRequest(services(keyring, undefined, balance), {
      type: 'getBalance',
    });

    expect(response).toEqual({ ok: false, error: 'Balance is unavailable right now.' });
  });
});
