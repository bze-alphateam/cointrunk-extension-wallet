/**
 * `getHeldTokens` routing (BUS-37): the background resolves the active account,
 * lists its held balances, and joins each with its (cached) chain identity so the
 * switcher can render a name/logo per token. The popup never names an address.
 */

import { describe, expect, it } from 'vitest';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import { FakeBalanceService, FakeTokenIdentityReader, services } from './support/services';

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

describe('getHeldTokens request (BUS-37)', () => {
  it('lists held balances joined with their chain identities', async () => {
    const { keyring, address } = await keyringWithAccount();
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, [
      { denom: 'ubze', amount: '1000000' },
      { denom: 'factory/bze1abc/xyz', amount: '5' },
    ]);
    const tokens = new FakeTokenIdentityReader({
      ubze: { denom: 'ubze', name: 'BeeZee', symbol: 'BZE', decimals: 6, logoUri: null },
      'factory/bze1abc/xyz': {
        denom: 'factory/bze1abc/xyz',
        name: 'Vidulum',
        symbol: 'VDL',
        decimals: 6,
        logoUri: null,
      },
    });

    const response = await handleKeyringRequest(
      services(keyring, undefined, balance, undefined, undefined, tokens),
      { type: 'getHeldTokens' },
    );

    expect(response).toEqual({
      ok: true,
      data: [
        {
          denom: 'ubze',
          amount: '1000000',
          identity: { denom: 'ubze', name: 'BeeZee', symbol: 'BZE', decimals: 6, logoUri: null },
        },
        {
          denom: 'factory/bze1abc/xyz',
          amount: '5',
          identity: {
            denom: 'factory/bze1abc/xyz',
            name: 'Vidulum',
            symbol: 'VDL',
            decimals: 6,
            logoUri: null,
          },
        },
      ],
    });
    expect(balance.allQueriedAddress).toBe(address);
  });

  it('returns an empty list when there is no account (never queries balances)', async () => {
    const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, [
      { denom: 'ubze', amount: '1' },
    ]);

    const response = await handleKeyringRequest(
      services(keyring, undefined, balance),
      { type: 'getHeldTokens' },
    );

    expect(response).toEqual({ ok: true, data: [] });
    expect(balance.allQueriedAddress).toBeNull();
  });

  it('returns an empty list for an account holding nothing', async () => {
    const { keyring } = await keyringWithAccount();
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, []);

    const response = await handleKeyringRequest(
      services(keyring, undefined, balance),
      { type: 'getHeldTokens' },
    );

    expect(response).toEqual({ ok: true, data: [] });
  });

  it('surfaces a balance-service failure as the error envelope, not a throw', async () => {
    const { keyring } = await keyringWithAccount();
    const balance = new FakeBalanceService(
      { denom: 'ubze', amount: '0' },
      new Error('Balances are unavailable right now.'),
    );

    const response = await handleKeyringRequest(
      services(keyring, undefined, balance),
      { type: 'getHeldTokens' },
    );

    expect(response).toEqual({ ok: false, error: 'Balances are unavailable right now.' });
  });
});
