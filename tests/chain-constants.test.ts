import { describe, expect, it } from 'vitest';
import {
  BIP44_PURPOSE,
  BZE_BECH32_PREFIX,
  BZE_CHAIN_ID,
  BZE_COIN_TYPE,
  BZE_HD_PATH,
} from '../src/chain/constants';

// These values are confirmed against the BeeZee chain source and the Cosmos
// chain-registry (BUS-14). A change here would silently break address
// derivation, so pin them and fail loudly if anyone edits the constants.
describe('BeeZee chain constants', () => {
  it('uses the "bze" bech32 prefix', () => {
    expect(BZE_BECH32_PREFIX).toBe('bze');
  });

  it('uses the Cosmos default coin type 118', () => {
    expect(BZE_COIN_TYPE).toBe(118);
  });

  it('targets the beezee-1 mainnet chain id', () => {
    expect(BZE_CHAIN_ID).toBe('beezee-1');
  });

  it("derives on the standard BIP-44 path m/44'/118'/0'/0/0", () => {
    expect(BIP44_PURPOSE).toBe(44);
    expect(BZE_HD_PATH).toBe("m/44'/118'/0'/0/0");
  });
});
