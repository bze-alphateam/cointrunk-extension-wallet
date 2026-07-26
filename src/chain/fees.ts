/**
 * Fee-token eligibility re-check seam — the BUS-23 failure-path hook for Epic 7.
 *
 * A send can fail because the account can't cover the fee in an accepted fee
 * token. Alt-fee-token support (choosing / topping up a fee token) is Epic 7;
 * this module defines the seam the failure state calls to re-check eligibility,
 * and ships an {@link UnavailableFeeEligibilityService} placeholder — the same
 * contract-plus-placeholder pattern as the balance and transaction services, so
 * Epic 7 only swaps in the concrete implementation.
 */

/** The result of re-checking whether an account can pay transaction fees. */
export interface FeeTokenEligibility {
  /** Whether the account can currently pay fees in an accepted fee token. */
  readonly eligible: boolean;
  /** Optional human-readable detail (which token, how short, etc.). */
  readonly reason?: string;
}

/** Re-checks fee-token eligibility for an address. Concrete impl: Epic 7. */
export interface FeeEligibilityService {
  check(address: string): Promise<FeeTokenEligibility>;
}

/**
 * Placeholder until Epic 7 wires real fee-token support. It rejects with a
 * user-readable message so the failure state's re-check button reports "not
 * available yet" rather than silently doing nothing.
 */
export class UnavailableFeeEligibilityService implements FeeEligibilityService {
  async check(): Promise<FeeTokenEligibility> {
    throw new Error('Fee-token eligibility checks arrive with alt-fee-token support.');
  }
}
