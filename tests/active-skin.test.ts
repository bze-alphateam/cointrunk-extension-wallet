/**
 * The active token → theme id mapping (BUS-34): BZE gets the BZE skin, every
 * other token (and no token) gets the neutral default skin.
 */

import { describe, expect, it } from 'vitest';
import { activeThemeId } from '../src/theme/active-skin';
import { BZE_BASE_DENOM } from '../src/chain/constants';
import { BZE_THEME_ID, DEFAULT_THEME_ID, hasTheme } from '../src/theme/themes';

describe('activeThemeId (BUS-34)', () => {
  it('skins the native BZE token with the BZE theme', () => {
    expect(activeThemeId(BZE_BASE_DENOM)).toBe(BZE_THEME_ID);
  });

  it('falls back to the default skin for any other token', () => {
    expect(activeThemeId('factory/bze1abc/xyz')).toBe(DEFAULT_THEME_ID);
  });

  it('uses the default skin when there is no active token', () => {
    expect(activeThemeId(null)).toBe(DEFAULT_THEME_ID);
  });

  it('only ever names a theme that actually exists', () => {
    for (const denom of [BZE_BASE_DENOM, 'factory/bze1abc/xyz', null]) {
      expect(hasTheme(activeThemeId(denom))).toBe(true);
    }
  });
});
