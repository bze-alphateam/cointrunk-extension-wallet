/**
 * The wallet's active token and how to render an on-chain amount for humans
 * (BUS-19).
 *
 * v1 is single-token: the active token is always BeeZee's native BZE. The
 * {@link ActiveToken} shape is kept small and explicit so a later multi-token
 * epic can carry a list of these without reworking the formatter.
 *
 * {@link formatTokenAmount} is the one place base-unit integers become display
 * strings, and it is pure and BigInt-based on purpose: a bank balance can exceed
 * `Number.MAX_SAFE_INTEGER`, so it must never round-trip through a JS `number`.
 */

import { BZE_BASE_DENOM, BZE_DISPLAY_DECIMALS, BZE_DISPLAY_DENOM } from './constants';

/** Metadata needed to display a token's balance. */
export interface ActiveToken {
  /** On-chain base ("micro") denom the bank module returns, e.g. `ubze`. */
  readonly baseDenom: string;
  /** Human-facing symbol shown next to the amount, e.g. `BZE`. */
  readonly displayDenom: string;
  /** Base units per display unit is `10^decimals` (e.g. 6 → `1 BZE = 1e6 ubze`). */
  readonly decimals: number;
}

/** The native BeeZee token — the only active token in v1. */
export const ACTIVE_TOKEN: ActiveToken = {
  baseDenom: BZE_BASE_DENOM,
  displayDenom: BZE_DISPLAY_DENOM,
  decimals: BZE_DISPLAY_DECIMALS,
};

/** Insert `,` as a thousands separator into a run of digits (no sign, no point). */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Convert a base-unit integer amount (as the bank module returns it — a string
 * of digits like `"1234567"`) into a grouped, correctly-scaled display string.
 *
 * Examples at `decimals = 6`: `"1000000" → "1"`, `"1234567" → "1.234567"`,
 * `"1230000" → "1.23"`, `"12000000000000" → "12,000,000"`, `"999" → "0.000999"`.
 *
 * Trailing zeros in the fractional part are trimmed, and a whole amount drops the
 * decimal point entirely. Throws on anything that is not a non-negative integer
 * string, so a malformed API value surfaces as an error rather than a silently
 * wrong number — bank amounts are unsigned integers, and this is not a parser for
 * user input.
 */
export function formatTokenAmount(baseAmount: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid token decimals: ${JSON.stringify(decimals)}`);
  }
  if (!/^\d+$/.test(baseAmount)) {
    throw new Error(`invalid base-unit amount: ${JSON.stringify(baseAmount)}`);
  }

  const units = BigInt(baseAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = groupThousands((units / divisor).toString());

  const fraction = (units % divisor).toString().padStart(decimals, '0').replace(/0+$/u, '');
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}
