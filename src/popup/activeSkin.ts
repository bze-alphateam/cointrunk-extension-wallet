/**
 * Skinning the popup to the active token (BUS-34, BUS-33).
 *
 * The popup paints the neutral default skin immediately so there is never an
 * unstyled frame, then asks the background for the active token and re-skins to
 * it ({@link ../theme/active-skin.resolveActiveTheme}): the BZE skin for the
 * native token, the token's on-chain brand theme when it has a valid, readable
 * one, the default skin otherwise. Re-skinning is just another
 * {@link applyTheme} call, exactly as the theming layer (BUS-29) anticipated.
 *
 * Applying a token is two-step: first the theme known without a chain read
 * (BZE, or the default skin), so a previous token's brand never lingers while
 * the new branding loads; then the resolved theme. If another token is applied
 * meanwhile, the stale result is dropped. Every apply re-reads the branding
 * (through the background's cache), so a token that gains or loses its branding
 * repaints the next time it is applied — no popup reload.
 *
 * The current theme is held here so the OS light↔dark listener always repaints
 * the *active* skin, not a hard-coded one: switching mode keeps the token's
 * palette and only swaps light for dark.
 */

import type { BrandingReader } from '../chain/branding';
import { activeThemeId, resolveActiveTheme } from '../theme/active-skin';
import { applyTheme, preferredMode } from '../theme/apply';
import { DEFAULT_THEME_ID, getTheme } from '../theme/themes';
import type { Theme } from '../theme/tokens';
import { registerBrandFont } from './brandFonts';
import { request } from './keyringClient';

/** Branding comes from the background's cached chain layer; the popup has no chain client. */
const branding: BrandingReader = {
  getBranding: (denom) => request({ type: 'getBranding', denom }),
};

/** The theme currently applied; repainted (not reset) when the OS mode flips. */
let currentTheme: Theme = getTheme(DEFAULT_THEME_ID);

/** Bumped on every apply, so only the latest token's resolved theme is painted. */
let applyGeneration = 0;

/** Paint {@link currentTheme} in the holder's current colour mode. */
function paint(): void {
  registerBrandFont(currentTheme.typography.bundledFont);
  applyTheme(currentTheme, preferredMode());
}

/**
 * Paint the default skin now and keep following the OS light/dark setting while
 * the popup is open. Call once, before the first render, so the UI is styled on
 * its first frame.
 */
export function startSkin(): void {
  paint();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
}

/**
 * Re-skin to a known active-token denom (BUS-37). The token switcher calls this
 * the moment a switch is persisted, so the wallet repaints to the new token
 * without asking the background which token is active. Paints the
 * no-chain-read theme at once, then the resolved one; never rejects.
 */
export async function applyActiveSkin(denom: string | null): Promise<void> {
  const generation = ++applyGeneration;
  currentTheme = getTheme(activeThemeId(denom));
  paint();
  const resolved = await resolveActiveTheme(denom, branding);
  if (generation === applyGeneration && resolved !== currentTheme) {
    currentTheme = resolved;
    paint();
  }
}

/**
 * Ask the background for the active token and re-skin to it. Failures are
 * swallowed: an unreachable background just leaves the default skin in place —
 * branding never blocks the wallet.
 */
export async function resolveActiveSkin(): Promise<void> {
  try {
    const { denom } = await request({ type: 'getActiveToken' });
    await applyActiveSkin(denom);
  } catch {
    // Keep the default skin already painted by startSkin().
  }
}
