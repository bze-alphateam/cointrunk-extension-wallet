/**
 * TtlCache (BUS-28): TTL freshness, single-flight refresh, and the
 * stale-but-usable fallback when a refresh fails.
 */

import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/chain/cache';

/** A manually-advanced clock so TTL expiry is deterministic. */
function fakeClock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('TtlCache (BUS-28)', () => {
  it('fetches once and serves the cached value while fresh', async () => {
    const clock = fakeClock();
    const loader = vi.fn(async (key: string) => `v:${key}`);
    const cache = new TtlCache(loader, { ttlMs: 1000, now: clock.now });

    expect(await cache.get('a')).toBe('v:a');
    clock.advance(999);
    expect(await cache.get('a')).toBe('v:a');
    expect(loader).toHaveBeenCalledTimes(1); // still fresh — no second fetch
  });

  it('refetches once the entry is older than the TTL', async () => {
    const clock = fakeClock();
    let n = 0;
    const loader = vi.fn(async () => `v${++n}`);
    const cache = new TtlCache(loader, { ttlMs: 1000, now: clock.now });

    expect(await cache.get('a')).toBe('v1');
    clock.advance(1000); // exactly TTL → no longer fresh (strict <)
    expect(await cache.get('a')).toBe('v2');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('caches per key independently', async () => {
    const clock = fakeClock();
    const loader = vi.fn(async (key: string) => key.toUpperCase());
    const cache = new TtlCache(loader, { ttlMs: 1000, now: clock.now });

    expect(await cache.get('a')).toBe('A');
    expect(await cache.get('b')).toBe('B');
    expect(await cache.get('a')).toBe('A');
    expect(loader).toHaveBeenCalledTimes(2); // one per distinct key
  });

  it('single-flights concurrent refreshes of the same key', async () => {
    const clock = fakeClock();
    const loader = vi.fn(
      (key: string) => new Promise<string>((resolve) => setTimeout(() => resolve(`v:${key}`), 5)),
    );
    const cache = new TtlCache(loader, { ttlMs: 1000, now: clock.now });

    const [a, b, c] = await Promise.all([cache.get('a'), cache.get('a'), cache.get('a')]);
    expect([a, b, c]).toEqual(['v:a', 'v:a', 'v:a']);
    expect(loader).toHaveBeenCalledTimes(1); // three callers, one fetch
  });

  it('serves the stale value when a refresh fails', async () => {
    const clock = fakeClock();
    let call = 0;
    const loader = vi.fn(async () => {
      call += 1;
      if (call === 1) return 'good';
      throw new Error('network down');
    });
    const cache = new TtlCache(loader, { ttlMs: 1000, now: clock.now });

    expect(await cache.get('a')).toBe('good');
    clock.advance(2000); // now stale
    expect(await cache.get('a')).toBe('good'); // refresh threw → stale served
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying after serving stale, and adopts a later successful refresh', async () => {
    const clock = fakeClock();
    let call = 0;
    const loader = vi.fn(async () => {
      call += 1;
      if (call === 1) return 'good';
      if (call === 2) throw new Error('down');
      return 'fresh';
    });
    const cache = new TtlCache(loader, { ttlMs: 1000, now: clock.now });

    expect(await cache.get('a')).toBe('good');
    clock.advance(2000);
    expect(await cache.get('a')).toBe('good'); // stale (2nd load threw)
    clock.advance(2000);
    expect(await cache.get('a')).toBe('fresh'); // 3rd load succeeded
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('propagates the error when the very first fetch fails (nothing to fall back to)', async () => {
    const clock = fakeClock();
    const loader = vi.fn(async () => {
      throw new Error('cold failure');
    });
    const cache = new TtlCache(loader, { ttlMs: 1000, now: clock.now });

    await expect(cache.get('a')).rejects.toThrow(/cold failure/);
  });

  it('invalidate forces the next read to refetch', async () => {
    const clock = fakeClock();
    let n = 0;
    const loader = vi.fn(async () => `v${++n}`);
    const cache = new TtlCache(loader, { ttlMs: 100_000, now: clock.now });

    expect(await cache.get('a')).toBe('v1');
    cache.invalidate('a');
    expect(await cache.get('a')).toBe('v2'); // refetched despite being within TTL
  });

  it('clear drops every entry', async () => {
    const clock = fakeClock();
    let n = 0;
    const loader = vi.fn(async () => `v${++n}`);
    const cache = new TtlCache(loader, { ttlMs: 100_000, now: clock.now });

    await cache.get('a');
    await cache.get('b');
    cache.clear();
    expect(await cache.get('a')).toBe('v3');
    expect(await cache.get('b')).toBe('v4');
  });
});
