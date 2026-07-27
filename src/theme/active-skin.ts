/**
 * The theme id to skin the wallet with for a given active token (BUS-34).
 *
 * This is the narrow, pre-registry branding decision Epic 6 needs: the native
 * **BZE** token gets the {@link BZE_THEME_ID BZE skin}; everything else — a
 * factory token, or no active token at all — gets the neutral
 * {@link DEFAULT_THEME_ID default skin}.
 *
 * The full branding gate (a GitHub registry entry AND LP liquidity over the
 * governance threshold; see Confluence "4. Token Eligibility & Branding
 * Criteria") is Epic 5 (BUS-31/32/33) and will replace the "else → default"
 * branch here with a real lookup. BZE stays a hard-coded skin regardless: it is
 * the native coin and always branded, with no registry entry to depend on.
 */

import { BZE_BASE_DENOM } from '../chain/constants';
import { BZE_THEME_ID, DEFAULT_THEME_ID } from './themes';

/**
 * The theme id for the active token `denom`: the BZE theme for the native token,
 * the default theme for any other token or for `null` (no active token yet).
 */
export function activeThemeId(denom: string | null): string {
  return denom === BZE_BASE_DENOM ? BZE_THEME_ID : DEFAULT_THEME_ID;
}
