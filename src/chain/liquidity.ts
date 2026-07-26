/**
 * A token's BZE-side liquidity depth and the global governance threshold it is
 * weighed against (BUS-27).
 *
 * BeeZee's liquidity lives in the **tradebin** module, which is a hybrid of an
 * order book and constant-product AMM pools. The signal BusyWallet cares about
 * is the **AMM pool** only — order-book market depth is explicitly not used
 * (see Confluence "4. Token Eligibility & Branding Criteria"). Each pool pairs
 * two denoms and stores their reserves; for a token/BZE pool the "BZE-side
 * depth" is the reserve on whichever side is the native `ubze`.
 *
 * Pool addressing mirrors the chain exactly (`x/tradebin/keeper/service_amm.go`
 * → `CreatePoolId`): the two denoms are sorted lexicographically and joined
 * with `_`, so the token/BZE pool id is `min(denom,ubze)_max(denom,ubze)`.
 * Cosmos denoms are ASCII, so a JS string comparison matches Go's byte-wise
 * ordering. The LP token denom on the pool is irrelevant to this read.
 *
 * Query paths, confirmed against the live node (rest.getbze.com, 2026-07-26):
 *
 *     GET /bze/tradebin/liquidity_pool?pool_id=<url-encoded pool id>
 *       200 { "pool": { base, quote, reserve_base, reserve_quote, … } } — e.g.
 *       `factory/bze13gzq…/uvdl_ubze` → base the factory denom, quote `ubze`,
 *       reserve_quote the BZE-side depth (`"1621873097554"`).
 *       404 { "code": 5, "message": "not found" } — no pool for this pair.
 *
 *     GET /bze/tradebin/params
 *       200 { "params": { "minNativeLiquidityForModuleSwap": "100000000000", … } }
 *       — the single global threshold, an integer of `ubze` base units. It is a
 *       governance-set parameter (a param-change proposal moves it), which is
 *       why the wallet reads it from chain rather than pinning a constant.
 *
 * A token with no pool is not an error: {@link TradebinLiquidityService.getNativeDepth}
 * returns `0n`, which is below any positive threshold — the ticket's "tokens
 * with no LP are treated as below threshold". This module only *reads* the two
 * numbers; how they combine (the branding gate uses strictly greater-than, the
 * fee-token warning shares the same signal) is the consuming ticket's call, so
 * no comparison operator is baked in here.
 */

import { ChainClient, ChainQueryError } from './client';
import { BZE_BASE_DENOM } from './constants';

/** tradebin REST routes. See module docs for the confirmed response shapes. */
const LIQUIDITY_POOL_PATH = '/bze/tradebin/liquidity_pool?pool_id=';
const PARAMS_PATH = '/bze/tradebin/params';

/**
 * The tradebin pool id for a token paired with the native `ubze`, derived the
 * same way the chain does (`CreatePoolId`): sort the two denoms and join with
 * `_`. Exported for tests and for callers that want the id without a query.
 */
export function nativePoolId(denom: string, nativeDenom: string = BZE_BASE_DENOM): string {
  return denom < nativeDenom ? `${denom}_${nativeDenom}` : `${nativeDenom}_${denom}`;
}

/** Reads a token's BZE-side pool depth and the global liquidity threshold. */
export interface LiquidityService {
  /**
   * BZE-side reserve of the token/BZE AMM pool, in `ubze` base units. `0n`
   * when the token has no pool with BZE (treated as below any threshold).
   */
  getNativeDepth(denom: string): Promise<bigint>;
  /** The global governance threshold (`minNativeLiquidityForModuleSwap`), in `ubze`. */
  getThreshold(): Promise<bigint>;
}

/**
 * Queries the tradebin module over the REST API. Network/endpoint failures
 * propagate from {@link ChainClient} with user-readable messages; a missing
 * pool (404) degrades to `0n`, and a malformed response body throws rather
 * than silently reading a wrong depth.
 */
export class TradebinLiquidityService implements LiquidityService {
  constructor(
    private readonly client: ChainClient,
    private readonly nativeDenom: string = BZE_BASE_DENOM,
  ) {}

  async getNativeDepth(denom: string): Promise<bigint> {
    // The native token has no BZE-paired pool of its own; asking is meaningless
    // (the chain's own HasLiquidityWithNativeDenom returns false for this), so
    // skip the guaranteed-404 round trip.
    if (denom === this.nativeDenom) {
      return 0n;
    }

    const poolId = nativePoolId(denom, this.nativeDenom);
    let body: unknown;
    try {
      body = await this.client.getRest(LIQUIDITY_POOL_PATH + encodeURIComponent(poolId));
    } catch (error) {
      if (error instanceof ChainQueryError && error.status === 404) {
        return 0n; // no pool for this pair — below threshold, not an error
      }
      throw error; // endpoint/network trouble is real trouble — surface it
    }

    return nativeSideReserve(parsePoolResponse(body), this.nativeDenom);
  }

  async getThreshold(): Promise<bigint> {
    return parseThresholdResponse(await this.client.getRest(PARAMS_PATH));
  }
}

/** The pool fields this service consumes, already validated. */
interface PoolReserves {
  readonly base: string;
  readonly quote: string;
  readonly reserveBase: bigint;
  readonly reserveQuote: bigint;
}

/** Pick the reserve on the native side of the pool, or `0n` if neither side is native. */
function nativeSideReserve(pool: PoolReserves, nativeDenom: string): bigint {
  if (pool.base === nativeDenom) {
    return pool.reserveBase;
  }
  if (pool.quote === nativeDenom) {
    return pool.reserveQuote;
  }
  // The pool id is built from (denom, native), so one side is always native;
  // a pool that somehow pairs neither has no BZE-side depth by definition.
  return 0n;
}

/** Parse a `QueryLiquidityPoolResponse`, down to the reserve fields consumed above. */
function parsePoolResponse(body: unknown): PoolReserves {
  const { pool } = (body ?? {}) as { pool?: unknown };
  if (typeof pool !== 'object' || pool === null) {
    throw new Error(`malformed liquidity pool response: ${JSON.stringify(body)}`);
  }

  const raw = pool as Record<string, unknown>;
  const base = raw['base'];
  const quote = raw['quote'];
  if (typeof base !== 'string' || typeof quote !== 'string') {
    throw new Error(`malformed liquidity pool denoms: ${JSON.stringify(pool)}`);
  }

  return {
    base,
    quote,
    reserveBase: parseIntAmount(raw['reserve_base'], 'reserve_base'),
    reserveQuote: parseIntAmount(raw['reserve_quote'], 'reserve_quote'),
  };
}

/** Parse the tradebin `Params`, down to the one threshold field consumed above. */
function parseThresholdResponse(body: unknown): bigint {
  const { params } = (body ?? {}) as { params?: unknown };
  if (typeof params !== 'object' || params === null) {
    throw new Error(`malformed tradebin params response: ${JSON.stringify(body)}`);
  }

  const threshold = (params as Record<string, unknown>)['minNativeLiquidityForModuleSwap'];
  return parseIntAmount(threshold, 'minNativeLiquidityForModuleSwap');
}

/**
 * A chain integer (`cosmossdk.io/math.Int`) arrives as a JSON string of digits.
 * Anything that is not a non-negative integer string throws — reserves and the
 * threshold are unsigned on-chain, and a garbled value must not become a wrong
 * number the branding/fee-token gate then trusts.
 */
function parseIntAmount(value: unknown, field: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`malformed tradebin "${field}": ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}
