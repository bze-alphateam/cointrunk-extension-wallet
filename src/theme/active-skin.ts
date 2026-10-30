/**
 * The theme id to skin the wallet with for a given active token (BUS-34).
 *
 * This is the narrow branding decision Epic 6 needs: the native
 * **BZE** token gets the {@link BZE_THEME_ID BZE skin}; everything else — a
 * factory token, or no active token at all — gets the neutral
 * {@link DEFAULT_THEME_ID default skin}.
 *
 * Epic 5 replaces the "else → default" branch with the token's on-chain
 * branding: any token with a valid branding package is branded
 * ({@link ./branding.decideBranding}, BUS-32), applied to the UI in BUS-33. BZE
 * stays a hard-coded skin regardless: it is the native coin and always branded,
 * with no on-chain package to depend on.
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
