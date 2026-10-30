/**
 * CachedChainData (BUS-28): the read facade that caches token metadata, LP
 * liquidity, the governance threshold and token branding (BUS-32) with
 * per-kind TTLs, and invalidates per token on switch.
 */

import { describe, expect, it, vi } from 'vitest';
import type { DenomBranding } from '../src/chain/branding';
import { CachedChainData, DEFAULT_CACHE_TTLS } from '../src/chain/chain-data';
import { ChainUnavailableError } from '../src/chain/client';
import type { TokenIdentity } from '../src/chain/metadata';

function fakeClock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

function identity(denom: string): TokenIdentity {
  return { denom, name: denom, symbol: denom, decimals: 6, logoUri: null };
}

const BRANDING: DenomBranding = {
  font: 'inter',
  light: { background: '#ffffff', text: '#111111', primary: '#ff6600', secondary: '#0066ff' },
  dark: { background: '#000000', text: '#eeeeee', primary: '#ff8833', secondary: '#3388ff' },
};

/** Spy readers so we can count how often each underlying chain read runs. */
function readers() {
  const getTokenIdentity = vi.fn(async (denom: string) => identity(denom));
  const getNativeDepth = vi.fn(async (denom: string): Promise<bigint> => (denom ? 100n : 0n));
  const getThreshold = vi.fn(async () => 42n);
  const getBranding = vi.fn(async (): Promise<DenomBranding | null> => BRANDING);
  return {
    spies: { getTokenIdentity, getNativeDepth, getThreshold, getBranding },
    readers: {
      metadata: { getTokenIdentity },
      liquidity: { getNativeDepth, getThreshold },
      branding: { getBranding },
    },
  };
}

describe('CachedChainData (BUS-28)', () => {
  it('caches metadata, liquidity, and threshold within their TTLs', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    await data.getTokenIdentity('uvdl');
    await data.getNativeDepth('uvdl');
    await data.getThreshold();
    // Second round, all still fresh — no extra underlying reads.
    await data.getTokenIdentity('uvdl');
    await data.getNativeDepth('uvdl');
    await data.getThreshold();

    expect(spies.getTokenIdentity).toHaveBeenCalledTimes(1);
    expect(spies.getNativeDepth).toHaveBeenCalledTimes(1);
    expect(spies.getThreshold).toHaveBeenCalledTimes(1);
  });

  it('applies a different TTL to each data kind', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    await data.getTokenIdentity('uvdl');
    await data.getNativeDepth('uvdl');
    await data.getThreshold();

    // Past the liquidity TTL but well within metadata/threshold TTLs.
    clock.advance(DEFAULT_CACHE_TTLS.liquidityTtlMs);
    await data.getTokenIdentity('uvdl');
    await data.getNativeDepth('uvdl');
    await data.getThreshold();

    expect(spies.getNativeDepth).toHaveBeenCalledTimes(2); // liquidity expired
    expect(spies.getTokenIdentity).toHaveBeenCalledTimes(1); // metadata still fresh
    expect(spies.getThreshold).toHaveBeenCalledTimes(1); // threshold still fresh
  });

  it('honours TTL overrides', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now, ttls: { liquidityTtlMs: 10 } });

    await data.getNativeDepth('uvdl');
    clock.advance(10);
    await data.getNativeDepth('uvdl');
    expect(spies.getNativeDepth).toHaveBeenCalledTimes(2);
  });

  it('invalidateToken re-reads that token but keeps the global threshold cached', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    await data.getTokenIdentity('uvdl');
    await data.getNativeDepth('uvdl');
    await data.getThreshold();

    data.invalidateToken('uvdl'); // token switch

    await data.getTokenIdentity('uvdl');
    await data.getNativeDepth('uvdl');
    await data.getThreshold();

    expect(spies.getTokenIdentity).toHaveBeenCalledTimes(2); // re-read
    expect(spies.getNativeDepth).toHaveBeenCalledTimes(2); // re-read
    expect(spies.getThreshold).toHaveBeenCalledTimes(1); // untouched — global
  });

  it('invalidateToken only affects the named token', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    await data.getNativeDepth('uvdl');
    await data.getNativeDepth('uatom');

    data.invalidateToken('uvdl');

    await data.getNativeDepth('uvdl'); // re-read
    await data.getNativeDepth('uatom'); // still cached

    expect(spies.getNativeDepth).toHaveBeenCalledTimes(3);
  });

  it('invalidateAll drops the threshold too', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    await data.getThreshold();
    data.invalidateAll();
    await data.getThreshold();

    expect(spies.getThreshold).toHaveBeenCalledTimes(2);
  });

  it('serves stale data for every kind when a refresh fails', async () => {
    const clock = fakeClock();
    const getTokenIdentity = vi
      .fn<(denom: string) => Promise<TokenIdentity>>()
      .mockResolvedValueOnce(identity('uvdl'))
      .mockRejectedValue(new Error('down'));
    const getNativeDepth = vi
      .fn<(denom: string) => Promise<bigint>>()
      .mockResolvedValueOnce(100n)
      .mockRejectedValue(new Error('down'));
    const getThreshold = vi
      .fn<() => Promise<bigint>>()
      .mockResolvedValueOnce(42n)
      .mockRejectedValue(new Error('down'));
    const data = new CachedChainData(
      {
        metadata: { getTokenIdentity },
        liquidity: { getNativeDepth, getThreshold },
        branding: { getBranding: async () => null },
      },
      { now: clock.now },
    );

    await data.getTokenIdentity('uvdl');
    await data.getNativeDepth('uvdl');
    await data.getThreshold();

    clock.advance(DEFAULT_CACHE_TTLS.metadataTtlMs + 1); // expire the longest TTL

    expect(await data.getTokenIdentity('uvdl')).toEqual(identity('uvdl'));
    expect(await data.getNativeDepth('uvdl')).toBe(100n);
    expect(await data.getThreshold()).toBe(42n);
  });

  it('caches branding within its TTL and re-reads it after', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    expect(await data.getBranding('uvdl')).toEqual(BRANDING);
    await data.getBranding('uvdl');
    expect(spies.getBranding).toHaveBeenCalledTimes(1);

    clock.advance(DEFAULT_CACHE_TTLS.brandingTtlMs);
    await data.getBranding('uvdl');
    expect(spies.getBranding).toHaveBeenCalledTimes(2);
  });

  it('caches "no branding" too, so an unbranded token is not re-queried on every open', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    spies.getBranding.mockResolvedValue(null);
    const data = new CachedChainData(r, { now: clock.now });

    expect(await data.getBranding('uvdl')).toBeNull();
    expect(await data.getBranding('uvdl')).toBeNull();
    expect(spies.getBranding).toHaveBeenCalledTimes(1);
  });

  it('invalidateToken re-reads the token branding (token switch)', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    await data.getBranding('uvdl');
    data.invalidateToken('uvdl');
    await data.getBranding('uvdl');

    expect(spies.getBranding).toHaveBeenCalledTimes(2);
  });

  it('reads an unreachable chain with nothing cached as no branding', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    spies.getBranding.mockRejectedValue(new ChainUnavailableError('rest'));
    const data = new CachedChainData(r, { now: clock.now });

    await expect(data.getBranding('uvdl')).resolves.toBeNull();
  });

  it('serves stale branding when a refresh fails, and does not cache the outage', async () => {
    const clock = fakeClock();
    const { spies, readers: r } = readers();
    const data = new CachedChainData(r, { now: clock.now });

    await data.getBranding('uvdl');
    clock.advance(DEFAULT_CACHE_TTLS.brandingTtlMs);
    spies.getBranding.mockRejectedValueOnce(new ChainUnavailableError('rest'));

    expect(await data.getBranding('uvdl')).toEqual(BRANDING); // stale, not null
    expect(await data.getBranding('uvdl')).toEqual(BRANDING); // retried and refreshed
    expect(spies.getBranding).toHaveBeenCalledTimes(3);
  });
});
