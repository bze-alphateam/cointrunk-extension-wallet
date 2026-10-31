/**
 * The chain reads and writes a send needs (BUS-51), over the node REST API.
 *
 * {@link TxChain} is the seam {@link ./tx.ChainTransactionService} depends on;
 * {@link RestTxChain} implements it on any {@link RestTransport} (in production
 * the shared {@link ./client.ChainClient}, so every call gets endpoint fallback).
 *
 * Routes and response shapes, checked against rest.getbze.com (2026-10-31):
 *
 *     GET  /cosmos/base/tendermint/v1beta1/node_info
 *       { default_node_info: { network: "beezee-1", … }, … }
 *     GET  /cosmos/auth/v1beta1/accounts/{address}
 *       { account: { "@type": ".../BaseAccount", account_number: "11592", sequence: "276", … } }
 *       404 { code: 5, message: "account … not found" } for an address the chain never saw
 *     GET  /bze/txfeecollector/params
 *       { params: { ValidatorMinGasFee: { denom: "ubze", amount: "0.010000000000000000" }, … } }
 *     POST /cosmos/tx/v1beta1/simulate  { tx_bytes }       → { gas_info: { gas_used }, … }
 *     POST /cosmos/tx/v1beta1/txs       { tx_bytes, mode } → { tx_response: { code, txhash, codespace, raw_log } }
 *       a CheckTx rejection is HTTP 200 with a non-zero `code`.
 *
 * The chain id and the gas price change only through a chain upgrade or a
 * governance vote, so both are cached for the worker's lifetime (the gas price
 * for an hour). Account number and sequence are read fresh for every tx.
 */

import { toBase64 } from '@cosmjs/encoding';
import { ChainQueryError, type RestTransport } from './client';
import { BZE_BASE_DENOM } from './constants';
import { parseDecimal, type Rational } from './send-fee';

/** Account number and sequence, the two values a sign doc needs from the chain. */
export interface AccountInfo {
  readonly accountNumber: bigint;
  readonly sequence: bigint;
}

/** What a node answered to a broadcast. `code` 0 means CheckTx accepted it. */
export interface BroadcastResult {
  readonly code: number;
  readonly codespace: string;
  readonly txhash: string;
  readonly rawLog: string;
}

/** The chain operations a send needs. */
export interface TxChain {
  /** The node's chain id (`beezee-1` on mainnet). */
  getChainId(): Promise<string>;
  getAccount(address: string): Promise<AccountInfo>;
  /** The minimum gas price, in `ubze` per gas. */
  getMinGasPrice(): Promise<Rational>;
  /** Simulate a tx and return the gas it used. */
  simulate(txBytes: Uint8Array): Promise<bigint>;
  /** Broadcast a signed tx in sync mode (CheckTx only). */
  broadcast(txBytes: Uint8Array): Promise<BroadcastResult>;
}

/** Used when `/bze/txfeecollector/params` can't be read: the chain default. */
export const FALLBACK_MIN_GAS_PRICE: Rational = { num: 1n, den: 100n };

const MIN_GAS_PRICE_TTL_MS = 60 * 60 * 1000;

/** Thrown when an address has no account on chain (never received anything). */
export const NO_ACCOUNT_MESSAGE =
  'This account has no funds on the BeeZee network yet, so there is nothing to send.';

export interface RestTxChainOptions {
  /** Clock source for the gas-price cache; injected in tests. */
  readonly now?: () => number;
}

export class RestTxChain implements TxChain {
  private chainId: Promise<string> | null = null;
  private gasPrice: { readonly value: Rational; readonly storedAt: number } | null = null;
  private readonly now: () => number;

  constructor(
    private readonly rest: RestTransport,
    options: RestTxChainOptions = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  getChainId(): Promise<string> {
    if (this.chainId === null) {
      const read = this.rest.getRest('/cosmos/base/tendermint/v1beta1/node_info').then((body) => {
        const network = (body as { default_node_info?: { network?: unknown } } | null)
          ?.default_node_info?.network;
        if (typeof network !== 'string' || network.length === 0) {
          throw new Error(`malformed node_info response: ${JSON.stringify(body)}`);
        }
        return network;
      });
      // A failed read is not cached: the next send asks again.
      this.chainId = read.catch((error: unknown) => {
        this.chainId = null;
        throw error;
      });
    }
    return this.chainId;
  }

  async getAccount(address: string): Promise<AccountInfo> {
    let body: unknown;
    try {
      body = await this.rest.getRest(
        `/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`,
      );
    } catch (error) {
      if (error instanceof ChainQueryError && error.status === 404) {
        throw new Error(NO_ACCOUNT_MESSAGE, { cause: error });
      }
      throw error;
    }
    return parseAccount((body as { account?: unknown } | null)?.account);
  }

  async getMinGasPrice(): Promise<Rational> {
    const cached = this.gasPrice;
    if (cached !== null && this.now() - cached.storedAt < MIN_GAS_PRICE_TTL_MS) {
      return cached.value;
    }
    let value: Rational;
    try {
      value = parseMinGasPrice(await this.rest.getRest('/bze/txfeecollector/params'));
    } catch {
      // The chain default; a stale cached value is better still when there is one.
      return cached?.value ?? FALLBACK_MIN_GAS_PRICE;
    }
    this.gasPrice = { value, storedAt: this.now() };
    return value;
  }

  async simulate(txBytes: Uint8Array): Promise<bigint> {
    const body = await this.rest.postRest('/cosmos/tx/v1beta1/simulate', {
      tx_bytes: toBase64(txBytes),
    });
    const used = (body as { gas_info?: { gas_used?: unknown } } | null)?.gas_info?.gas_used;
    if (typeof used !== 'string' || !/^\d+$/u.test(used)) {
      throw new Error(`malformed simulate response: ${JSON.stringify(body)}`);
    }
    return BigInt(used);
  }

  async broadcast(txBytes: Uint8Array): Promise<BroadcastResult> {
    const body = await this.rest.broadcastRest('/cosmos/tx/v1beta1/txs', {
      tx_bytes: toBase64(txBytes),
      mode: 'BROADCAST_MODE_SYNC',
    });
    const response = (body as { tx_response?: Record<string, unknown> } | null)?.tx_response;
    const code = response?.['code'];
    const txhash = response?.['txhash'];
    if (typeof code !== 'number' || typeof txhash !== 'string') {
      throw new Error(`malformed broadcast response: ${JSON.stringify(body)}`);
    }
    const codespace = response?.['codespace'];
    const rawLog = response?.['raw_log'];
    return {
      code,
      txhash,
      codespace: typeof codespace === 'string' ? codespace : '',
      rawLog: typeof rawLog === 'string' ? rawLog : '',
    };
  }
}

/**
 * Read account number and sequence from a `BaseAccount`, or from one nested in
 * a wrapper type (vesting accounts carry it under `base_vesting_account.base_account`).
 */
function parseAccount(account: unknown, depth = 0): AccountInfo {
  if (typeof account !== 'object' || account === null || depth > 3) {
    throw new Error('malformed account response');
  }
  const raw = account as Record<string, unknown>;
  const number = raw['account_number'];
  const sequence = raw['sequence'];
  if (typeof number === 'string' && /^\d+$/u.test(number)) {
    const seq = typeof sequence === 'string' && /^\d+$/u.test(sequence) ? sequence : '0';
    return { accountNumber: BigInt(number), sequence: BigInt(seq) };
  }
  const nested = raw['base_account'] ?? raw['base_vesting_account'];
  return parseAccount(nested, depth + 1);
}

function parseMinGasPrice(body: unknown): Rational {
  const fee = (body as { params?: { ValidatorMinGasFee?: { denom?: unknown; amount?: unknown } } })
    ?.params?.ValidatorMinGasFee;
  const amount = fee?.amount;
  if (fee?.denom !== BZE_BASE_DENOM || typeof amount !== 'string') {
    throw new Error('malformed txfeecollector params');
  }
  return parseDecimal(amount);
}
