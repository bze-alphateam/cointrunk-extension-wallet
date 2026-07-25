/**
 * `send` routing (BUS-22): the popup asks to send to a recipient for an amount;
 * the background resolves the active account as the sender, re-validates the
 * recipient, and delegates to the `TransactionService`. The popup never names
 * the sending address, so it cannot spend from an arbitrary account.
 */

import { describe, expect, it } from 'vitest';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import { FakeTransactionService, services } from './support/services';

const PASSWORD = 'correct horse battery staple';
const RECIPIENT = 'bze1qv9pzxqlyckngw6zf9g9whn9d3eh4qvgvn4pp9';

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

describe('send request (BUS-22)', () => {
  it('broadcasts from the active account and returns the tx hash', async () => {
    const { keyring, address } = await keyringWithAccount();
    const transactions = new FakeTransactionService({ hash: 'ABC123' });

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      {
        type: 'send',
        request: { toAddress: RECIPIENT, amount: '1000000' },
      },
    );

    expect(response).toEqual({ ok: true, data: { hash: 'ABC123' } });
    // The sender is the active account — supplied by the background, not the popup.
    expect(transactions.lastParams).toEqual({
      from: address,
      toAddress: RECIPIENT,
      amount: '1000000',
    });
  });

  it('rejects an invalid recipient before the service is ever called', async () => {
    const { keyring } = await keyringWithAccount();
    const transactions = new FakeTransactionService({ hash: 'NOPE' });

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      {
        type: 'send',
        request: { toAddress: 'cosmos1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg3he2nj', amount: '1000000' },
      },
    );

    expect(response.ok).toBe(false);
    expect(transactions.lastParams).toBeNull();
  });

  it('fails cleanly when there is no account yet — the service is never called', async () => {
    const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    const transactions = new FakeTransactionService({ hash: 'NOPE' });

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      {
        type: 'send',
        request: { toAddress: RECIPIENT, amount: '1000000' },
      },
    );

    expect(response.ok).toBe(false);
    expect(transactions.lastParams).toBeNull();
  });

  it('surfaces a broadcast failure as the error envelope, not a throw', async () => {
    const { keyring } = await keyringWithAccount();
    const transactions = new FakeTransactionService(new Error('Sending is unavailable right now.'));

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      {
        type: 'send',
        request: { toAddress: RECIPIENT, amount: '1000000' },
      },
    );

    expect(response).toEqual({ ok: false, error: 'Sending is unavailable right now.' });
  });
});
