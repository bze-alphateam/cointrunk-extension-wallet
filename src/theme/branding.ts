/**
 * The branded/default decision for a token (BUS-32).
 *
 * Branding comes only from the chain: any token whose denom carries a valid
 * on-chain branding package (see {@link ../chain/branding}) is branded, and
 * every other token gets the neutral default skin. Nothing else is weighed —
 * not liquidity, not a curated list.
 *
 * Pure on purpose: the caller fetches the branding (cached, via
 * {@link ../chain/chain-data.CachedChainData.getBranding}) and passes it in.
 * Turning the package into a wallet {@link ./tokens.Theme} and painting it is
 * BUS-33.
 */

import type { DenomBranding } from '../chain/branding';

/** Either the token's branding package, or the default skin. */
export type BrandingDecision =
  { readonly kind: 'branded'; readonly branding: DenomBranding } | { readonly kind: 'default' };

/** `branded` with the package when there is one, otherwise `default`. */
export function decideBranding(branding: DenomBranding | null): BrandingDecision {
  return branding === null ? { kind: 'default' } : { kind: 'branded', branding };
}
