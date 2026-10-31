/**
 * Fee coin + amount selection for a send (BUS-51): BZE when the BZE balance
 * covers it, else the active token when it is fee-eligible (converted at the
 * pool's spot price with a 10% margin), else blocked.
 */

import { describe, expect, it } from 'vitest';
import {
  bzeFeeForGas,
  NO_FEE_COIN_REASON,
  parseDecimal,
  selectSendFee,
  tokenFeeForBzeFee,
  type SendFeeInput,
} from '../src/chain/send-fee';

const PRICE = parseDecimal('0.010000000000000000');
const TOKEN = 'factory/bze1abc/uvdl';
// 1 VDL base unit is worth 2 ubze: native 1,000,000 vs token 500,000.
const RESERVES = { native: 1_000_000n, token: 500_000n };

/** A BZE send of 1 BZE with 260k gas (fee 2,600 ubze) from a well-funded account. */
function input(overrides: Partial<SendFeeInput> = {}): SendFeeInput {
  return {
    gas: 260_000n,
    gasPrice: PRICE,
    sendDenom: 'ubze',
    sendSymbol: 'BZE',
    amount: 1_000_000n,
    bzeBalance: 10_000_000n,
    tokenBalance: 10_000_000n,
    tokenFeeEligible: true,
    reserves: null,
    ...overrides,
  };
}

describe('parseDecimal / bzeFeeForGas', () => {
  it('reads the chain LegacyDec gas price exactly', () => {
    expect(parseDecimal('0.010000000000000000')).toEqual({ num: 10n ** 16n, den: 10n ** 18n });
    expect(parseDecimal('2')).toEqual({ num: 2n, den: 1n });
  });

  it('rejects anything that is not a plain non-negative decimal', () => {
    for (const bad of ['', 'abc', '-1', '1e3', '0.', '.5']) {
      expect(() => parseDecimal(bad)).toThrow('malformed decimal');
    }
  });

  it('is ceil(gas × price) in ubze', () => {
    expect(bzeFeeForGas(260_000n, PRICE)).toBe(2_600n);
    expect(bzeFeeForGas(260_001n, PRICE)).toBe(2_601n); // 2,600.01 rounds up
    expect(bzeFeeForGas(200_000n, PRICE)).toBe(2_000n); // the old fixed fee
  });
});

describe('tokenFeeForBzeFee (spot conversion)', () => {
  it('converts at native/token spot with a 10% margin, rounded up', () => {
    // 2,600 ubze = 1,300 VDL at spot; ×1.1 = 1,430.
    expect(tokenFeeForBzeFee(2_600n, RESERVES)).toBe(1_430n);
    // 1 ubze at 3 ubze per token = 0.333… ×1.1 = 0.366… → 1.
    expect(tokenFeeForBzeFee(1n, { native: 3n, token: 1n })).toBe(1n);
  });

  it('has no price when a pool side is empty', () => {
    expect(tokenFeeForBzeFee(2_600n, { native: 0n, token: 5n })).toBeNull();
    expect(tokenFeeForBzeFee(2_600n, { native: 5n, token: 0n })).toBeNull();
  });
});

describe('selectSendFee', () => {
  it('BZE path: a BZE send pays its fee in BZE when the balance covers amount + fee', () => {
    expect(selectSendFee(input({ bzeBalance: 1_002_600n }))).toEqual({
      status: 'ready',
      fee: { amount: '2600', denom: 'ubze', gas: '260000' },
    });
  });

  it('blocks a BZE send one ubze short of amount + fee', () => {
    expect(selectSendFee(input({ bzeBalance: 1_002_599n }))).toEqual({
      status: 'blocked',
      reason: 'Not enough BZE — the amount plus the network fee is more than your balance.',
      feeIneligible: false,
    });
  });

  it('BZE path: a token send still pays in BZE when there is BZE for the fee', () => {
    const selection = selectSendFee(
      input({ sendDenom: TOKEN, sendSymbol: 'VDL', bzeBalance: 2_600n, reserves: RESERVES }),
    );
    expect(selection).toEqual({
      status: 'ready',
      fee: { amount: '2600', denom: 'ubze', gas: '260000' },
    });
  });

  it('token path: no BZE, fee-eligible token pays its own fee at the spot price', () => {
    const selection = selectSendFee(
      input({
        sendDenom: TOKEN,
        sendSymbol: 'VDL',
        bzeBalance: 2_599n,
        tokenBalance: 1_001_430n,
        reserves: RESERVES,
      }),
    );
    expect(selection).toEqual({
      status: 'ready',
      fee: { amount: '1430', denom: TOKEN, gas: '260000' },
    });
  });

  it('token path: blocks when the token balance cannot cover amount + token fee', () => {
    const selection = selectSendFee(
      input({
        sendDenom: TOKEN,
        sendSymbol: 'VDL',
        bzeBalance: 0n,
        tokenBalance: 1_001_429n,
        reserves: RESERVES,
      }),
    );
    expect(selection).toEqual({
      status: 'blocked',
      reason: 'Not enough VDL — the amount plus the network fee is more than your balance.',
      feeIneligible: false,
    });
  });

  it('ineligible token and no BZE for the fee: blocked with the fee warning', () => {
    const selection = selectSendFee(
      input({
        sendDenom: TOKEN,
        sendSymbol: 'VDL',
        bzeBalance: 0n,
        tokenFeeEligible: false,
        reserves: RESERVES,
      }),
    );
    expect(selection).toEqual({
      status: 'blocked',
      reason: NO_FEE_COIN_REASON,
      feeIneligible: true,
    });
  });

  it('an eligible token with no readable pool can not pay either', () => {
    const selection = selectSendFee(
      input({ sendDenom: TOKEN, sendSymbol: 'VDL', bzeBalance: 0n, reserves: null }),
    );
    expect(selection).toMatchObject({ status: 'blocked', feeIneligible: true });
  });

  it('blocks a token send larger than the token balance before looking at fees', () => {
    const selection = selectSendFee(
      input({ sendDenom: TOKEN, sendSymbol: 'VDL', tokenBalance: 999_999n }),
    );
    expect(selection).toEqual({
      status: 'blocked',
      reason: 'Not enough VDL — the amount is more than your balance.',
      feeIneligible: false,
    });
  });
});
