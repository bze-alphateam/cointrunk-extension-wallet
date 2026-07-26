/**
 * Recipient-address validation (BUS-22): bech32 + BeeZee prefix + account
 * length, with a distinct, user-readable error for each failure mode.
 */

import { describe, expect, it } from 'vitest';
import { isValidRecipientAddress, validateRecipientAddress } from '../src/chain/address';

// Real bech32 fixtures (valid checksums) built from the same 20-byte payload.
const BZE = 'bze1qv9pzxqlyckngw6zf9g9whn9d3eh4qvgvn4pp9';
const COSMOS = 'cosmos1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg3he2nj';
const SHORT = 'bze1qyqszqgpqyqszqgpu9sva2'; // valid bech32, 10-byte payload

describe('validateRecipientAddress (BUS-22)', () => {
  it('accepts a well-formed bze address and returns it trimmed', () => {
    expect(validateRecipientAddress(`  ${BZE}  `)).toBe(BZE);
  });

  it('rejects an empty / whitespace address', () => {
    expect(() => validateRecipientAddress('   ')).toThrow(/enter a recipient/i);
  });

  it('rejects a malformed / bad-checksum string', () => {
    expect(() => validateRecipientAddress('bze1notarealaddress')).toThrow(/valid address/i);
    expect(() => validateRecipientAddress(`${BZE}x`)).toThrow(/valid address/i);
  });

  it('rejects a valid address on the wrong chain (prefix ≠ bze)', () => {
    expect(() => validateRecipientAddress(COSMOS)).toThrow(/BeeZee/i);
  });

  it('rejects a bze bech32 string that is not a 20-byte account address', () => {
    expect(() => validateRecipientAddress(SHORT)).toThrow(/account address/i);
  });
});

describe('isValidRecipientAddress (BUS-22)', () => {
  it('mirrors the thrower without throwing', () => {
    expect(isValidRecipientAddress(BZE)).toBe(true);
    expect(isValidRecipientAddress(COSMOS)).toBe(false);
    expect(isValidRecipientAddress('')).toBe(false);
  });
});
