/**
 * The default (neutral) skin (BUS-30): pairing the neutral `default` theme with
 * a token's chain-sourced identity, as the fallback the branding gate lands on.
 */

import { describe, expect, it } from 'vitest';
import { applyTheme, type StyleTarget } from '../src/theme/apply';
import { defaultSkin } from '../src/theme/skin';
import { DEFAULT_THEME_ID, getTheme } from '../src/theme/themes';
import { themeToCssVars } from '../src/theme/tokens';
import type { TokenIdentity } from '../src/chain/metadata';

/** A factory token whose creator set a full identity on chain (name + logo). */
const VDL: TokenIdentity = {
  denom: 'factory/bze13gzq5eqf9f/uvdl',
  name: 'Vidulum',
  symbol: 'VDL',
  decimals: 6,
  logoUri: 'https://cdn.example/vdl.png',
};

/** The native token — pinned identity, no logo on chain (BUS-26 defaults). */
const BZE: TokenIdentity = {
  denom: 'ubze',
  name: 'BZE',
  symbol: 'BZE',
  decimals: 6,
  logoUri: null,
};

/** A factory token with no chain metadata: identity degraded to the denom tail. */
const BARE: TokenIdentity = {
  denom: 'factory/bze1abc/umeme',
  name: 'umeme',
  symbol: 'umeme',
  decimals: 0,
  logoUri: null,
};

/** Records setProperty calls so a test can assert what a skin applied. */
function recordingTarget(): { target: StyleTarget; props: Map<string, string> } {
  const props = new Map<string, string>();
  return { target: { setProperty: (name, value) => props.set(name, value) }, props };
}

describe('defaultSkin (BUS-30)', () => {
  it('pairs the neutral default theme with the token identity', () => {
    const skin = defaultSkin(VDL);
    expect(skin.theme).toEqual(getTheme(DEFAULT_THEME_ID));
    expect(skin.theme.id).toBe(DEFAULT_THEME_ID);
    expect(skin.identity).toBe(VDL);
    expect(skin.branded).toBe(false);
  });

  it('carries chain-sourced identity (logo/name) through unchanged', () => {
    const skin = defaultSkin(VDL);
    expect(skin.identity.name).toBe('Vidulum');
    expect(skin.identity.symbol).toBe('VDL');
    expect(skin.identity.logoUri).toBe('https://cdn.example/vdl.png');
  });

  it('still renders a complete skin when the token has no on-chain logo/name', () => {
    const skin = defaultSkin(BARE);
    // Identity degrades per-field (BUS-26), and the skin uses it as-is.
    expect(skin.identity.logoUri).toBeNull();
    expect(skin.identity.name).toBe('umeme');
    // The theme is nonetheless complete — every stylesheet variable is set.
    const vars = themeToCssVars(skin.theme, 'light');
    expect(vars['--ct-bg']).toBeTruthy();
    expect(vars['--ct-accent']).toBeTruthy();
    expect(vars['--ct-font']).toBeTruthy();
  });

  it('resolves to the same neutral theme for any token (branding-independent)', () => {
    for (const identity of [VDL, BZE, BARE]) {
      const skin = defaultSkin(identity);
      expect(skin.theme).toEqual(getTheme(DEFAULT_THEME_ID));
      expect(skin.branded).toBe(false);
    }
  });

  it('is marked as the unbranded fallback for the branding gate', () => {
    // The gate (BUS-32) lands here when a token is not branded; `branded: false`
    // lets callers tell this fallback apart from a resolved brand skin.
    expect(defaultSkin(BZE).branded).toBe(false);
    expect(defaultSkin(BZE).theme.id).toBe(DEFAULT_THEME_ID);
  });

  it('applies as the neutral default palette (the gate fallback in action)', () => {
    const skin = defaultSkin(VDL);
    const { target, props } = recordingTarget();
    applyTheme(skin.theme, 'dark', target);
    expect(props.get('--ct-bg')).toBe('#0f172a'); // default dark background
    expect(props.get('--ct-accent')).toBe('#2dd4bf'); // default teal accent
  });
});
