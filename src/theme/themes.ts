/**
 * The predefined themes shipped with the wallet, and lookup by id (BUS-29).
 *
 * `default` is the neutral skin the wallet falls back to whenever a token has
 * no brand of its own or fails the branding gate — it must always exist and is
 * what {@link getTheme} returns for an unknown id (an invalid selection can
 * never leave the UI unstyled). `bze` and `midnight` are concrete examples of
 * the token structure carrying a real brand's light+dark palettes; the later
 * branding ticket will generate themes like these from external brand packages
 * rather than hand-writing them.
 *
 * Typography, spacing and radii are shared across these predefined themes and
 * match the values `popup.css` was built with, so selecting any of them changes
 * only colour, not layout. (Per-brand fonts arrive with font bundling, a
 * separate open item in the Technical Design.)
 */

import type { Radii, Spacing, Theme, Typography } from './tokens';

/** The id of the neutral fallback theme; guaranteed to be present in {@link THEMES}. */
export const DEFAULT_THEME_ID = 'default';

/** The id of the native BZE brand theme — the skin for the BZE active token. */
export const BZE_THEME_ID = 'bze';

const SYSTEM_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Shared non-colour scales — the layout the popup stylesheet was authored
// against, so swapping palettes never shifts spacing or corners.
const TYPOGRAPHY: Typography = { fontFamily: SYSTEM_FONT };
const SPACING: Spacing = { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' };
const RADII: Radii = { sm: '6px', md: '10px', lg: '14px' };

/** Neutral slate + teal — the current wallet look, and the default skin. */
const DEFAULT_THEME: Theme = {
  id: DEFAULT_THEME_ID,
  name: 'Default',
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    border: '#334155',
    primary: '#2dd4bf',
    primaryText: '#04231f',
    secondary: '#64748b',
    danger: '#fca5a5',
  },
  light: {
    background: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    primary: '#0d9488',
    primaryText: '#ffffff',
    secondary: '#475569',
    danger: '#dc2626',
  },
  typography: TYPOGRAPHY,
  spacing: SPACING,
  radii: RADII,
};

/** BeeZee gold — the native BZE brand skin. */
const BZE_THEME: Theme = {
  id: BZE_THEME_ID,
  name: 'BeeZee',
  dark: {
    background: '#12100b',
    surface: '#1e1a12',
    text: '#faf7ef',
    textMuted: '#b8ad93',
    border: '#3a3222',
    primary: '#f0b90b',
    primaryText: '#12100b',
    secondary: '#d4a017',
    danger: '#fca5a5',
  },
  light: {
    background: '#fffdf5',
    surface: '#ffffff',
    text: '#1a1710',
    textMuted: '#6b6244',
    border: '#ece3c8',
    primary: '#b8860b',
    primaryText: '#ffffff',
    secondary: '#8a6d0b',
    danger: '#dc2626',
  },
  typography: TYPOGRAPHY,
  spacing: SPACING,
  radii: RADII,
};

/** Indigo — a second example brand skin. */
const MIDNIGHT_THEME: Theme = {
  id: 'midnight',
  name: 'Midnight',
  dark: {
    background: '#0b1020',
    surface: '#151b30',
    text: '#e8ecff',
    textMuted: '#8b93b8',
    border: '#2a3252',
    primary: '#6366f1',
    primaryText: '#ffffff',
    secondary: '#818cf8',
    danger: '#f87171',
  },
  light: {
    background: '#f5f6ff',
    surface: '#ffffff',
    text: '#0b1020',
    textMuted: '#555d80',
    border: '#dfe3f5',
    primary: '#4f46e5',
    primaryText: '#ffffff',
    secondary: '#6366f1',
    danger: '#dc2626',
  },
  typography: TYPOGRAPHY,
  spacing: SPACING,
  radii: RADII,
};

/** Every predefined theme, keyed by its id. */
export const THEMES: Readonly<Record<string, Theme>> = {
  [DEFAULT_THEME.id]: DEFAULT_THEME,
  [BZE_THEME.id]: BZE_THEME,
  [MIDNIGHT_THEME.id]: MIDNIGHT_THEME,
};

/** The ids of every predefined theme, for a picker or validation. */
export const THEME_IDS: readonly string[] = Object.keys(THEMES);

/** Whether `id` names a predefined theme. */
export function hasTheme(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(THEMES, id);
}

/**
 * The theme for `id`, or the {@link DEFAULT_THEME_ID default} theme when `id`
 * is unknown — selecting a theme can never leave the UI unstyled.
 */
export function getTheme(id: string): Theme {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID]!;
}

/** `{ id, name }` for every predefined theme, for building a picker. */
export function listThemes(): readonly { id: string; name: string }[] {
  return THEME_IDS.map((id) => ({ id, name: THEMES[id]!.name }));
}
