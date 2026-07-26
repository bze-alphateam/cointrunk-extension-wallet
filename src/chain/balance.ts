/**
 * The active token's balance and the seam that fetches it (BUS-19).
 *
 * A balance is public, non-secret chain data, so — unlike key material — it does
 * not belong to the keyring. It rides the same popup ↔ background message channel
 * as settings do (see `messages.ts`): the popup asks `getBalance`, the background
 * resolves the active account and delegates to a {@link BalanceService}.
 *
 * This module defines the contract; the chain-backed implementation is
 * {@link ../chain/bank.BankBalanceService} (BUS-25), which replaced the
 * placeholder this module shipped with while the path was UI-only.
 */

/**
 * A single token balance, in the bank module's own units: `amount` is an integer
 * string of `denom` base units (e.g. `{ denom: 'ubze', amount: '1234567' }`).
 * Rendering to a display value is {@link ../chain/token.formatTokenAmount}'s job.
 */
export interface Balance {
  readonly denom: string;
  readonly amount: string;
}

/** Fetches the active token balance for an address from the chain bank module. */
export interface BalanceService {
  getBalance(address: string): Promise<Balance>;
}
