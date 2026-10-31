/**
 * The colour maths the branding engine needs (BUS-33): mixing two `#RRGGBB`
 * colours and the WCAG 2.x contrast ratio between them.
 *
 * Everything works on the `#RRGGBB` form the chain enforces for branding
 * colours (see {@link ../chain/branding}). Mixing is a plain per-channel blend
 * in sRGB, which is what designers expect from "mix X% towards Y" and is plenty
 * for deriving surfaces and borders. Contrast follows the WCAG definition
 * (relative luminance of linearised sRGB), so the readability guard means
 * exactly what an accessibility checker would report.
 */

/** WCAG AA minimum contrast ratio for normal-size body text. */
export const WCAG_AA_TEXT_CONTRAST = 4.5;

const HEX_PATTERN = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  const match = HEX_PATTERN.exec(hex);
  if (match === null) {
    throw new Error(`not a #RRGGBB colour: ${hex}`);
  }
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}

function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

/**
 * Blend `from` towards `to` by `amount` (0 = `from`, 1 = `to`), per sRGB
 * channel, rounded. Returns lowercase `#rrggbb`. Throws on a colour that is not
 * `#RRGGBB` or an amount outside 0..1.
 */
export function mixColours(from: string, to: string, amount: number): string {
  if (!(amount >= 0 && amount <= 1)) {
    throw new Error(`mix amount must be within 0..1: ${amount}`);
  }
  const a = parseHex(from);
  const b = parseHex(to);
  const blend = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return toHex([blend(a[0], b[0]), blend(a[1], b[1]), blend(a[2], b[2])]);
}

/** WCAG relative luminance of a `#RRGGBB` colour, 0 (black) .. 1 (white). */
function relativeLuminance(hex: string): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two colours, 1 (identical) .. 21 (black on white). Symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `#000000` or `#ffffff`, whichever reads better on `background` (ties go to black). */
export function readableOn(background: string): string {
  return contrastRatio('#000000', background) >= contrastRatio('#ffffff', background)
    ? '#000000'
    : '#ffffff';
}
