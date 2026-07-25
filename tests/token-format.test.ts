/**
 * `formatTokenAmount` (BUS-19): base-unit integers → display strings. This is the
 * one place amounts get scaled and grouped, and it must stay BigInt-exact for
 * balances well past `Number.MAX_SAFE_INTEGER`.
 */

import { describe, expect, it } from 'vitest';
import { ACTIVE_TOKEN, formatTokenAmount } from '../src/chain/token';
import { BZE_DISPLAY_DECIMALS } from '../src/chain/constants';

const DECIMALS = BZE_DISPLAY_DECIMALS; // 6

describe('formatTokenAmount (BUS-19)', () => {
  it('renders whole amounts without a decimal point', () => {
    expect(formatTokenAmount('0', DECIMALS)).toBe('0');
    expect(formatTokenAmount('1000000', DECIMALS)).toBe('1');
    expect(formatTokenAmount('42000000', DECIMALS)).toBe('42');
  });

  it('scales the fractional part by the decimals', () => {
    expect(formatTokenAmount('1234567', DECIMALS)).toBe('1.234567');
    expect(formatTokenAmount('1', DECIMALS)).toBe('0.000001');
    expect(formatTokenAmount('999', DECIMALS)).toBe('0.000999');
    expect(formatTokenAmount('1000001', DECIMALS)).toBe('1.000001');
  });

  it('trims trailing zeros in the fraction', () => {
    expect(formatTokenAmount('1230000', DECIMALS)).toBe('1.23');
    expect(formatTokenAmount('1500000', DECIMALS)).toBe('1.5');
    expect(formatTokenAmount('100', DECIMALS)).toBe('0.0001');
  });

  it('groups the integer part in thousands', () => {
    expect(formatTokenAmount('1234567890', DECIMALS)).toBe('1,234.56789');
    expect(formatTokenAmount('12000000000000', DECIMALS)).toBe('12,000,000');
    expect(formatTokenAmount('1000000000000', DECIMALS)).toBe('1,000,000');
  });

  it('stays exact well beyond Number.MAX_SAFE_INTEGER', () => {
    // 9,007,199,254.740993 BZE — the fractional 3 would be lost via a JS number.
    expect(formatTokenAmount('9007199254740993', DECIMALS)).toBe('9,007,199,254.740993');
  });

  it('supports other decimal scales, including zero', () => {
    expect(formatTokenAmount('123', 0)).toBe('123');
    expect(formatTokenAmount('123456789', 0)).toBe('123,456,789');
    expect(formatTokenAmount('123456789', 2)).toBe('1,234,567.89');
  });

  it('formats the active token (BZE, 6 decimals) end to end', () => {
    expect(ACTIVE_TOKEN.decimals).toBe(6);
    expect(formatTokenAmount('2500000', ACTIVE_TOKEN.decimals)).toBe('2.5');
  });

  it('rejects anything that is not a non-negative integer string', () => {
    for (const bad of ['', '-5', '1.5', 'abc', '1e6', ' 5', '0x10', '5 ']) {
      expect(() => formatTokenAmount(bad, DECIMALS)).toThrow();
    }
  });

  it('rejects invalid decimals', () => {
    expect(() => formatTokenAmount('1', -1)).toThrow();
    expect(() => formatTokenAmount('1', 1.5)).toThrow();
  });
});
