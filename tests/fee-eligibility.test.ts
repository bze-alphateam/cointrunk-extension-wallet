/**
 * Fee-token eligibility gate (BUS-38). The pure predicate mirrors the chain's
 * `HasDeepLiquidityWithNativeDenom` (`depth >= threshold`), with the native
 * token always eligible; the service reads those two numbers from the (cached)
 * data layer and never queries the guaranteed-empty native pool.
 */

import { describe, expect, it, vi } from 'vitest';
import { BZE_BASE_DENOM } from '../src/chain/constants';
import {
  FEE_INELIGIBLE_REASON,
  isFeeTokenEligible,
  LiquidityFeeEligibilityService,
} from '../src/chain/fees';
import type { LiquidityService } from '../src/chain/liquidity';

const THRESHOLD = 100_000_000_000n; // the chain's default MinNativeLiquidityForModuleSwap
const OTHER = 'factory/bze1abc/xyz';

/** A `LiquidityService` double with fixed depth + threshold, counting its reads. */
function fakeLiquidity(depth: bigint, threshold: bigint = THRESHOLD): LiquidityService {
  return {
    getNativeDepth: vi.fn(async () => depth),
    getThreshold: vi.fn(async () => threshold),
  };
}

describe('isFeeTokenEligible (BUS-38)', () => {
  it('treats the native token as always eligible, regardless of depth', () => {
    expect(isFeeTokenEligible(BZE_BASE_DENOM, 0n, THRESHOLD)).toBe(true);
  });

  it('treats "no active token" (null) as eligible — nothing to warn about', () => {
    expect(isFeeTokenEligible(null, 0n, THRESHOLD)).toBe(true);
  });

  it('is eligible when a non-native token has depth at or above the threshold', () => {
    expect(isFeeTokenEligible(OTHER, THRESHOLD, THRESHOLD)).toBe(true); // exactly equal: eligible
    expect(isFeeTokenEligible(OTHER, THRESHOLD + 1n, THRESHOLD)).toBe(true);
  });

  it('is ineligible when a non-native token is below the threshold (incl. no pool = 0n)', () => {
    expect(isFeeTokenEligible(OTHER, THRESHOLD - 1n, THRESHOLD)).toBe(false);
    expect(isFeeTokenEligible(OTHER, 0n, THRESHOLD)).toBe(false);
  });
});

describe('LiquidityFeeEligibilityService (BUS-38)', () => {
  it('short-circuits the native token to eligible without any chain read', async () => {
    const liquidity = fakeLiquidity(0n);
    const service = new LiquidityFeeEligibilityService(liquidity);

    expect(await service.check(BZE_BASE_DENOM)).toEqual({ eligible: true });
    expect(liquidity.getNativeDepth).not.toHaveBeenCalled();
    expect(liquidity.getThreshold).not.toHaveBeenCalled();
  });

  it('short-circuits null (no active token) to eligible without any chain read', async () => {
    const liquidity = fakeLiquidity(0n);
    const service = new LiquidityFeeEligibilityService(liquidity);

    expect(await service.check(null)).toEqual({ eligible: true });
    expect(liquidity.getNativeDepth).not.toHaveBeenCalled();
  });

  it('reports a deep-enough non-native token as eligible', async () => {
    const service = new LiquidityFeeEligibilityService(fakeLiquidity(THRESHOLD));
    expect(await service.check(OTHER)).toEqual({ eligible: true });
  });

  it('reports a low-liquidity token as ineligible with the calm reason', async () => {
    const service = new LiquidityFeeEligibilityService(fakeLiquidity(THRESHOLD - 1n));
    expect(await service.check(OTHER)).toEqual({
      eligible: false,
      reason: FEE_INELIGIBLE_REASON,
    });
  });

  it('honours a custom native denom (test-chain wiring)', async () => {
    const liquidity = fakeLiquidity(0n);
    const service = new LiquidityFeeEligibilityService(liquidity, 'utest');

    expect(await service.check('utest')).toEqual({ eligible: true });
    expect(liquidity.getNativeDepth).not.toHaveBeenCalled();
  });
});
