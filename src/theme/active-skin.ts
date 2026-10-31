/**
 * The theme to skin the wallet with for a given active token (BUS-34, BUS-33).
 *
 *  - The native **BZE** token gets the hard-coded {@link BZE_THEME_ID BZE
 *    skin}: it is the native coin and always branded, with no on-chain package
 *    to depend on.
 *  - Any other token is branded exactly when its denom carries a valid on-chain
 *    branding package ({@link ./branding.decideBranding}, BUS-32) that passes
 *    the readability guard; the package becomes its theme via
 *    {@link ./brand-theme.brandTheme}.
 *  - Everything else — no package, an unreadable one, a chain error, or no
 *    active token at all — gets the neutral {@link DEFAULT_THEME_ID default
 *    skin}. Branding never blocks the wallet.
 *
 * {@link activeThemeId} is the synchronous part (what to paint before branding
 * has loaded); {@link resolveActiveTheme} is the full answer.
 */

import type { BrandingReader } from '../chain/branding';
import { BZE_BASE_DENOM } from '../chain/constants';
import { brandTheme } from './brand-theme';
import { decideBranding } from './branding';
import { BZE_THEME_ID, DEFAULT_THEME_ID, getTheme } from './themes';
import type { Theme } from './tokens';

/**
 * The predefined theme id for the active token `denom`, known without a chain
 * read: the BZE theme for the native token, the default theme for any other
 * token (until its branding resolves) or for `null` (no active token yet).
 */
export function activeThemeId(denom: string | null): string {
  return denom === BZE_BASE_DENOM ? BZE_THEME_ID : DEFAULT_THEME_ID;
}

/**
 * The theme for the active token `denom`: BZE → the BZE theme; another token →
 * its brand theme when its branding is valid and readable, else the default
 * theme; `null` → the default theme. Never rejects: a failed branding read
 * resolves to the default theme.
 */
export async function resolveActiveTheme(
  denom: string | null,
  branding: BrandingReader,
): Promise<Theme> {
  if (denom === null || denom === BZE_BASE_DENOM) {
    return getTheme(activeThemeId(denom));
  }
  try {
    const decision = decideBranding(await branding.getBranding(denom));
    if (decision.kind === 'branded') {
      return brandTheme(denom, decision.branding) ?? getTheme(DEFAULT_THEME_ID);
    }
  } catch {
    // A chain error is no branding: fall through to the default skin.
  }
  return getTheme(DEFAULT_THEME_ID);
}
