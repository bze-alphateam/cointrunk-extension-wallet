/**
 * TradebinLiquidityService (BUS-27): the BZE-side depth of a token/BZE AMM
 * pool and the global governance threshold, read from the tradebin module.
 * Pool ids mirror the chain's CreatePoolId (sorted denoms joined with `_`); a
 * token with no pool degrades to 0n (below any threshold).
 */

import { describe, expect, it } from 'vitest';
import { ChainClient } from '../src/chain/client';
import { TradebinLiquidityService, nativePoolId } from '../src/chain/liquidity';

const VDL_DENOM = 'factory/bze13gzq40che93tgfm9kzmkpjamah5nj0j73pyhqk/uvdl';

/** As the live node answers for the VDL/BZE pool (captured 2026-07-26). */
const VDL_POOL = {
  pool: {
    id: `${VDL_DENOM}_ubze`,
    base: VDL_DENOM,
    quote: 'ubze',
    lp_denom: `ulp_${VDL_DENOM}_ubze`,
    creator: 'bze1dte8cgjyxnsg4zmrlhfv4h4hnxv5vy8khzfx4f',
    fee: '0.002000000000000000',
    reserve_base: '2089767774136',
    reserve_quote: '1621873097554',
    stable: false,
  },
};

/** tradebin params as the live node answers (captured 2026-07-26). */
const PARAMS = {
  params: {
    native_denom: 'ubze',
    minNativeLiquidityForModuleSwap: '100000000000',
    orderBookPerBlockMessages: '500',
  },
};

/** gRPC-gateway NotFound, as returned for a pair with no pool. */
const NOT_FOUND = { code: 5, message: 'not found', details: [] };

function serviceFor(
  body: unknown,
  status = 200,
): { service: TradebinLiquidityService; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const client = new ChainClient({ endpoints: { rest: ['https://n.example'], rpc: [] }, fetchFn });
  return { service: new TradebinLiquidityService(client), urls };
}

describe('nativePoolId (BUS-27)', () => {
  it('sorts the denom and native denom lexicographically, joined with "_"', () => {
    // 'f' < 'u': factory denom sorts before ubze.
    expect(nativePoolId(VDL_DENOM)).toBe(`${VDL_DENOM}_ubze`);
    // 'i' < 'u': an ibc/ denom sorts before ubze.
    expect(nativePoolId('ibc/ABC')).toBe('ibc/ABC_ubze');
    // A denom that sorts after ubze lands on the other side of the join.
    expect(nativePoolId('uvdl')).toBe('ubze_uvdl');
  });
});

describe('TradebinLiquidityService.getNativeDepth (BUS-27)', () => {
  it('queries the liquidity_pool route with the pool id URL-encoded', async () => {
    const { service, urls } = serviceFor(VDL_POOL);

    await service.getNativeDepth(VDL_DENOM);
    expect(urls).toEqual([
      'https://n.example/bze/tradebin/liquidity_pool?pool_id=' +
        encodeURIComponent(`${VDL_DENOM}_ubze`),
    ]);
  });

  it('returns the quote reserve when ubze is the pool quote side', async () => {
    const { service } = serviceFor(VDL_POOL);
    await expect(service.getNativeDepth(VDL_DENOM)).resolves.toBe(1621873097554n);
  });

  it('returns the base reserve when ubze is the pool base side', async () => {
    const { service } = serviceFor({
      pool: { ...VDL_POOL.pool, base: 'ubze', quote: VDL_DENOM },
    });
    // base is now ubze, so the BZE side is reserve_base.
    await expect(service.getNativeDepth(VDL_DENOM)).resolves.toBe(2089767774136n);
  });

  it('treats a token with no pool (404) as zero depth, not an error', async () => {
    const { service } = serviceFor(NOT_FOUND, 404);
    await expect(service.getNativeDepth('factory/bze1nobody/umeme')).resolves.toBe(0n);
  });

  it('returns 0n for the native denom without hitting the network', async () => {
    const { service, urls } = serviceFor(NOT_FOUND, 404);
    await expect(service.getNativeDepth('ubze')).resolves.toBe(0n);
    expect(urls).toEqual([]);
  });

  it('returns 0n when neither pool side is the native denom', async () => {
    const { service } = serviceFor({
      pool: { ...VDL_POOL.pool, base: VDL_DENOM, quote: 'uusdc' },
    });
    await expect(service.getNativeDepth(VDL_DENOM)).resolves.toBe(0n);
  });

  it('propagates network unavailability instead of faking zero depth', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const client = new ChainClient({
      endpoints: { rest: ['https://n.example'], rpc: [] },
      fetchFn,
    });

    await expect(new TradebinLiquidityService(client).getNativeDepth(VDL_DENOM)).rejects.toThrow(
      /unreachable/,
    );
  });

  it('rejects a malformed reserve rather than reading a wrong depth', async () => {
    const { service } = serviceFor({ pool: { ...VDL_POOL.pool, reserve_quote: '12.5' } });
    await expect(service.getNativeDepth(VDL_DENOM)).rejects.toThrow(
      /malformed tradebin "reserve_quote"/,
    );
  });

  it('rejects a pool response missing its denoms', async () => {
    const { service } = serviceFor({ pool: { reserve_base: '1', reserve_quote: '2' } });
    await expect(service.getNativeDepth(VDL_DENOM)).rejects.toThrow(
      /malformed liquidity pool denoms/,
    );
  });
});

describe('TradebinLiquidityService.getThreshold (BUS-27)', () => {
  it('reads minNativeLiquidityForModuleSwap from the tradebin params', async () => {
    const { service, urls } = serviceFor(PARAMS);
    await expect(service.getThreshold()).resolves.toBe(100000000000n);
    expect(urls).toEqual(['https://n.example/bze/tradebin/params']);
  });

  it('rejects a malformed threshold rather than trusting a wrong number', async () => {
    const { service } = serviceFor({ params: { minNativeLiquidityForModuleSwap: null } });
    await expect(service.getThreshold()).rejects.toThrow(
      /malformed tradebin "minNativeLiquidityForModuleSwap"/,
    );
  });

  it('propagates network unavailability from the params query', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const client = new ChainClient({
      endpoints: { rest: ['https://n.example'], rpc: [] },
      fetchFn,
    });

    await expect(new TradebinLiquidityService(client).getThreshold()).rejects.toThrow(
      /unreachable/,
    );
  });
});
