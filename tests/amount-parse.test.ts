/**
 * Parsing a typed amount into base units (BUS-22): the inverse of
 * `formatTokenAmount`, and the one place user input becomes an on-chain amount.
 */

import { describe, expect, it } from 'vitest';
import { formatTokenAmount, parseTokenAmount } from '../src/chain/token';

const DECIMALS = 6; // BZE

describe('parseTokenAmount (BUS-22)', () => {
  it('scales whole and fractional amounts to base units', () => {
    expect(parseTokenAmount('1', DECIMALS)).toBe('1000000');
    expect(parseTokenAmount('1.5', DECIMALS)).toBe('1500000');
    expect(parseTokenAmount('0.000001', DECIMALS)).toBe('1');
    expect(parseTokenAmount('1.234567', DECIMALS)).toBe('1234567');
  });

  it('trims surrounding whitespace', () => {
    expect(parseTokenAmount('  2.5  ', DECIMALS)).toBe('2500000');
  });

  it('round-trips with formatTokenAmount (for un-grouped values — format adds commas)', () => {
    for (const display of ['1', '1.234567', '42.5', '0.000999']) {
      expect(formatTokenAmount(parseTokenAmount(display, DECIMALS), DECIMALS)).toBe(display);
    }
  });

  it('does not round a large amount through a JS number', () => {
    // .991 at 6 decimals is 991000 base units, so the result ends in three zeros.
    expect(parseTokenAmount('9007199254740.991', DECIMALS)).toBe('9007199254740991000');
  });

  it('rejects an empty amount', () => {
    expect(() => parseTokenAmount('   ', DECIMALS)).toThrow(/enter an amount/i);
  });

  it('rejects non-numeric input, signs, separators and exponents', () => {
    for (const bad of ['abc', '1,000', '-1', '+1', '1e6', '1.2.3', '.5', '1.']) {
      expect(() => parseTokenAmount(bad, DECIMALS)).toThrow(/valid number/i);
    }
  });

  it('rejects more fractional digits than the token has decimals', () => {
    expect(() => parseTokenAmount('1.1234567', DECIMALS)).toThrow(/decimal places/i);
  });

  it('rejects zero — a send must move a positive amount', () => {
    expect(() => parseTokenAmount('0', DECIMALS)).toThrow(/greater than zero/i);
    expect(() => parseTokenAmount('0.000000', DECIMALS)).toThrow(/greater than zero/i);
  });
});
