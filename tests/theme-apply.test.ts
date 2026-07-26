/**
 * Applying themes (BUS-29): writing a theme's CSS variables onto a style
 * target, mode selection, and unknown-id fallback. Runs without a DOM by
 * injecting a fake StyleTarget.
 */

import { describe, expect, it } from 'vitest';
import { applyCssVars, applyTheme, type StyleTarget } from '../src/theme/apply';
import { DEFAULT_THEME_ID, getTheme } from '../src/theme/themes';
import { themeToCssVars } from '../src/theme/tokens';

/** Records setProperty calls so a test can assert what was written. */
function recordingTarget(): { target: StyleTarget; props: Map<string, string> } {
  const props = new Map<string, string>();
  return { target: { setProperty: (name, value) => props.set(name, value) }, props };
}

describe('applyCssVars (BUS-29)', () => {
  it('writes every variable onto the target', () => {
    const { target, props } = recordingTarget();
    applyCssVars({ '--a': '1', '--b': '2' }, target);
    expect(props.get('--a')).toBe('1');
    expect(props.get('--b')).toBe('2');
  });
});

describe('applyTheme (BUS-29)', () => {
  it('writes the full resolved variable set for the theme and mode', () => {
    const { target, props } = recordingTarget();
    applyTheme(DEFAULT_THEME_ID, 'dark', target);

    const expected = themeToCssVars(getTheme(DEFAULT_THEME_ID), 'dark');
    for (const [name, value] of Object.entries(expected)) {
      expect(props.get(name)).toBe(value);
    }
  });

  it('applies the palette for the requested mode', () => {
    const { target: dark, props: darkProps } = recordingTarget();
    const { target: light, props: lightProps } = recordingTarget();
    applyTheme(DEFAULT_THEME_ID, 'dark', dark);
    applyTheme(DEFAULT_THEME_ID, 'light', light);

    expect(darkProps.get('--ct-bg')).toBe('#0f172a');
    expect(lightProps.get('--ct-bg')).toBe('#f8fafc');
  });

  it('selects a theme by id at runtime', () => {
    const { target, props } = recordingTarget();
    applyTheme('bze', 'dark', target);
    expect(props.get('--ct-accent')).toBe('#f0b90b'); // BeeZee gold
  });

  it('accepts a Theme object directly', () => {
    const { target, props } = recordingTarget();
    applyTheme(getTheme('midnight'), 'light', target);
    expect(props.get('--ct-accent')).toBe('#4f46e5');
  });

  it('falls back to the default theme for an unknown id, and returns it', () => {
    const { target, props } = recordingTarget();
    const applied = applyTheme('nope', 'dark', target);

    expect(applied.id).toBe(DEFAULT_THEME_ID);
    expect(props.get('--ct-bg')).toBe('#0f172a');
  });

  it('resolves the theme without throwing when given no DOM target', () => {
    // Node test env has no `document`; passing null must not write or throw.
    const applied = applyTheme(DEFAULT_THEME_ID, 'dark', null);
    expect(applied.id).toBe(DEFAULT_THEME_ID);
  });
});
