/**
 * The bundled brand-font files, and registering them on demand (BUS-33).
 *
 * Each of the six brand fonts ({@link ../theme/fonts}) ships as local woff2
 * files — latin subset, only the weights `popup.css` uses (400, 600, 700) —
 * taken from the exactly pinned `@fontsource/*` packages, so they are part of
 * the reproducible build (BUILD.md). Nothing is ever fetched from the network:
 * the URLs below point inside the extension package. Licences:
 * `public/licenses/FONTS.txt` (SIL Open Font License 1.1).
 *
 * A font's faces are registered only when the active theme uses it, and only
 * once per popup. A registered `FontFace` is loaded by the browser on first use
 * (from the extension package), so a token without a brand font costs nothing.
 */

import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2';
import roboto400 from '@fontsource/roboto/files/roboto-latin-400-normal.woff2';
import roboto600 from '@fontsource/roboto/files/roboto-latin-600-normal.woff2';
import roboto700 from '@fontsource/roboto/files/roboto-latin-700-normal.woff2';
import poppins400 from '@fontsource/poppins/files/poppins-latin-400-normal.woff2';
import poppins600 from '@fontsource/poppins/files/poppins-latin-600-normal.woff2';
import poppins700 from '@fontsource/poppins/files/poppins-latin-700-normal.woff2';
import montserrat400 from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff2';
import montserrat600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2';
import montserrat700 from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2';
import spaceGrotesk400 from '@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2';
import spaceGrotesk600 from '@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2';
import spaceGrotesk700 from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2';
import jetbrainsMono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2';
import jetbrainsMono600 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2';
import jetbrainsMono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2';
import { brandFont, type BrandFontSlug } from '../theme/fonts';

type Weight = 400 | 600 | 700;

const FILES: Readonly<Record<BrandFontSlug, Readonly<Record<Weight, string>>>> = {
  inter: { 400: inter400, 600: inter600, 700: inter700 },
  roboto: { 400: roboto400, 600: roboto600, 700: roboto700 },
  poppins: { 400: poppins400, 600: poppins600, 700: poppins700 },
  montserrat: { 400: montserrat400, 600: montserrat600, 700: montserrat700 },
  'space-grotesk': { 400: spaceGrotesk400, 600: spaceGrotesk600, 700: spaceGrotesk700 },
  'jetbrains-mono': { 400: jetbrainsMono400, 600: jetbrainsMono600, 700: jetbrainsMono700 },
};

const registered = new Set<string>();

/**
 * Register the bundled faces of brand font `slug` with the popup document, once.
 * Does nothing for `undefined`, an unknown slug, or outside a DOM.
 */
export function registerBrandFont(slug: string | undefined): void {
  if (slug === undefined || registered.has(slug) || typeof FontFace === 'undefined') {
    return;
  }
  const font = brandFont(slug);
  if (font === null) {
    return;
  }
  for (const [weight, url] of Object.entries(FILES[font.slug])) {
    document.fonts.add(
      new FontFace(font.family, `url(${url}) format('woff2')`, {
        weight,
        style: 'normal',
        display: 'swap',
      }),
    );
  }
  registered.add(slug);
}
