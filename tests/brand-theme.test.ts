/**
 * Brand package → wallet theme (BUS-33): the derived colours, the fixed danger
 * colour, the bundled-font mapping and the WCAG AA readability guard.
 */

import { describe, expect, it } from 'vitest';
import type { DenomBranding } from '../src/chain/branding';
import { brandTheme } from '../src/theme/brand-theme';
import { contrastRatio } from '../src/theme/colour';
import { BRAND_FONT_SLUGS, brandFont } from '../src/theme/fonts';
import { DEFAULT_THEME_ID, getTheme, SYSTEM_FONT } from '../src/theme/themes';

const DENOM = 'factory/bze1abc/xyz';

// The dapps' brand-kit starting point: neutral backgrounds, amber accents.
const BRANDING: DenomBranding = {
  font: 'inter',
  light: { background: '#FFFFFF', text: '#111827', primary: '#D97706', secondary: '#6B7280' },
  dark: { background: '#111827', text: '#F9FAFB', primary: '#FBBF24', secondary: '#9CA3AF' },
};

const DEFAULT = getTheme(DEFAULT_THEME_ID);

function built(branding: DenomBranding = BRANDING) {
  const theme = brandTheme(DENOM, branding);
  expect(theme).not.toBeNull();
  return theme!;
}

describe('brandTheme (BUS-33)', () => {
  it('uses the four brand colours as given, per mode', () => {
    const theme = built();
    for (const mode of ['light', 'dark'] as const) {
      expect(theme[mode].background).toBe(BRANDING[mode].background);
      expect(theme[mode].text).toBe(BRANDING[mode].text);
      expect(theme[mode].primary).toBe(BRANDING[mode].primary);
      expect(theme[mode].secondary).toBe(BRANDING[mode].secondary);
    }
  });

  it('derives surface, border and muted text from background and text', () => {
    const theme = built();
    // surface = bg 6% towards text, border = bg 15% towards text,
    // textMuted = text 40% towards bg.
    expect(theme.light).toMatchObject({
      surface: '#f1f1f2',
      border: '#dbdcdf',
      textMuted: '#70747d',
    });
    expect(theme.dark).toMatchObject({
      surface: '#1f2634',
      border: '#343a47',
      textMuted: '#9ca0a6',
    });
  });

  it('picks black or white primaryText, whichever contrasts more with primary', () => {
    const theme = built({
      ...BRANDING,
      light: { ...BRANDING.light, primary: '#1E3A8A' },
    });
    expect(theme.light.primaryText).toBe('#ffffff');
    expect(theme.dark.primaryText).toBe('#000000');
    for (const mode of ['light', 'dark'] as const) {
      const other = theme[mode].primaryText === '#ffffff' ? '#000000' : '#ffffff';
      expect(contrastRatio(theme[mode].primaryText, theme[mode].primary)).toBeGreaterThanOrEqual(
        contrastRatio(other, theme[mode].primary),
      );
    }
  });

  it('never lets the brand control the danger colour', () => {
    const theme = built({
      ...BRANDING,
      light: { ...BRANDING.light, primary: '#00FF00', secondary: '#00FF00' },
    });
    expect(theme.light.danger).toBe(DEFAULT.light.danger);
    expect(theme.dark.danger).toBe(DEFAULT.dark.danger);
  });

  it("keeps the default theme's spacing and radii", () => {
    const theme = built();
    expect(theme.spacing).toEqual(DEFAULT.spacing);
    expect(theme.radii).toEqual(DEFAULT.radii);
  });

  it('gets a per-denom id distinct from every predefined theme', () => {
    expect(built().id).toBe(`brand:${DENOM}`);
  });

  it('uses the bundled brand font, with the system font as fallback', () => {
    const theme = built({ ...BRANDING, font: 'space-grotesk' });
    expect(theme.typography).toEqual({
      fontFamily: `'Space Grotesk', ${SYSTEM_FONT}`,
      bundledFont: 'space-grotesk',
    });
  });

  it('maps every one of the six bundled fonts', () => {
    expect(BRAND_FONT_SLUGS).toEqual([
      'inter',
      'roboto',
      'poppins',
      'montserrat',
      'space-grotesk',
      'jetbrains-mono',
    ]);
    for (const slug of BRAND_FONT_SLUGS) {
      const theme = built({ ...BRANDING, font: slug });
      expect(theme.typography.bundledFont).toBe(slug);
      expect(theme.typography.fontFamily).toBe(brandFont(slug)!.stack);
    }
    expect(brandFont('jetbrains-mono')!.stack).toMatch(/^'JetBrains Mono', .*monospace$/);
  });

  it('falls back to the system font for an unknown slug, keeping the brand colours', () => {
    const theme = built({ ...BRANDING, font: 'comic-sans' });
    expect(theme.typography).toEqual(DEFAULT.typography);
    expect(theme.typography.bundledFont).toBeUndefined();
    expect(theme.light.background).toBe(BRANDING.light.background);
    expect(theme.dark.primary).toBe(BRANDING.dark.primary);
    expect(brandFont('comic-sans')).toBeNull();
    expect(brandFont('toString')).toBeNull();
  });

  it('accepts text on background right at the WCAG AA line', () => {
    // #767676 on white is 4.54:1.
    expect(
      brandTheme(DENOM, { ...BRANDING, light: { ...BRANDING.light, text: '#767676' } }),
    ).not.toBeNull();
  });

  it('rejects the whole package when light-mode text is below 4.5:1', () => {
    // #777777 on white is 4.48:1.
    expect(
      brandTheme(DENOM, { ...BRANDING, light: { ...BRANDING.light, text: '#777777' } }),
    ).toBeNull();
  });

  it('rejects the whole package when dark-mode text is below 4.5:1', () => {
    expect(
      brandTheme(DENOM, { ...BRANDING, dark: { ...BRANDING.dark, text: '#374151' } }),
    ).toBeNull();
  });

  it('does not check primary on background', () => {
    // A pale yellow accent on white is far below 4.5:1, by design.
    expect(
      brandTheme(DENOM, { ...BRANDING, light: { ...BRANDING.light, primary: '#FDE68A' } }),
    ).not.toBeNull();
  });
});
