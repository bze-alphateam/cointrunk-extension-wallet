/**
 * The send transaction and the seam that signs & broadcasts it (BUS-22).
 *
 * This mirrors `balance.ts`: it defines the contract and ships an
 * {@link UnavailableTransactionService} placeholder so the whole send path —
 * form, validation, review, the confirm round-trip, and the success/failure
 * states (BUS-23) — is wired and testable now, while the actual local signing
 * and RPC broadcast are the data layer's job (Epic 4). Epic 4 only swaps in the
 * concrete service; nothing above this seam changes.
 *
 * Amounts here are always base units (integer strings of the token's base
 * denom), exactly like {@link ./balance.Balance} — the popup parses the human
 * amount with {@link ./token.parseTokenAmount} before it ever reaches this seam.
 */

import { DEFAULT_SEND_FEE_AMOUNT, DEFAULT_SEND_GAS } from './constants';
import { ACTIVE_TOKEN } from './token';

/**
 * A send as requested by the popup: recipient plus amount in base units of the
 * active token. The sending address is NOT here — the background supplies it
 * from the active account, so the popup can never spend from an arbitrary one
 * (the same trust boundary `getBalance` draws).
 */
export interface SendRequest {
  readonly toAddress: string;
  /** Amount to send, in base units (integer string) of the active token. */
  readonly amount: string;
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

/**
 * The fixed fee shown on the review step and used for the broadcast in v1. See
 * {@link DEFAULT_SEND_FEE_AMOUNT} for why this is a constant rather than a
 * simulated estimate until Epic 4.
 */
export const DEFAULT_SEND_FEE: TxFee = {
  amount: DEFAULT_SEND_FEE_AMOUNT,
  denom: ACTIVE_TOKEN.baseDenom,
  gas: DEFAULT_SEND_GAS,
};

/** Signs a send locally and broadcasts it, returning the transaction hash. */
export interface TransactionService {
  send(params: SendParams): Promise<TxResult>;
}

/**
 * Placeholder used until the data layer (Epic 4) provides a chain-backed
 * service. It rejects with a user-readable message so the send flow exercises
 * its failure state (BUS-23) rather than pretending a broadcast succeeded.
 */
export class UnavailableTransactionService implements TransactionService {
  async send(): Promise<TxResult> {
    throw new Error('Sending is unavailable right now.');
  }
}
