/**
 * The sticky active-token selection rule (BUS-34): stored wins, else the first
 * held denom, else none.
 */

import { describe, expect, it } from 'vitest';
import { selectStickyActiveDenom } from '../src/chain/active-token-selection';

describe('selectStickyActiveDenom (BUS-34)', () => {
  it('keeps the stored denom — it is sticky, whatever is held now', () => {
    expect(selectStickyActiveDenom('ubze', ['factory/bze1abc/xyz'])).toBe('ubze');
    // Sticky even once that balance is gone from the held set.
    expect(selectStickyActiveDenom('ubze', [])).toBe('ubze');
  });

  it('picks the first held denom when nothing is stored yet', () => {
    expect(selectStickyActiveDenom(null, ['ubze', 'factory/bze1abc/xyz'])).toBe('ubze');
    expect(selectStickyActiveDenom(null, ['factory/bze1abc/xyz', 'ubze'])).toBe(
      'factory/bze1abc/xyz',
    );
  });

  it('resolves to null for a brand-new account holding nothing', () => {
    expect(selectStickyActiveDenom(null, [])).toBeNull();
  });

  it('treats an empty stored denom as "none chosen yet"', () => {
    expect(selectStickyActiveDenom('', ['ubze'])).toBe('ubze');
    expect(selectStickyActiveDenom('', [])).toBeNull();
  });
});
