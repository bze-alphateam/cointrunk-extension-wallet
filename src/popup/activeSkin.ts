/**
 * Skinning the popup to the active token (BUS-34).
 *
 * The popup paints the neutral default skin immediately so there is never an
 * unstyled frame, then asks the background for the active token and re-skins to
 * it — the BZE skin for the native token, the default skin otherwise
 * ({@link ../theme/active-skin.activeThemeId}). Re-skinning is just another
 * {@link applyTheme} call, exactly as the theming layer (BUS-29) anticipated.
 *
 * The current theme id is held here so the OS light↔dark listener always
 * repaints the *active* skin, not a hard-coded one: switching mode keeps the
 * token's palette and only swaps light for dark.
 */

import { activeThemeId } from '../theme/active-skin';
import { applyTheme, preferredMode } from '../theme/apply';
import { DEFAULT_THEME_ID } from '../theme/themes';
import { request } from './keyringClient';

/** The theme id currently applied; repainted (not reset) when the OS mode flips. */
let currentThemeId = DEFAULT_THEME_ID;

/** Paint {@link currentThemeId} in the holder's current colour mode. */
function paint(): void {
  applyTheme(currentThemeId, preferredMode());
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
 * Re-skin to a known active-token denom immediately (BUS-37). The token switcher
 * calls this the moment a switch is persisted, so the wallet repaints to the new
 * token without a round trip back to the background for what it already knows.
 * Keeps following the OS light/dark setting via {@link currentThemeId}.
 */
export function applyActiveSkin(denom: string | null): void {
  currentThemeId = activeThemeId(denom);
  paint();
}

/**
 * Ask the background for the active token and re-skin to it. Failures are
 * swallowed: an unreachable background just leaves the default skin in place —
 * branding never blocks the wallet.
 */
export async function resolveActiveSkin(): Promise<void> {
  try {
    const { denom } = await request({ type: 'getActiveToken' });
    applyActiveSkin(denom);
  } catch {
    // Keep the default skin already painted by startSkin().
  }
}
