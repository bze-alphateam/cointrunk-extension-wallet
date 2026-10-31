/**
 * A token's on-chain branding package → a full wallet {@link Theme} (BUS-33).
 *
 * The chain stores four colours per mode (background, text, primary,
 * secondary) and a font slug ({@link ../chain/branding.DenomBranding}). The
 * wallet chrome needs nine colours per mode plus type, spacing and radii, so
 * the rest is derived, per mode, from the package's own colours:
 *
 *  - `background`, `text`, `primary`, `secondary` — as given.
 *  - `surface` — background mixed {@link SURFACE_MIX} towards text.
 *  - `border` — background mixed {@link BORDER_MIX} towards text.
 *  - `textMuted` — text mixed {@link MUTED_MIX} towards background.
 *  - `primaryText` — black or white, whichever contrasts more with primary, so
 *    button labels are readable by construction.
 *  - `danger` — the default theme's danger colour for that mode. Never
 *    brand-controlled, so warnings always look like warnings.
 *
 * Spacing and radii are the default theme's. The font is the bundled brand
 * font for the slug ({@link ./fonts}), or the default system font when the
 * wallet does not ship that slug — the colours still apply.
 *
 * **Readability guard**: a package whose text-on-background contrast is below
 * WCAG AA ({@link WCAG_AA_TEXT_CONTRAST}) in *either* mode produces no theme
 * at all, and the caller falls back to the default skin for both modes — never
 * a half-branded wallet. Primary-on-background is deliberately not checked:
 * accent colours are often low-contrast by design.
 */

import type { BrandingColors, DenomBranding } from '../chain/branding';
import { contrastRatio, mixColours, readableOn, WCAG_AA_TEXT_CONTRAST } from './colour';
import { brandFont } from './fonts';
import { DEFAULT_THEME_ID, getTheme } from './themes';
import type { Palette, Theme, ThemeMode, Typography } from './tokens';

/** How far `surface` moves from background towards text. */
const SURFACE_MIX = 0.06;
/** How far `border` moves from background towards text. */
const BORDER_MIX = 0.15;
/** How far `textMuted` moves from text towards background (≈60% strength left). */
const MUTED_MIX = 0.4;

/** The id prefix of generated brand themes: `brand:<denom>`. */
const BRAND_THEME_ID_PREFIX = 'brand:';

const MODES: readonly ThemeMode[] = ['light', 'dark'];

/** Whether one mode's text reads on its background at WCAG AA. */
function isReadable(colors: BrandingColors): boolean {
  return contrastRatio(colors.text, colors.background) >= WCAG_AA_TEXT_CONTRAST;
}

/** One mode's full palette from that mode's four brand colours. */
function brandPalette(colors: BrandingColors, mode: ThemeMode): Palette {
  const { background, text, primary, secondary } = colors;
  return {
    background,
    surface: mixColours(background, text, SURFACE_MIX),
    text,
    textMuted: mixColours(text, background, MUTED_MIX),
    border: mixColours(background, text, BORDER_MIX),
    primary,
    primaryText: readableOn(primary),
    secondary,
    danger: getTheme(DEFAULT_THEME_ID)[mode].danger,
  };
}

/** The bundled brand font for `slug`, or the default theme's system font. */
function brandTypography(slug: string): Typography {
  const font = brandFont(slug);
  return font === null
    ? getTheme(DEFAULT_THEME_ID).typography
    : { fontFamily: font.stack, bundledFont: font.slug };
}

/**
 * The wallet theme for `denom`'s branding package, or `null` when the package
 * fails the readability guard in either mode (the caller then uses the default
 * skin). See module docs for the derivation rules.
 */
export function brandTheme(denom: string, branding: DenomBranding): Theme | null {
  if (!MODES.every((mode) => isReadable(branding[mode]))) {
    return null;
  }
  const fallback = getTheme(DEFAULT_THEME_ID);
  return {
    id: BRAND_THEME_ID_PREFIX + denom,
    name: 'Token brand',
    light: brandPalette(branding.light, 'light'),
    dark: brandPalette(branding.dark, 'dark'),
    typography: brandTypography(branding.font),
    spacing: fallback.spacing,
    radii: fallback.radii,
  };
}
