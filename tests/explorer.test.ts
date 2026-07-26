/**
 * Block-explorer links for the send success state (BUS-23).
 */

import { describe, expect, it } from 'vitest';
import { BZE_EXPLORER_BASE_URL } from '../src/chain/constants';
import { txExplorerUrl } from '../src/chain/explorer';

describe('txExplorerUrl (BUS-23)', () => {
  it('builds an explorer /tx/ link for the hash', () => {
    expect(txExplorerUrl('ABC123DEF')).toBe(`${BZE_EXPLORER_BASE_URL}/tx/ABC123DEF`);
  });

  it('trims and URL-encodes the hash', () => {
    expect(txExplorerUrl('  ABC/123  ')).toBe(`${BZE_EXPLORER_BASE_URL}/tx/ABC%2F123`);
  });

  it('refuses an empty hash rather than link to the tx index', () => {
    expect(() => txExplorerUrl('   ')).toThrow(/empty tx hash/i);
  });

  it('points at the documented BeeZee mainnet explorer', () => {
    expect(BZE_EXPLORER_BASE_URL).toBe('https://explorer.getbze.com/bze');
  });
});
