/**
 * Colour maths for the branding engine (BUS-33): sRGB mixing and the WCAG
 * contrast ratio the readability guard is built on.
 */

import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  mixColours,
  readableOn,
  relativeLuminance,
  WCAG_AA_TEXT_CONTRAST,
} from '../src/theme/colour';

describe('mixColours (BUS-33)', () => {
  it('returns the endpoints at 0 and 1', () => {
    expect(mixColours('#FFFFFF', '#111827', 0)).toBe('#ffffff');
    expect(mixColours('#FFFFFF', '#111827', 1)).toBe('#111827');
  });

  it('blends each channel and rounds', () => {
    expect(mixColours('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColours('#FFFFFF', '#111827', 0.06)).toBe('#f1f1f2');
  });

  it('rejects a colour that is not #RRGGBB and an out-of-range amount', () => {
    expect(() => mixColours('#fff', '#000000', 0.5)).toThrow();
    expect(() => mixColours('#ffffff', 'black', 0.5)).toThrow();
    expect(() => mixColours('#ffffff', '#000000', 1.5)).toThrow();
    expect(() => mixColours('#ffffff', '#000000', Number.NaN)).toThrow();
  });
});

describe('contrastRatio (BUS-33)', () => {
  it('spans 1 (same colour) to 21 (black on white)', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 10);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#d97706', '#ffffff')).toBe(contrastRatio('#ffffff', '#d97706'));
  });

  it('puts the WCAG AA boundary where accessibility checkers do', () => {
    // #767676 is the classic lightest grey that passes AA on white; #777777 fails.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(WCAG_AA_TEXT_CONTRAST);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(WCAG_AA_TEXT_CONTRAST);
  });
});

describe('readableOn (BUS-33)', () => {
  it('picks black on light colours and white on dark ones', () => {
    expect(readableOn('#fbbf24')).toBe('#000000');
    expect(readableOn('#d97706')).toBe('#000000');
    expect(readableOn('#1e3a8a')).toBe('#ffffff');
    expect(readableOn('#000000')).toBe('#ffffff');
  });
});
