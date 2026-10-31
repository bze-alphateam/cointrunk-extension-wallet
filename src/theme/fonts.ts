/**
 * The brand fonts a token's on-chain branding can pick (BUS-33).
 *
 * Exactly the six fonts the BZE dapps' brand-kit editor offers (its
 * `BRANDING_FONTS` list), keyed by the slug the chain stores in
 * `DenomBranding.font`. Every one of them ships inside the extension as local
 * woff2 files (see `src/popup/brandFonts.ts`): the wallet never loads a font or
 * stylesheet from the network.
 *
 * This module is the pure half: slug → CSS family name and `font-family` stack,
 * with the system font as the fallback inside every stack. An unknown slug — a
 * font the chain accepts (any `^[a-z0-9-]{1,32}$`) but the wallet does not
 * bundle — resolves to `null`, and the branded theme then keeps the default
 * system font while its colours still apply.
 */

import { SYSTEM_FONT } from './themes';

/** The slugs of the bundled brand fonts, in the brand-kit editor's order. */
export const BRAND_FONT_SLUGS = [
  'inter',
  'roboto',
  'poppins',
  'montserrat',
  'space-grotesk',
  'jetbrains-mono',
] as const;

/** A bundled brand font's slug. */
export type BrandFontSlug = (typeof BRAND_FONT_SLUGS)[number];

/** A bundled brand font: its CSS family name and the full `font-family` stack. */
export interface BrandFont {
  readonly slug: BrandFontSlug;
  /** The family name the bundled `FontFace`s register under, e.g. `Inter`. */
  readonly family: string;
  /** The `font-family` value for the theme: the brand font, then system fallbacks. */
  readonly stack: string;
}

const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function font(slug: BrandFontSlug, family: string, fallback = SYSTEM_FONT): BrandFont {
  return { slug, family, stack: `'${family}', ${fallback}` };
}

const BRAND_FONTS: Readonly<Record<BrandFontSlug, BrandFont>> = {
  inter: font('inter', 'Inter'),
  roboto: font('roboto', 'Roboto'),
  poppins: font('poppins', 'Poppins'),
  montserrat: font('montserrat', 'Montserrat'),
  'space-grotesk': font('space-grotesk', 'Space Grotesk'),
  'jetbrains-mono': font('jetbrains-mono', 'JetBrains Mono', MONO_FALLBACK),
};

/** The bundled font for `slug`, or `null` when the wallet does not ship that font. */
export function brandFont(slug: string): BrandFont | null {
  return Object.prototype.hasOwnProperty.call(BRAND_FONTS, slug)
    ? BRAND_FONTS[slug as BrandFontSlug]
    : null;
}
