/**
 * The active token's balance and the seam that fetches it (BUS-19).
 *
 * A balance is public, non-secret chain data, so — unlike key material — it does
 * not belong to the keyring. It rides the same popup ↔ background message channel
 * as settings do (see `messages.ts`): the popup asks `getBalance`, the background
 * resolves the active account and delegates to a {@link BalanceService}.
 *
 * The concrete, network-backed service is the data layer's job (Epic 4). This
 * module defines the contract and ships {@link UnavailableBalanceService} as the
 * placeholder so the whole path — request routing, loading and error states — is
 * wired and testable now, and Epic 4 only swaps in the real query.
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

/**
 * Placeholder used until the data layer (Epic 4) provides a chain-backed service.
 * It rejects so the popup exercises its error state rather than showing a
 * fabricated number; the message string is user-readable, not a stack trace.
 */
export class UnavailableBalanceService implements BalanceService {
  // The address is irrelevant until there is a chain to query, so it is omitted
  // here; the method still satisfies `BalanceService.getBalance(address)`.
  async getBalance(): Promise<Balance> {
    throw new Error('Balance is unavailable right now.');
  }
}
