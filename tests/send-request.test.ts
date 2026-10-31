/**
 * `quoteSend` / `send` routing (BUS-22, BUS-51): the popup asks to send to a
 * recipient for an amount of the token it showed; the background resolves the
 * active account as the sender and the active token as the denom, re-validates
 * the recipient and amount, and delegates to the `TransactionService`. The
 * popup never names the sending address or (beyond a must-match check) the
 * denom, so it cannot spend from an arbitrary account or token.
 */

import { describe, expect, it } from 'vitest';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import {
  FakeTransactionService,
  MemorySettingsStore,
  QUOTED_FEE,
  services,
} from './support/services';

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

const SEND = { toAddress: RECIPIENT, amount: '1000000', denom: 'ubze' };

describe('send request (BUS-22, BUS-51)', () => {
  it('broadcasts from the active account with the confirmed fee and returns the tx hash', async () => {
    const { keyring, address } = await keyringWithAccount();
    const transactions = new FakeTransactionService({ hash: 'ABC123' });

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      { type: 'send', request: { ...SEND, fee: QUOTED_FEE } },
    );

    expect(response).toEqual({ ok: true, data: { hash: 'ABC123' } });
    // The sender is the active account — supplied by the background, not the popup.
    expect(transactions.lastParams).toEqual({
      from: address,
      toAddress: RECIPIENT,
      amount: '1000000',
      denom: 'ubze',
    });
    expect(transactions.lastFee).toEqual(QUOTED_FEE);
  });

  it('quotes the fee for the active token', async () => {
    const { keyring, address } = await keyringWithAccount();
    const denom = 'factory/bze1abc/uvdl';
    const settings = new MemorySettingsStore();
    await settings.save({ ...settings.settings, activeTokenDenom: denom });
    const transactions = new FakeTransactionService();

    const response = await handleKeyringRequest(
      services(keyring, settings, undefined, transactions),
      { type: 'quoteSend', request: { ...SEND, denom } },
    );

    expect(response).toEqual({ ok: true, data: { status: 'ready', fee: QUOTED_FEE } });
    expect(transactions.quotedParams).toEqual({
      from: address,
      toAddress: RECIPIENT,
      amount: '1000000',
      denom,
    });
  });

  it('refuses when the popup showed a different token than the active one', async () => {
    const { keyring } = await keyringWithAccount();
    const settings = new MemorySettingsStore();
    await settings.save({ ...settings.settings, activeTokenDenom: 'factory/bze1abc/uvdl' });
    const transactions = new FakeTransactionService();

    const response = await handleKeyringRequest(
      services(keyring, settings, undefined, transactions),
      { type: 'send', request: { ...SEND, fee: QUOTED_FEE } },
    );

    expect(response).toEqual({
      ok: false,
      error: 'The active token changed — go back and review the send again.',
    });
    expect(transactions.lastParams).toBeNull();
  });

  it('rejects an invalid recipient before the service is ever called', async () => {
    const { keyring } = await keyringWithAccount();
    const transactions = new FakeTransactionService({ hash: 'NOPE' });

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      {
        type: 'send',
        request: {
          ...SEND,
          toAddress: 'cosmos1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg3he2nj',
          fee: QUOTED_FEE,
        },
      },
    );

    expect(response.ok).toBe(false);
    expect(transactions.lastParams).toBeNull();
  });

  it('rejects a zero or malformed amount before the service is ever called', async () => {
    const { keyring } = await keyringWithAccount();
    const transactions = new FakeTransactionService();

    for (const amount of ['0', '1.5', '-3', '']) {
      const response = await handleKeyringRequest(
        services(keyring, undefined, undefined, transactions),
        { type: 'quoteSend', request: { ...SEND, amount } },
      );
      expect(response.ok).toBe(false);
    }
    expect(transactions.quotedParams).toBeNull();
  });

  it('fails cleanly when there is no account yet — the service is never called', async () => {
    const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    const transactions = new FakeTransactionService({ hash: 'NOPE' });

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      { type: 'send', request: { ...SEND, fee: QUOTED_FEE } },
    );

    expect(response.ok).toBe(false);
    expect(transactions.lastParams).toBeNull();
  });

  it('surfaces a broadcast failure as the error envelope, not a throw', async () => {
    const { keyring } = await keyringWithAccount();
    const transactions = new FakeTransactionService(new Error('Not enough funds.'));

    const response = await handleKeyringRequest(
      services(keyring, undefined, undefined, transactions),
      { type: 'send', request: { ...SEND, fee: QUOTED_FEE } },
    );

    expect(response).toEqual({ ok: false, error: 'Not enough funds.' });
  });
});
