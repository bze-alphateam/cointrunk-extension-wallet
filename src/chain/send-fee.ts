/**
 * Which coin pays a send's network fee, and how much (BUS-51). Pure: every input
 * is passed in, so the whole rule is unit-testable with no chain.
 *
 * The chain's fee rules (bze `x/txfeecollector` ante, `check_fee_denom.go` /
 * `validator_tx_fee.go`):
 *  - a tx pays its fee in exactly **one** denom;
 *  - a non-native fee denom is accepted only when its BZE-paired pool is deep
 *    enough (the same gate as {@link ./fees.isFeeTokenEligible});
 *  - the minimum is `ceil(gas × validator_min_gas_fee)` in `ubze`, and for any
 *    other denom that gas price divided by the token's spot price in BZE, where
 *    spot = native reserve / token reserve of the BZE-paired pool.
 *
 * The wallet's rule on top of that: pay in BZE whenever the BZE balance covers
 * the fee (plus the amount, when the send itself is BZE); otherwise pay in the
 * active token when it is fee-eligible; otherwise the send is blocked. A token
 * fee carries a 10% margin over the spot conversion, so a trade that moves the
 * pool between review and broadcast does not make the fee fall short.
 *
 * Amounts are bigint base units throughout; the gas price is an exact rational,
 * never a float.
 */

import { BZE_BASE_DENOM } from './constants';
import type { TxFee } from './tx';

/** An exact non-negative fraction, used for the decimal gas price. */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

/** Both reserves of a token's BZE-paired AMM pool, in base units. */
export interface NativeReserves {
  /** The `ubze` side. */
  readonly native: bigint;
  /** The token side. */
  readonly token: bigint;
}

/** Applied to a token fee: ×11/10, i.e. a 10% margin over the spot conversion. */
const TOKEN_FEE_MARGIN: Rational = { num: 11n, den: 10n };

/**
 * Parse a chain decimal (`"0.010000000000000000"`, a `LegacyDec` as JSON) into
 * an exact {@link Rational}. Throws on anything that is not a non-negative
 * decimal, so a garbled gas price can never become a wrong fee.
 */
export function parseDecimal(value: string): Rational {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match) {
    throw new Error(`malformed decimal: ${JSON.stringify(value)}`);
  }
  const [, whole, fraction = ''] = match;
  return { num: BigInt(whole! + fraction), den: 10n ** BigInt(fraction.length) };
}

function ceilDiv(num: bigint, den: bigint): bigint {
  return (num + den - 1n) / den;
}

/** The BZE fee for `gas` at `gasPrice` (ubze per gas): `ceil(gas × price)`, in `ubze`. */
export function bzeFeeForGas(gas: bigint, gasPrice: Rational): bigint {
  return ceilDiv(gas * gasPrice.num, gasPrice.den);
}

/**
 * Convert a BZE fee into the token at the pool's spot price, with the 10%
 * margin, rounded up: `ceil(feeBze × token / native × 1.1)`. Returns `null`
 * when the pool has an empty side, which has no spot price (the chain refuses
 * that denom too).
 */
export function tokenFeeForBzeFee(feeBze: bigint, reserves: NativeReserves): bigint | null {
  if (reserves.native <= 0n || reserves.token <= 0n) {
    return null;
  }
  return ceilDiv(
    feeBze * reserves.token * TOKEN_FEE_MARGIN.num,
    reserves.native * TOKEN_FEE_MARGIN.den,
  );
}

/** Everything {@link selectSendFee} decides from. */
export interface SendFeeInput {
  /** The gas limit the tx will carry. */
  readonly gas: bigint;
  /** `validator_min_gas_fee`, in `ubze` per gas. */
  readonly gasPrice: Rational;
  /** The denom being sent (the active token). */
  readonly sendDenom: string;
  /** Human symbol of the sent token, for the blocked-send messages. */
  readonly sendSymbol: string;
  /** The amount being sent, in base units of `sendDenom`. */
  readonly amount: bigint;
  /** The sender's `ubze` balance. */
  readonly bzeBalance: bigint;
  /** The sender's `sendDenom` balance (same as `bzeBalance` when sending BZE). */
  readonly tokenBalance: bigint;
  /** Whether `sendDenom` is an accepted fee token right now. Ignored for BZE. */
  readonly tokenFeeEligible: boolean;
  /** The token's BZE-paired pool reserves, or `null` when unknown / no pool. */
  readonly reserves: NativeReserves | null;
  readonly nativeDenom?: string;
}

/** The outcome: a fee to put on the tx, or a calm reason the send can't go out. */
export type SendFeeSelection =
  | { readonly status: 'ready'; readonly fee: TxFee }
  | {
      readonly status: 'blocked';
      readonly reason: string;
      /** True when the cause is the token's fee ineligibility (show the fee warning). */
      readonly feeIneligible: boolean;
    };

/** Why a token send is blocked when there is no BZE for the fee and the token can't pay it. */
export const NO_FEE_COIN_REASON =
  "You need a little BZE to pay the network fee — this token's liquidity is too low to pay fees with it right now.";

/** Pick the fee coin and amount for a send. See the module docs for the rule. */
export function selectSendFee(input: SendFeeInput): SendFeeSelection {
  const nativeDenom = input.nativeDenom ?? BZE_BASE_DENOM;
  const sendingNative = input.sendDenom === nativeDenom;
  const gas = input.gas.toString();

  if (!sendingNative && input.tokenBalance < input.amount) {
    return blocked(`Not enough ${input.sendSymbol} — the amount is more than your balance.`);
  }

  const feeBze = bzeFeeForGas(input.gas, input.gasPrice);
  const bzeNeeded = feeBze + (sendingNative ? input.amount : 0n);
  if (input.bzeBalance >= bzeNeeded) {
    return { status: 'ready', fee: { amount: feeBze.toString(), denom: nativeDenom, gas } };
  }
  if (sendingNative) {
    return blocked('Not enough BZE — the amount plus the network fee is more than your balance.');
  }

  const feeToken =
    input.tokenFeeEligible && input.reserves !== null
      ? tokenFeeForBzeFee(feeBze, input.reserves)
      : null;
  if (feeToken === null) {
    return { status: 'blocked', reason: NO_FEE_COIN_REASON, feeIneligible: true };
  }
  if (input.tokenBalance < input.amount + feeToken) {
    return blocked(
      `Not enough ${input.sendSymbol} — the amount plus the network fee is more than your balance.`,
    );
  }
  return { status: 'ready', fee: { amount: feeToken.toString(), denom: input.sendDenom, gas } };
}

function blocked(reason: string): SendFeeSelection {
  return { status: 'blocked', reason, feeIneligible: false };
}
