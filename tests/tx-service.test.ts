/**
 * Local signing + broadcast of a send (BUS-51), through the public API only: a
 * real keyring unlocked from a fixed test mnemonic, the real
 * {@link ChainTransactionService} over {@link RestTxChain} and
 * {@link ChainClient}, and a scripted `fetch` in place of the network.
 */

import { Secp256k1, Secp256k1Signature, sha256 } from '@cosmjs/crypto';
import { fromBase64, toHex } from '@cosmjs/encoding';
import { makeSignBytes } from '@cosmjs/proto-signing';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { AuthInfo, TxBody, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { describe, expect, it } from 'vitest';
import { ChainClient } from '../src/chain/client';
import type { PoolReservesReader } from '../src/chain/liquidity';
import { ChainTransactionService, type SendParams, type TxFee } from '../src/chain/tx';
import { RestTxChain } from '../src/chain/tx-chain';
import { Keyring } from '../src/keyring/keyring';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import {
  FakeBalanceService,
  FakeFeeEligibilityService,
  FakeTokenIdentityReader,
} from './support/services';

// BIP39 test vector — a fixed, public mnemonic: never fund its addresses.
const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PASSWORD = 'correct horse battery staple';
const RECIPIENT = 'bze1qv9pzxqlyckngw6zf9g9whn9d3eh4qvgvn4pp9';
const TOKEN = 'factory/bze1abc/uvdl';
const ENDPOINTS = { rest: ['https://rest-a.example', 'https://rest-b.example'], rpc: [] };

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

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

type Handler = (body: unknown) => Response | Error;

interface Network {
  chainId?: string;
  simulate?: Handler;
  /** One handler per broadcast attempt, in order. */
  broadcasts?: Handler[];
}

/** A scripted node: answers the tx routes and records every request. */
function fakeNetwork(network: Network = {}) {
  const requests: { url: string; body: unknown }[] = [];
  const broadcasts = [...(network.broadcasts ?? [accept()])];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url, body });
    const path = new URL(url).pathname;
    let result: Response | Error;
    if (path === '/cosmos/base/tendermint/v1beta1/node_info') {
      result = json({ default_node_info: { network: network.chainId ?? 'beezee-1' } });
    } else if (path.startsWith('/cosmos/auth/v1beta1/accounts/')) {
      result = json({ account: { account_number: '7', sequence: '3' } });
    } else if (path === '/bze/txfeecollector/params') {
      result = json({ params: { ValidatorMinGasFee: { denom: 'ubze', amount: '0.01' } } });
    } else if (path === '/cosmos/tx/v1beta1/simulate') {
      result = (network.simulate ?? (() => json({ gas_info: { gas_used: '100000' } })))(body);
    } else if (path === '/cosmos/tx/v1beta1/txs') {
      const next = broadcasts.shift();
      result = next ? next(body) : new Error('unexpected broadcast');
    } else {
      result = json({ code: 5, message: 'not found' }, 404);
    }
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }) as typeof fetch;

  const broadcastBodies = () =>
    requests.filter((r) => r.url.endsWith('/cosmos/tx/v1beta1/txs')).map((r) => r.body);
  return { fetchFn, requests, broadcastBodies };
}

function txHashOf(body: unknown): string {
  return toHex(sha256(fromBase64((body as { tx_bytes: string }).tx_bytes))).toUpperCase();
}

/** A broadcast handler: CheckTx accepted, echoing the real hash of the bytes. */
function accept(): Handler {
  return (body) => json({ tx_response: { code: 0, codespace: '', txhash: txHashOf(body) } });
}

function reject(code: number, codespace = 'sdk'): Handler {
  return (body) =>
    json({ tx_response: { code, codespace, txhash: txHashOf(body), raw_log: 'nope' } });
}

const fixedReserves: PoolReservesReader = {
  getNativeReserves: async () => ({ native: 1_000_000n, token: 500_000n }),
};

async function setUp(
  network: Network = {},
  balances = [
    { denom: 'ubze', amount: '50000000' },
    { denom: TOKEN, amount: '9000000' },
  ],
) {
  const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
  const [account] = await keyring.importAccount(MNEMONIC, PASSWORD).then((s) => s.accounts);
  const net = fakeNetwork(network);
  const service = new ChainTransactionService({
    chain: new RestTxChain(new ChainClient({ endpoints: ENDPOINTS, fetchFn: net.fetchFn })),
    signer: keyring,
    balances: new FakeBalanceService(undefined, balances),
    feeEligibility: new FakeFeeEligibilityService({ eligible: true }),
    reserves: fixedReserves,
    tokens: new FakeTokenIdentityReader({
      [TOKEN]: { denom: TOKEN, name: 'Vidulum', symbol: 'VDL', decimals: 6, logoUri: null },
    }),
  });
  const params: SendParams = {
    from: account!.address,
    toAddress: RECIPIENT,
    amount: '1000000',
    denom: 'ubze',
  };
  return { keyring, service, net, params };
}

const FEE: TxFee = { amount: '1300', denom: 'ubze', gas: '130000' };

describe('ChainTransactionService.quote (BUS-51)', () => {
  it('simulates, adds 30% gas and quotes the BZE fee', async () => {
    const { service, params, net } = await setUp();

    await expect(service.quote(params)).resolves.toEqual({ status: 'ready', fee: FEE });
    expect(net.broadcastBodies()).toEqual([]); // a quote never broadcasts
  });

  it('falls back to the fixed 200k gas when simulation fails', async () => {
    const { service, params } = await setUp({ simulate: () => json({ code: 3 }, 400) });

    await expect(service.quote(params)).resolves.toEqual({
      status: 'ready',
      fee: { amount: '2000', denom: 'ubze', gas: '200000' },
    });
  });

  it('quotes a token fee when there is no BZE for it and the token is fee-eligible', async () => {
    const { service, params } = await setUp({}, [{ denom: TOKEN, amount: '9000000' }]);

    // 1,300 ubze at 2 ubze per token unit = 650, ×1.1 = 715.
    await expect(service.quote({ ...params, denom: TOKEN })).resolves.toEqual({
      status: 'ready',
      fee: { amount: '715', denom: TOKEN, gas: '130000' },
    });
  });

  it('is refused while locked', async () => {
    const { service, params, keyring } = await setUp();
    await keyring.lock();

    await expect(service.quote(params)).rejects.toThrow('locked');
  });
});

describe('ChainTransactionService.send (BUS-51)', () => {
  it('signs a MsgSend locally (SIGN_MODE_DIRECT) and returns the real tx hash', async () => {
    const { service, params, net, keyring } = await setUp();

    const { hash } = await service.send(params, FEE);

    const [body] = net.broadcastBodies() as [{ tx_bytes: string; mode: string }];
    expect(body.mode).toBe('BROADCAST_MODE_SYNC');
    expect(hash).toBe(txHashOf(body));
    expect(hash).toMatch(/^[0-9A-F]{64}$/u);

    const raw = TxRaw.decode(fromBase64(body.tx_bytes));
    const txBody = TxBody.decode(raw.bodyBytes);
    expect(txBody.memo).toBe('');
    expect(txBody.messages).toHaveLength(1);
    expect(txBody.messages[0]!.typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect(MsgSend.decode(txBody.messages[0]!.value)).toEqual({
      fromAddress: params.from,
      toAddress: RECIPIENT,
      amount: [{ denom: 'ubze', amount: '1000000' }],
    });

    const authInfo = AuthInfo.decode(raw.authInfoBytes);
    expect(authInfo.fee?.amount).toEqual([{ denom: 'ubze', amount: '1300' }]);
    expect(authInfo.fee?.gasLimit).toBe(130000n);
    expect(authInfo.signerInfos[0]?.sequence).toBe(3n);

    // The signature verifies with the account's key over the mainnet sign doc.
    const signBytes = makeSignBytes({
      bodyBytes: raw.bodyBytes,
      authInfoBytes: raw.authInfoBytes,
      chainId: 'beezee-1',
      accountNumber: 7n,
    });
    const valid = Secp256k1.verifySignature(
      Secp256k1Signature.fromFixedLength(raw.signatures[0]!),
      sha256(signBytes),
      await keyring.getPublicKey(),
    );
    expect(valid).toBe(true);
  });

  it('sends the active token, paying the fee in it', async () => {
    const { service, params, net } = await setUp();
    const fee = { amount: '715', denom: TOKEN, gas: '130000' };

    await service.send({ ...params, denom: TOKEN }, fee);

    const [body] = net.broadcastBodies() as [{ tx_bytes: string }];
    const raw = TxRaw.decode(fromBase64(body.tx_bytes));
    const message = MsgSend.decode(TxBody.decode(raw.bodyBytes).messages[0]!.value);
    expect(message.amount).toEqual([{ denom: TOKEN, amount: '1000000' }]);
    expect(AuthInfo.decode(raw.authInfoBytes).fee?.amount).toEqual([
      { denom: TOKEN, amount: '715' },
    ]);
  });

  it('is refused while locked and after lock — nothing is broadcast', async () => {
    const { service, params, net, keyring } = await setUp();
    await keyring.lock();

    await expect(service.send(params, FEE)).rejects.toThrow('locked');
    expect(net.broadcastBodies()).toEqual([]);

    await keyring.unlock(PASSWORD);
    await expect(service.send(params, FEE)).resolves.toHaveProperty('hash');
  });

  it('refuses to sign for any chain but beezee-1', async () => {
    const { service, params, net } = await setUp({ chainId: 'beezee-testnet-9' });

    await expect(service.send(params, FEE)).rejects.toThrow('sending is refused');
    expect(net.broadcastBodies()).toEqual([]);
  });

  it('refuses a confirmed fee in a third denom, before signing', async () => {
    const { service, params, net } = await setUp();

    await expect(
      service.send(params, { amount: '1', denom: 'uatom', gas: '130000' }),
    ).rejects.toThrow('review the send again');
    expect(net.broadcastBodies()).toEqual([]);
  });

  it.each<[number, string]>([
    [5, 'Not enough funds for the amount plus the network fee.'],
    [13, 'The network fee was too low — go back and review the send again.'],
    [
      32,
      'Another transaction from this account is still being processed — wait a few seconds and try again.',
    ],
  ])('turns CheckTx code %i into a readable error', async (code, message) => {
    const { service, params } = await setUp({ broadcasts: [reject(code)] });

    await expect(service.send(params, FEE)).rejects.toThrow(message);
  });

  it('reports an unknown rejection generically, with its code', async () => {
    const { service, params } = await setUp({ broadcasts: [reject(7, 'tradebin')] });

    await expect(service.send(params, FEE)).rejects.toThrow(
      'The network rejected the transaction (tradebin code 7).',
    );
  });

  it('falls back when the first node is unreachable, and broadcasts once it answers', async () => {
    const { service, params, net } = await setUp({
      broadcasts: [() => new TypeError('fetch failed'), accept()],
    });

    await expect(service.send(params, FEE)).resolves.toHaveProperty('hash');
    expect(net.broadcastBodies()).toHaveLength(2);
  });

  it('never re-broadcasts after a node accepted the tx', async () => {
    const { service, params, net } = await setUp({ broadcasts: [accept(), accept()] });

    await service.send(params, FEE);
    expect(net.broadcastBodies()).toHaveLength(1);
  });

  it('a rejection is final too — no other node is asked', async () => {
    const { service, params, net } = await setUp({ broadcasts: [reject(5), accept()] });

    await expect(service.send(params, FEE)).rejects.toThrow('Not enough funds');
    expect(net.broadcastBodies()).toHaveLength(1);
  });

  it('a timeout is not retried elsewhere; the error names the hash to check', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const { service, params, net } = await setUp({ broadcasts: [() => timeout, accept()] });

    let message = '';
    try {
      await service.send(params, FEE);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(net.broadcastBodies()).toHaveLength(1);
    expect(message).toContain('may still go through');
    expect(message).toContain(txHashOf(net.broadcastBodies()[0]));
  });

  it('treats "already in the mempool" (code 19) as sent', async () => {
    const { service, params } = await setUp({ broadcasts: [reject(19)] });

    await expect(service.send(params, FEE)).resolves.toHaveProperty('hash');
  });
});
