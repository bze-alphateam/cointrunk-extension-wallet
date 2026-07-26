/**
 * A small TTL cache for chain reads, with single-flight and a
 * stale-but-usable fallback (BUS-28).
 *
 * The popup reopens constantly, and every chain read is a network round trip;
 * caching within a TTL means a reopen inside the window is answered from memory
 * with no request at all (the ticket's "popup isn't querying on every open").
 *
 * Semantics, per key:
 *  - **Fresh** (age < TTL): the stored value is returned synchronously, no fetch.
 *  - **Stale or missing**: the loader runs to refresh the value. Concurrent
 *    callers share that one in-flight refresh (single-flight) rather than each
 *    firing their own request.
 *  - **Refresh fails but a stale value exists**: the stale value is served
 *    instead of throwing — a transient outage never blocks the UI, and the
 *    entry stays stale so the next read tries again. Only a failure with *no*
 *    previously-cached value propagates (there is nothing usable to show).
 *
 * This is deliberately serve-fresh-or-revalidate, not serve-stale-and-refresh-
 * in-background: within the TTL reads are instant, and past it the caller waits
 * for a fresh value unless the network is down. TTLs are chosen per data kind
 * by the caller (see {@link ../chain/chain-data.CachedChainData}).
 *
 * MV3 note: the background service worker is torn down when idle, so this
 * in-memory cache does not survive a worker respawn — it is a within-session
 * cache, exactly the popup-reopen case it targets. Longer-lived persistence
 * (chrome.storage) is a separate concern and out of scope here.
 */

/** A stored value plus the clock reading at which it was fetched. */
interface CacheEntry<V> {
  readonly value: V;
  readonly storedAt: number;
}

export interface TtlCacheOptions {
  /** How long a fetched value stays fresh, in milliseconds. */
  readonly ttlMs: number;
  /** Clock source; injected in tests. Defaults to {@link Date.now}. */
  readonly now?: () => number;
}

/**
 * Caches the results of an async `loader` keyed by string, expiring entries
 * after `ttlMs` and falling back to a stale value when a refresh fails.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();
  private readonly inFlight = new Map<string, Promise<V>>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly loader: (key: string) => Promise<V>,
    options: TtlCacheOptions,
  ) {
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  /**
   * The value for `key`: the cached one while fresh, otherwise a refreshed one
   * — falling back to the stale value if the refresh fails and one exists.
   */
  async get(key: string): Promise<V> {
    const cached = this.entries.get(key);
    if (cached !== undefined && this.now() - cached.storedAt < this.ttlMs) {
      return cached.value;
    }
    return this.refresh(key, cached);
  }

  /** Drop the cached entry for `key` (e.g. on token switch); a no-op if absent. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }

  /** Drop every cached entry. In-flight refreshes still settle but store nothing stale-blocking. */
  clear(): void {
    this.entries.clear();
  }

  private refresh(key: string, stale: CacheEntry<V> | undefined): Promise<V> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const request = this.loader(key)
      .then((value) => {
        this.entries.set(key, { value, storedAt: this.now() });
        return value;
      })
      .catch((error: unknown) => {
        // Stale-but-usable: a failed refresh serves the last good value rather
        // than blocking the UI. With nothing cached there is nothing to show,
        // so the error propagates. The stale entry is left in place so a later
        // read retries the refresh.
        if (stale !== undefined) {
          return stale.value;
        }
        throw error;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }
}
