/**
 * The send transaction: quote its fee, sign it locally and broadcast it
 * (BUS-22 seam, filled by BUS-51).
 *
 * A send is one `MsgSend` of the active token, empty memo, signed in
 * `SIGN_MODE_DIRECT` by the keyring's in-memory signer. The flow:
 *  1. **quote** (review step): read the account, simulate the tx for its gas
 *     (`ceil(gasUsed × 1.3)`, or the fixed {@link DEFAULT_SEND_GAS} if
 *     simulation fails), then pick the fee coin and amount with
 *     {@link ./send-fee.selectSendFee}. The popup shows that fee.
 *  2. **send** (confirm): with the fee the user approved, read the account's
 *     current sequence, sign, and broadcast in sync mode. The node's CheckTx
 *     answer decides the outcome: code 0 returns the hash, anything else a
 *     calm, readable error.
 *
 * Amounts here are always base units (integer strings of the token's base
 * denom), exactly like {@link ./balance.Balance} — the popup parses the human
 * amount with {@link ./token.parseTokenAmount} before it ever reaches this seam.
 */

import { sha256 } from '@cosmjs/crypto';
import { fromBase64, toHex } from '@cosmjs/encoding';
import { makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { TxBody, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import type { Signer } from '../keyring/crypto';
import type { BalanceService } from './balance';
import type { TokenIdentityReader } from './chain-data';
import { ChainOutcomeUnknownError } from './client';
import { BZE_BASE_DENOM, BZE_CHAIN_ID, BZE_DISPLAY_DENOM, DEFAULT_SEND_GAS } from './constants';
import type { FeeEligibilityService } from './fees';
import type { PoolReservesReader } from './liquidity';
import { selectSendFee, type SendFeeSelection } from './send-fee';
import type { BroadcastResult, TxChain } from './tx-chain';

/**
 * A send as requested by the popup: recipient, amount in base units, and the
 * denom the popup showed the user. The sending address is NOT here — the
 * background supplies it from the active account, so the popup can never spend
 * from an arbitrary one (the same trust boundary `getBalance` draws). The denom
 * is likewise resolved by the background; the popup's copy only has to match
 * it, so a token switched in another window can't change what gets sent.
 */
export interface SendRequest {
  readonly toAddress: string;
  /** Amount to send, in base units (integer string) of the active token. */
  readonly amount: string;
  /** The active token's denom as the popup showed it. */
  readonly denom: string;
}

/** A send the user confirmed on the review step, with the fee they saw. */
export interface ConfirmedSendRequest extends SendRequest {
  readonly fee: TxFee;
}

/** A fully-resolved send, as handed to the {@link TransactionService}. */
export interface SendParams extends SendRequest {
  /** The active account's address, resolved by the background. */
  readonly from: string;
}

/** The network fee for a send: an amount in base units, its denom, and gas. */
export interface TxFee {
  readonly amount: string;
  readonly denom: string;
  readonly gas: string;
}

/** The outcome of a successful broadcast. */
export interface TxResult {
  /** The transaction hash, for the success confirmation and explorer link (BUS-23). */
  readonly hash: string;
}

/** The review step's fee: ready with a fee, or blocked with a reason. */
export type SendQuote = SendFeeSelection;

/** Quotes a send's fee, then signs it locally and broadcasts it. */
export interface TransactionService {
  quote(params: SendParams): Promise<SendQuote>;
  send(params: SendParams, fee: TxFee): Promise<TxResult>;
}

/** Simulated gas is multiplied by 13/10 so the real run never runs out. */
const GAS_ADJUSTMENT = { num: 13n, den: 10n };

/** Sanity cap on a confirmed gas limit; a send uses well under 1% of it. */
const MAX_GAS = 10_000_000n;

/** What {@link ChainTransactionService} is built from; all of it injected. */
export interface ChainTransactionDeps {
  readonly chain: TxChain;
  /** The keyring: signs only while unlocked, and refuses (`locked`) otherwise. */
  readonly signer: Signer;
  readonly balances: BalanceService;
  readonly feeEligibility: FeeEligibilityService;
  readonly reserves: PoolReservesReader;
  /** For the token's symbol in blocked-send messages. */
  readonly tokens: TokenIdentityReader;
  /** The only chain id a send may be signed for. Defaults to mainnet `beezee-1`. */
  readonly chainId?: string;
}

export class ChainTransactionService implements TransactionService {
  private readonly expectedChainId: string;

  constructor(private readonly deps: ChainTransactionDeps) {
    this.expectedChainId = deps.chainId ?? BZE_CHAIN_ID;
  }

  async quote(params: SendParams): Promise<SendQuote> {
    const { chain, signer, balances, feeEligibility, reserves, tokens } = this.deps;
    await this.assertChainId();

    const [account, pubkey] = await Promise.all([
      chain.getAccount(params.from),
      signer.getPublicKey(),
    ]);
    const body = encodeSendBody(params);
    const gas = await this.estimateGas(body, pubkey, account.sequence);

    const held = await balances.getAllBalances(params.from);
    const balanceOf = (denom: string): bigint =>
      BigInt(held.find((b) => b.denom === denom)?.amount ?? '0');
    const sendingNative = params.denom === BZE_BASE_DENOM;

    const [gasPrice, eligibility, poolReserves, identity] = await Promise.all([
      chain.getMinGasPrice(),
      sendingNative ? { eligible: true } : feeEligibility.check(params.denom),
      sendingNative ? null : reserves.getNativeReserves(params.denom),
      sendingNative ? null : tokens.getTokenIdentity(params.denom),
    ]);

    return selectSendFee({
      gas,
      gasPrice,
      sendDenom: params.denom,
      sendSymbol: identity?.symbol ?? BZE_DISPLAY_DENOM,
      amount: BigInt(params.amount),
      bzeBalance: balanceOf(BZE_BASE_DENOM),
      tokenBalance: balanceOf(params.denom),
      tokenFeeEligible: eligibility.eligible,
      reserves: poolReserves,
    });
  }

  async send(params: SendParams, fee: TxFee): Promise<TxResult> {
    const { chain, signer } = this.deps;
    assertConfirmedFee(params, fee);
    const chainId = await this.assertChainId();

    const [account, pubkey] = await Promise.all([
      chain.getAccount(params.from),
      signer.getPublicKey(),
    ]);
    const bodyBytes = encodeSendBody(params);
    const authInfoBytes = makeAuthInfoBytes(
      [{ pubkey: encodePubkey(pubkey), sequence: account.sequence }],
      [{ denom: fee.denom, amount: fee.amount }],
      Number(fee.gas),
      undefined,
      undefined,
      SignMode.SIGN_MODE_DIRECT,
    );
    const signDoc = makeSignDoc(bodyBytes, authInfoBytes, chainId, account.accountNumber);
    const { signed, signature } = await signer.sign({ signDoc });

    const txBytes = TxRaw.encode(
      TxRaw.fromPartial({
        bodyBytes: signed.bodyBytes,
        authInfoBytes: signed.authInfoBytes,
        signatures: [fromBase64(signature.signature)],
      }),
    ).finish();
    const hash = toHex(sha256(txBytes)).toUpperCase();

    let result: BroadcastResult;
    try {
      result = await chain.broadcast(txBytes);
    } catch (error) {
      if (error instanceof ChainOutcomeUnknownError) {
        throw new Error(
          `The network did not confirm the transaction in time. It may still go through — check ${hash} on the block explorer before sending again.`,
          { cause: error },
        );
      }
      throw error;
    }
    return { hash: acceptedHash(result, hash) };
  }

  /** Refuse to sign for any chain but the expected one; returns the chain id. */
  private async assertChainId(): Promise<string> {
    const chainId = await this.deps.chain.getChainId();
    if (chainId !== this.expectedChainId) {
      throw new Error(
        `The network node reports chain "${chainId}", not ${this.expectedChainId} — sending is refused.`,
      );
    }
    return chainId;
  }

  /**
   * Simulate the send for its gas: `ceil(gasUsed × 1.3)`. Simulation runs with
   * an empty fee and an empty signature (the node skips signature checks when
   * simulating). Any failure falls back to the fixed {@link DEFAULT_SEND_GAS}.
   */
  private async estimateGas(
    bodyBytes: Uint8Array,
    pubkey: Uint8Array,
    sequence: bigint,
  ): Promise<bigint> {
    const authInfoBytes = makeAuthInfoBytes(
      [{ pubkey: encodePubkey(pubkey), sequence }],
      [],
      0,
      undefined,
      undefined,
      SignMode.SIGN_MODE_DIRECT,
    );
    const txBytes = TxRaw.encode(
      TxRaw.fromPartial({ bodyBytes, authInfoBytes, signatures: [new Uint8Array()] }),
    ).finish();
    try {
      const used = await this.deps.chain.simulate(txBytes);
      if (used > 0n) {
        return (used * GAS_ADJUSTMENT.num + GAS_ADJUSTMENT.den - 1n) / GAS_ADJUSTMENT.den;
      }
    } catch {
      // fall through to the fixed limit
    }
    return BigInt(DEFAULT_SEND_GAS);
  }
}

/** The tx body: one `MsgSend` of `amount` `denom`, empty memo. */
function encodeSendBody(params: SendParams): Uint8Array {
  const message = MsgSend.fromPartial({
    fromAddress: params.from,
    toAddress: params.toAddress,
    amount: [{ denom: params.denom, amount: params.amount }],
  });
  return TxBody.encode(
    TxBody.fromPartial({
      messages: [
        { typeUrl: '/cosmos.bank.v1beta1.MsgSend', value: MsgSend.encode(message).finish() },
      ],
      memo: '',
    }),
  ).finish();
}

/** A secp256k1 public key as the `Any` a signer info carries. */
function encodePubkey(pubkey: Uint8Array) {
  return {
    typeUrl: '/cosmos.crypto.secp256k1.PubKey',
    value: PubKey.encode(PubKey.fromPartial({ key: pubkey })).finish(),
  };
}

/**
 * The confirmed fee must be one the chain could accept for this send: paid in
 * BZE or in the token being sent (one denom), with whole positive amounts.
 * Whether it is enough is the node's call (CheckTx answers "insufficient fee").
 */
function assertConfirmedFee(params: SendParams, fee: TxFee): void {
  const wholePositive = (value: string): boolean => /^\d+$/u.test(value) && BigInt(value) > 0n;
  if (
    (fee.denom !== BZE_BASE_DENOM && fee.denom !== params.denom) ||
    !wholePositive(fee.amount) ||
    !wholePositive(fee.gas) ||
    BigInt(fee.gas) > MAX_GAS
  ) {
    throw new Error('The network fee is not valid — go back and review the send again.');
  }
  if (!/^\d+$/u.test(params.amount) || BigInt(params.amount) <= 0n) {
    throw new Error('Amount must be greater than zero.');
  }
}

/** Cosmos SDK error codes (codespace `sdk`) a send can hit at CheckTx. */
const SDK_INSUFFICIENT_FUNDS = 5;
const SDK_OUT_OF_GAS = 11;
const SDK_INSUFFICIENT_FEE = 13;
const SDK_TX_IN_MEMPOOL_CACHE = 19;
const SDK_WRONG_SEQUENCE = 32;

/**
 * Turn a CheckTx answer into the tx hash, or a calm error a person can act on.
 * Code 19 ("tx already in mempool cache") means a node already holds these
 * exact bytes: the send went out, so it counts as accepted.
 */
function acceptedHash(result: BroadcastResult, localHash: string): string {
  const hash = result.txhash.length > 0 ? result.txhash.toUpperCase() : localHash;
  if (result.code === 0) {
    return hash;
  }
  if (result.codespace === 'sdk') {
    switch (result.code) {
      case SDK_TX_IN_MEMPOOL_CACHE:
        return hash;
      case SDK_INSUFFICIENT_FUNDS:
        throw new Error('Not enough funds for the amount plus the network fee.');
      case SDK_INSUFFICIENT_FEE:
        throw new Error('The network fee was too low — go back and review the send again.');
      case SDK_WRONG_SEQUENCE:
        throw new Error(
          'Another transaction from this account is still being processed — wait a few seconds and try again.',
        );
      case SDK_OUT_OF_GAS:
        throw new Error('The transaction ran out of gas — try sending again.');
    }
  }
  throw new Error(
    `The network rejected the transaction (${result.codespace || 'error'} code ${result.code}).`,
  );
}
