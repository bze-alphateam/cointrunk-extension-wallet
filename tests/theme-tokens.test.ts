/**
 * Theme tokens & registry (BUS-29): the token→CSS-variable mapping and the
 * predefined theme set with lookup-by-id.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID,
  getTheme,
  hasTheme,
  listThemes,
  THEME_IDS,
  THEMES,
} from '../src/theme/themes';
import { themeToCssVars } from '../src/theme/tokens';

/** Every CSS variable a complete theme must set — the stylesheet contract. */
const EXPECTED_VARS = [
  '--ct-bg',
  '--ct-surface',
  '--ct-fg',
  '--ct-muted',
  '--ct-border',
  '--ct-accent',
  '--ct-accent-fg',
  '--ct-secondary',
  '--ct-danger',
  '--ct-font',
  '--ct-space-xs',
  '--ct-space-sm',
  '--ct-space-md',
  '--ct-space-lg',
  '--ct-space-xl',
  '--ct-radius-sm',
  '--ct-radius-md',
  '--ct-radius-lg',
];

describe('themeToCssVars (BUS-29)', () => {
  it('maps the dark palette to the --ct-* colour variables', () => {
    const vars = themeToCssVars(getTheme(DEFAULT_THEME_ID), 'dark');
    expect(vars['--ct-bg']).toBe('#0f172a');
    expect(vars['--ct-accent']).toBe('#2dd4bf');
    expect(vars['--ct-accent-fg']).toBe('#04231f');
  });

  it('selects the palette by mode', () => {
    const theme = getTheme(DEFAULT_THEME_ID);
    expect(themeToCssVars(theme, 'light')['--ct-bg']).toBe('#f8fafc');
    expect(themeToCssVars(theme, 'dark')['--ct-bg']).toBe('#0f172a');
  });

  it('emits mode-independent type/spacing/radii identically in both modes', () => {
    const theme = getTheme(DEFAULT_THEME_ID);
    const light = themeToCssVars(theme, 'light');
    const dark = themeToCssVars(theme, 'dark');
    for (const v of ['--ct-font', '--ct-space-md', '--ct-radius-md']) {
      expect(light[v]).toBe(dark[v]);
    }
  });

  it('emits exactly the expected variable set', () => {
    const vars = themeToCssVars(getTheme(DEFAULT_THEME_ID), 'dark');
    expect(Object.keys(vars).sort()).toEqual([...EXPECTED_VARS].sort());
  });
});

describe('theme registry (BUS-29)', () => {
  it('includes the default theme and addresses it by the documented id', () => {
    expect(hasTheme(DEFAULT_THEME_ID)).toBe(true);
    expect(getTheme(DEFAULT_THEME_ID).id).toBe(DEFAULT_THEME_ID);
  });

  it('ships more than one predefined theme', () => {
    expect(THEME_IDS.length).toBeGreaterThan(1);
    expect(THEME_IDS).toContain('bze');
  });

  it('selects a theme at runtime by id', () => {
    expect(getTheme('midnight').name).toBe('Midnight');
  });

  it('falls back to the default theme for an unknown id (never unstyled)', () => {
    expect(getTheme('does-not-exist').id).toBe(DEFAULT_THEME_ID);
    expect(hasTheme('does-not-exist')).toBe(false);
  });

  it('lists every theme as { id, name } for a picker', () => {
    expect(listThemes()).toEqual(THEME_IDS.map((id) => ({ id, name: THEMES[id]!.name })));
  });

  it('every predefined theme yields a complete variable set in both modes', () => {
    for (const id of THEME_IDS) {
      const theme = THEMES[id]!;
      for (const mode of ['light', 'dark'] as const) {
        const vars = themeToCssVars(theme, mode);
        for (const v of EXPECTED_VARS) {
          expect(vars[v], `${id}/${mode} missing ${v}`).toBeTruthy();
        }
      }
    }
  });
});
