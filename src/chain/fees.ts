/**
 * Fee-token eligibility for the active token (BUS-38, Epic 7).
 *
 * A BeeZee tx fee is normally paid in native BZE, but the tradebin fee-payer
 * lets a holder pay in their active token *if* that token is an accepted fee
 * token — which on chain means its BZE-paired AMM pool is deep enough. This
 * module answers "can the active token pay fees?" from the same two numbers the
 * data layer (Epic 4) already caches: the token's BZE-side LP depth and the
 * governance threshold. It replaces the BUS-23 placeholder with the real check.
 *
 * The gate mirrors the chain's own `HasDeepLiquidityWithNativeDenom` /
 * `CanSwapForNativeDenom` (`x/tradebin/keeper/service_denom.go`): a non-native
 * token is an accepted fee token when its native-side reserve is **at least**
 * the threshold (`!(depth < threshold)`, i.e. `depth >= threshold`). Two notes:
 *
 *  - **Native BZE is always eligible.** BZE pays its own fees with no swap, so it
 *    is never fee-ineligible — and it has no BZE-paired pool of its own (depth
 *    reads as `0n`), so it must be special-cased rather than run through the
 *    depth gate. "No active token yet" (`null`) is likewise always eligible:
 *    there is nothing to warn about.
 *  - **Distinct from the branding gate.** Branding (BUS-32) uses strictly
 *    greater-than the *full* threshold over the same inputs; fee-eligibility uses
 *    at-least. They can disagree exactly at `depth === threshold` (fee-eligible,
 *    not branded) — a deliberate, separate concern, as the ticket calls out.
 */

import { BZE_BASE_DENOM } from './constants';
import type { LiquidityService } from './liquidity';

/** The result of checking whether the active token can pay transaction fees. */
export interface FeeTokenEligibility {
  /** Whether the active token can currently be used to pay fees. */
  readonly eligible: boolean;
  /** Calm, human-readable detail for the warning UI; set only when ineligible. */
  readonly reason?: string;
}

/** Checks whether the active token (by denom) can pay fees. Concrete impl below. */
export interface FeeEligibilityService {
  /**
   * @param denom the active token's denom, or `null` when none is chosen yet.
   */
  check(denom: string | null): Promise<FeeTokenEligibility>;
}

/** Shown when a low-liquidity token can't currently be used to pay fees. */
export const FEE_INELIGIBLE_REASON =
  "This token's liquidity is too low to pay network fees right now.";

/**
 * The pure gate: is `denom` an accepted fee token given its BZE-side LP `depth`
 * and the governance `threshold`? Native BZE (and "no token", `null`) is always
 * eligible; any other token needs `depth >= threshold`. See the module docs for
 * why this special-cases the native token and how it differs from branding.
 */
export function isFeeTokenEligible(
  denom: string | null,
  depth: bigint,
  threshold: bigint,
  nativeDenom: string = BZE_BASE_DENOM,
): boolean {
  if (denom === null || denom === nativeDenom) {
    return true;
  }
  return depth >= threshold;
}

/**
 * The real fee-eligibility check, reading the active token's cached LP depth and
 * the cached threshold from the data layer (BUS-27/28) — no duplicate query
 * logic. Native/`null` short-circuits to eligible without a read, so the
 * guaranteed-empty native pool is never queried.
 */
export class LiquidityFeeEligibilityService implements FeeEligibilityService {
  constructor(
    private readonly liquidity: LiquidityService,
    private readonly nativeDenom: string = BZE_BASE_DENOM,
  ) {}

  async check(denom: string | null): Promise<FeeTokenEligibility> {
    if (denom === null || denom === this.nativeDenom) {
      return { eligible: true };
    }
    const [depth, threshold] = await Promise.all([
      this.liquidity.getNativeDepth(denom),
      this.liquidity.getThreshold(),
    ]);
    return isFeeTokenEligible(denom, depth, threshold, this.nativeDenom)
      ? { eligible: true }
      : { eligible: false, reason: FEE_INELIGIBLE_REASON };
  }
}
