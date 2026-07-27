/**
 * A **skin** — the resolved look of the active token — and the neutral default
 * skin the wallet falls back to (BUS-30).
 *
 * The branding pipeline (see Confluence "3. Technical Design" → Branding
 * pipeline) resolves the active token to a skin and the popup renders it. A skin
 * is two things paired:
 *
 *  - a visual {@link Theme} — the colour palettes (light + dark), font, spacing
 *    and radii that {@link ../theme/apply.applyTheme} writes to the DOM, and
 *  - the token's {@link TokenIdentity} — its name, symbol and logo, which
 *    **always** come from chain metadata (BUS-26), never from a brand package.
 *
 * The theme is the axis branding can change; the identity is not. The gate
 * (BUS-32) decides whether a token earns its brand theme; when it doesn't — no
 * registry package, or LP liquidity at/below the governance threshold — the
 * fallback is the **default skin** built here: the neutral {@link
 * ../theme/themes.DEFAULT_THEME_ID default} theme over that same chain identity.
 * So switching a token in or out of branding only ever swaps the theme; the
 * logo and name the holder sees are unchanged.
 *
 * This module is the fallback end of that gate. It is pure — a theme lookup plus
 * an object — and holds no chain or DOM dependency (the identity is passed in);
 * fetching identity, running the gate, and applying the resolved skin to the
 * live UI are separate tickets (BUS-31/32/33).
 */

import type { TokenIdentity } from '../chain/metadata';
import { DEFAULT_THEME_ID, getTheme } from './themes';
import type { Theme } from './tokens';

/**
 * The resolved presentation of a token: a visual {@link Theme} paired with the
 * token's chain-sourced {@link TokenIdentity}.
 *
 * Mode-independent by design — the theme carries both the light and dark
 * palettes, and the holder's current mode is chosen at render time
 * ({@link ../theme/apply.applyTheme}), not baked into the skin.
 */
export interface Skin {
  /** The visual theme to apply: the `default` theme for a {@link defaultSkin}. */
  readonly theme: Theme;
  /** The token's identity (name, symbol, logo), always from chain metadata. */
  readonly identity: TokenIdentity;
  /**
   * `false` for the neutral default skin; `true` once the gate resolves a token
   * to its registered brand theme (BUS-32/33). Lets the UI and tests tell the
   * fallback apart from a real brand without inspecting the theme id.
   */
  readonly branded: boolean;
}

/**
 * The neutral default skin for a token: the {@link DEFAULT_THEME_ID default}
 * theme over the token's chain identity. This is the fallback the branding gate
 * lands on for any token without applicable branding, and it renders for *any*
 * token — the identity is used as-is, so a token with no on-chain logo/name
 * still gets a complete, styled skin (its {@link TokenIdentity} already carries
 * per-field fallbacks: logo `null`, name/symbol from the denom — BUS-26).
 */
export function defaultSkin(identity: TokenIdentity): Skin {
  return {
    theme: getTheme(DEFAULT_THEME_ID),
    identity,
    branded: false,
  };
}
