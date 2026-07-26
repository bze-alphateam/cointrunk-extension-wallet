/**
 * The cached read layer the popup talks to for chain data (BUS-28).
 *
 * {@link CachedChainData} composes the individual chain reads — token identity
 * metadata (BUS-26), a token's BZE-side LP depth and the governance threshold
 * (BUS-27) — behind one facade, each wrapped in a {@link TtlCache}. It exposes
 * the same read methods as the underlying services, so callers get caching for
 * free without knowing it is there.
 *
 * Each data kind gets its own TTL because they change on very different
 * cadences:
 *  - **metadata** — a token's name/symbol/logo/decimals is near-immutable, so a
 *    long TTL; re-reading it every popup open would be pure waste.
 *  - **liquidity** — pool reserves move with every trade, so a short TTL keeps
 *    the branding / fee-token signal reasonably current.
 *  - **threshold** — a governance parameter that only changes via a passed
 *    proposal (a days-long process), so a long TTL.
 *
 * All three are still served stale rather than failing when the network is
 * down (see {@link TtlCache}), so the wallet degrades gracefully.
 *
 * Invalidation on token switch: {@link CachedChainData.invalidateToken} drops
 * the metadata and liquidity entries for a denom so the newly-active token is
 * read fresh. The threshold is global — the same value for every token — so a
 * token switch leaves it cached.
 */

import { ChainClient } from './client';
import { TradebinLiquidityService, type LiquidityService } from './liquidity';
import { TokenMetadataService, type TokenIdentity } from './metadata';
import { TtlCache } from './cache';

/** Reads a token's display identity — the subset of {@link TokenMetadataService} used here. */
export interface TokenIdentityReader {
  getTokenIdentity(denom: string): Promise<TokenIdentity>;
}

/** The concrete reads {@link CachedChainData} caches. Injectable for tests. */
export interface ChainDataReaders {
  readonly metadata: TokenIdentityReader;
  readonly liquidity: LiquidityService;
}

/** Per-data-kind cache lifetimes, all overridable. */
export interface CacheTtls {
  readonly metadataTtlMs: number;
  readonly liquidityTtlMs: number;
  readonly thresholdTtlMs: number;
}

/** Defaults chosen from each datum's real rate of change (see module docs). */
export const DEFAULT_CACHE_TTLS: CacheTtls = {
  metadataTtlMs: 24 * 60 * 60 * 1000, // 24h — identity is near-immutable
  liquidityTtlMs: 60 * 1000, //          60s — pool reserves move with trades
  thresholdTtlMs: 60 * 60 * 1000, //      1h — governance-set, rarely changes
};

/** The threshold is global, so its cache holds a single entry under one key. */
const THRESHOLD_KEY = 'threshold';

export interface CachedChainDataOptions {
  /** TTL overrides; any omitted kind uses {@link DEFAULT_CACHE_TTLS}. */
  readonly ttls?: Partial<CacheTtls>;
  /** Clock source, injected in tests; forwarded to every underlying cache. */
  readonly now?: () => number;
}

/**
 * Caches token metadata, LP liquidity, and the governance threshold behind one
 * read facade with per-kind TTLs and a stale-but-usable fallback.
 */
export class CachedChainData {
  private readonly metadataCache: TtlCache<TokenIdentity>;
  private readonly liquidityCache: TtlCache<bigint>;
  private readonly thresholdCache: TtlCache<bigint>;

  constructor(readers: ChainDataReaders, options: CachedChainDataOptions = {}) {
    const ttls = { ...DEFAULT_CACHE_TTLS, ...options.ttls };
    const { now } = options;

    this.metadataCache = new TtlCache((denom) => readers.metadata.getTokenIdentity(denom), {
      ttlMs: ttls.metadataTtlMs,
      now,
    });
    this.liquidityCache = new TtlCache((denom) => readers.liquidity.getNativeDepth(denom), {
      ttlMs: ttls.liquidityTtlMs,
      now,
    });
    this.thresholdCache = new TtlCache(() => readers.liquidity.getThreshold(), {
      ttlMs: ttls.thresholdTtlMs,
      now,
    });
  }

  /** Build a cache over the production chain services from a shared {@link ChainClient}. */
  static fromClient(client: ChainClient, options: CachedChainDataOptions = {}): CachedChainData {
    return new CachedChainData(
      {
        metadata: new TokenMetadataService(client),
        liquidity: new TradebinLiquidityService(client),
      },
      options,
    );
  }

  /** A token's display identity, cached for {@link CacheTtls.metadataTtlMs}. */
  getTokenIdentity(denom: string): Promise<TokenIdentity> {
    return this.metadataCache.get(denom);
  }

  /** A token's BZE-side LP depth, cached for {@link CacheTtls.liquidityTtlMs}. */
  getNativeDepth(denom: string): Promise<bigint> {
    return this.liquidityCache.get(denom);
  }

  /** The global governance threshold, cached for {@link CacheTtls.thresholdTtlMs}. */
  getThreshold(): Promise<bigint> {
    return this.thresholdCache.get(THRESHOLD_KEY);
  }

  /**
   * Drop a token's cached metadata and liquidity so it is re-read fresh — call
   * on token switch. The threshold is global and left cached.
   */
  invalidateToken(denom: string): void {
    this.metadataCache.invalidate(denom);
    this.liquidityCache.invalidate(denom);
  }

  /** Drop everything, threshold included (e.g. on a manual "refresh all"). */
  invalidateAll(): void {
    this.metadataCache.clear();
    this.liquidityCache.clear();
    this.thresholdCache.clear();
  }
}
