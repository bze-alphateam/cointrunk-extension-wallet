/**
 * The design-token vocabulary the wallet's UI is themed with (BUS-29).
 *
 * A **theme** is a named bundle of tokens split along two axes:
 *  - **colour**, which is mode-dependent — every theme carries a full `light`
 *    and `dark` {@link Palette}, because dark/light is holder-controlled and a
 *    brand supplies both (see Confluence "4. Token Eligibility & Branding
 *    Criteria" / "3. Technical Design").
 *  - **typography, spacing, radii**, which are mode-independent.
 *
 * Tokens reach the DOM as CSS custom properties under the `--ct-` prefix, which
 * every popup stylesheet already reads (`var(--ct-bg)`, `var(--ct-accent)`, …).
 * Theming the UI is therefore just setting these variables on the root element
 * — {@link ../theme/apply.applyTheme} — and switching themes or modes at
 * runtime is re-setting them. The mapping from token to variable name lives in
 * one place, {@link themeToCssVars}, so the TypeScript themes and the CSS
 * fallbacks in `popup.css` cannot drift apart silently.
 *
 * This ticket defines the token *structure* and a set of predefined themes
 * (see {@link ../theme/themes}); mapping an external brand package's four
 * colours onto a full palette is a later branding ticket. The token set is a
 * superset of the brand package's fields (background / text / primary /
 * secondary) plus the supporting colours the wallet chrome needs (surface,
 * border, muted, danger, and a readable on-primary colour).
 */

/** Which colour palette of a theme is showing; holder-controlled. */
export type ThemeMode = 'light' | 'dark';

/** The colour tokens, one set per {@link ThemeMode}. All values are CSS colours. */
export interface Palette {
  /** Page background. */
  readonly background: string;
  /** Raised surfaces: cards, inputs, secondary buttons. */
  readonly surface: string;
  /** Primary text colour. */
  readonly text: string;
  /** De-emphasised text: hints, captions, links-at-rest. */
  readonly textMuted: string;
  /** Hairlines and input borders. */
  readonly border: string;
  /** Brand/action colour: primary buttons, focus rings, active accents. */
  readonly primary: string;
  /** Text/icon colour that stays readable on top of {@link primary}. */
  readonly primaryText: string;
  /** Secondary brand colour for lesser accents. */
  readonly secondary: string;
  /** Error/danger colour: failed states, destructive actions, warnings. */
  readonly danger: string;
}

/** Mode-independent type tokens. */
export interface Typography {
  /** The CSS `font-family` stack applied to the whole popup. */
  readonly fontFamily: string;
}

/** Mode-independent spacing scale (CSS length strings). */
export interface Spacing {
  readonly xs: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
}

/** Mode-independent corner-radius scale (CSS length strings). */
export interface Radii {
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
}

/** A complete, runtime-selectable theme, addressed by {@link Theme.id}. */
export interface Theme {
  /** Stable id used to select the theme at runtime (e.g. `'default'`, `'bze'`). */
  readonly id: string;
  /** Human-readable label for a theme picker. */
  readonly name: string;
  readonly light: Palette;
  readonly dark: Palette;
  readonly typography: Typography;
  readonly spacing: Spacing;
  readonly radii: Radii;
}

/** A flat set of CSS custom properties (`--ct-*` → value) ready to apply to an element. */
export type CssVars = Readonly<Record<string, string>>;

/**
 * Flatten a theme, in a given mode, to the CSS custom properties the
 * stylesheets consume. This is the single source of truth for token → variable
 * names; `popup.css` mirrors these as static fallbacks for the pre-JS paint.
 */
export function themeToCssVars(theme: Theme, mode: ThemeMode): CssVars {
  const palette = theme[mode];
  return {
    '--ct-bg': palette.background,
    '--ct-surface': palette.surface,
    '--ct-fg': palette.text,
    '--ct-muted': palette.textMuted,
    '--ct-border': palette.border,
    '--ct-accent': palette.primary,
    '--ct-accent-fg': palette.primaryText,
    '--ct-secondary': palette.secondary,
    '--ct-danger': palette.danger,
    '--ct-font': theme.typography.fontFamily,
    '--ct-space-xs': theme.spacing.xs,
    '--ct-space-sm': theme.spacing.sm,
    '--ct-space-md': theme.spacing.md,
    '--ct-space-lg': theme.spacing.lg,
    '--ct-space-xl': theme.spacing.xl,
    '--ct-radius-sm': theme.radii.sm,
    '--ct-radius-md': theme.radii.md,
    '--ct-radius-lg': theme.radii.lg,
  };
}
