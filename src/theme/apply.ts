/**
 * Applying a theme to the live UI, and picking the holder's colour mode
 * (BUS-29).
 *
 * "Apply" means writing the theme's CSS custom properties onto a target style
 * declaration — the root element's, in the popup — after which every
 * `var(--ct-*)` in the stylesheets resolves to the selected theme. Switching
 * theme or mode at runtime is just calling {@link applyTheme} again; there is
 * no per-component wiring.
 *
 * The write target is injectable so this is testable without a DOM (the suite
 * runs in Node): pass any object with `setProperty`, or let it default to the
 * document root when one exists.
 */

import { getTheme } from './themes';
import { themeToCssVars, type CssVars, type Theme, type ThemeMode } from './tokens';

/** The slice of `CSSStyleDeclaration` this module needs — injectable in tests. */
export interface StyleTarget {
  setProperty(property: string, value: string): void;
}

/** The document root's style, or null when there is no DOM (e.g. under test/Node). */
function documentRootStyle(): StyleTarget | null {
  return typeof document === 'undefined' ? null : document.documentElement.style;
}

/** Write a set of CSS custom properties onto `target`. */
export function applyCssVars(vars: CssVars, target: StyleTarget): void {
  for (const [name, value] of Object.entries(vars)) {
    target.setProperty(name, value);
  }
}

/**
 * Apply a theme (by id or object) in the given mode, returning the resolved
 * {@link Theme}. An unknown id resolves to the default theme (see
 * {@link getTheme}). When no `target` is given it defaults to the document
 * root; in a DOM-less environment with no target, it resolves the theme but
 * writes nothing.
 */
export function applyTheme(
  theme: string | Theme,
  mode: ThemeMode,
  target: StyleTarget | null = documentRootStyle(),
): Theme {
  const resolved = typeof theme === 'string' ? getTheme(theme) : theme;
  if (target !== null) {
    applyCssVars(themeToCssVars(resolved, mode), target);
  }
  return resolved;
}

/**
 * The holder's preferred colour mode from the OS/browser setting, defaulting to
 * `light` when it can't be read. Dark/light is holder-controlled; a later
 * ticket can layer a manual override on top of this.
 */
export function preferredMode(): ThemeMode {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}
