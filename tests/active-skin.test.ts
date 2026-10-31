/**
 * The active token → theme mapping (BUS-34, BUS-33): BZE gets the hard-coded
 * BZE skin, a token with valid and readable on-chain branding gets its brand
 * theme, and everything else (and no token) gets the neutral default skin.
 */

import { describe, expect, it } from 'vitest';
import type { DenomBranding } from '../src/chain/branding';
import { BZE_BASE_DENOM } from '../src/chain/constants';
import { activeThemeId, resolveActiveTheme } from '../src/theme/active-skin';
import { BZE_THEME_ID, DEFAULT_THEME_ID, getTheme, hasTheme } from '../src/theme/themes';
import { FakeBrandingReader } from './support/services';

const TOKEN = 'factory/bze1abc/xyz';

const BRANDING: DenomBranding = {
  font: 'poppins',
  light: { background: '#FFFFFF', text: '#111827', primary: '#D97706', secondary: '#6B7280' },
  dark: { background: '#111827', text: '#F9FAFB', primary: '#FBBF24', secondary: '#9CA3AF' },
};

describe('activeThemeId (BUS-34)', () => {
  it('skins the native BZE token with the BZE theme', () => {
    expect(activeThemeId(BZE_BASE_DENOM)).toBe(BZE_THEME_ID);
  });

  it('falls back to the default skin for any other token', () => {
    expect(activeThemeId(TOKEN)).toBe(DEFAULT_THEME_ID);
  });

  it('uses the default skin when there is no active token', () => {
    expect(activeThemeId(null)).toBe(DEFAULT_THEME_ID);
  });

  it('only ever names a theme that actually exists', () => {
    for (const denom of [BZE_BASE_DENOM, TOKEN, null]) {
      expect(hasTheme(activeThemeId(denom))).toBe(true);
    }
  });
});

describe('resolveActiveTheme (BUS-33)', () => {
  it('keeps the hard-coded BZE theme without reading branding', async () => {
    const branding = new FakeBrandingReader({ [BZE_BASE_DENOM]: BRANDING });
    expect(await resolveActiveTheme(BZE_BASE_DENOM, branding)).toBe(getTheme(BZE_THEME_ID));
    expect(branding.queriedDenoms).toEqual([]);
  });

  it('uses the default theme, without a read, when there is no active token', async () => {
    const branding = new FakeBrandingReader();
    expect(await resolveActiveTheme(null, branding)).toBe(getTheme(DEFAULT_THEME_ID));
    expect(branding.queriedDenoms).toEqual([]);
  });

  it("builds a branded token's theme from its on-chain package", async () => {
    const branding = new FakeBrandingReader({ [TOKEN]: BRANDING });
    const theme = await resolveActiveTheme(TOKEN, branding);
    expect(branding.queriedDenoms).toEqual([TOKEN]);
    expect(theme.id).toBe(`brand:${TOKEN}`);
    expect(theme.light.background).toBe('#FFFFFF');
    expect(theme.dark.primary).toBe('#FBBF24');
    expect(theme.typography.bundledFont).toBe('poppins');
  });

  it('uses the default theme for a token without branding', async () => {
    const theme = await resolveActiveTheme(TOKEN, new FakeBrandingReader());
    expect(theme).toBe(getTheme(DEFAULT_THEME_ID));
  });

  it('uses the default theme, in both modes, when one mode is unreadable', async () => {
    const unreadable: DenomBranding = {
      ...BRANDING,
      dark: { ...BRANDING.dark, text: '#1F2937' },
    };
    const theme = await resolveActiveTheme(TOKEN, new FakeBrandingReader({ [TOKEN]: unreadable }));
    expect(theme).toBe(getTheme(DEFAULT_THEME_ID));
  });

  it('uses the default theme when the branding read fails', async () => {
    const theme = await resolveActiveTheme(
      TOKEN,
      new FakeBrandingReader(new Error('network down')),
    );
    expect(theme).toBe(getTheme(DEFAULT_THEME_ID));
  });

  it('follows branding as it appears and disappears', async () => {
    const byDenom: Record<string, DenomBranding> = {};
    const branding = new FakeBrandingReader(byDenom);
    expect((await resolveActiveTheme(TOKEN, branding)).id).toBe(DEFAULT_THEME_ID);
    byDenom[TOKEN] = BRANDING;
    expect((await resolveActiveTheme(TOKEN, branding)).id).toBe(`brand:${TOKEN}`);
    delete byDenom[TOKEN];
    expect((await resolveActiveTheme(TOKEN, branding)).id).toBe(DEFAULT_THEME_ID);
  });
});
