/**
 * ChainClient endpoint fallback (BUS-24): unavailable endpoints (network
 * error, timeout, 5xx) fall through in order; 4xx answers surface immediately;
 * exhausting the list is a user-readable failure.
 */

import { describe, expect, it } from 'vitest';
import {
  ChainClient,
  ChainQueryError,
  ChainUnavailableError,
  DEFAULT_ENDPOINTS,
} from '../src/chain/client';

/** One scripted outcome per configured endpoint, consumed in call order. */
type Scripted = Response | Error;

/** A `fetch` double that records requested URLs and plays back `script`. */
function fakeFetch(script: Scripted[]): { fetchFn: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const next = script.shift();
    if (next === undefined) {
      throw new Error('fake fetch script exhausted');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as typeof fetch;
  return { fetchFn, urls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const ENDPOINTS = {
  rest: ['https://rest-a.example', 'https://rest-b.example', 'https://rest-c.example'],
  rpc: ['https://rpc-a.example', 'https://rpc-b.example'],
};

describe('ChainClient (BUS-24)', () => {
  it('returns the primary endpoint response when it is healthy', async () => {
    const { fetchFn, urls } = fakeFetch([json({ height: '42' })]);
    const client = new ChainClient({ endpoints: ENDPOINTS, fetchFn });

    await expect(client.getRest('/status')).resolves.toEqual({ height: '42' });
    expect(urls).toEqual(['https://rest-a.example/status']);
  });

  it('falls back to the next endpoint on a network error', async () => {
    const { fetchFn, urls } = fakeFetch([new TypeError('fetch failed'), json({ ok: true })]);
    const client = new ChainClient({ endpoints: ENDPOINTS, fetchFn });

    await expect(client.getRest('/q')).resolves.toEqual({ ok: true });
    expect(urls).toEqual(['https://rest-a.example/q', 'https://rest-b.example/q']);
  });

  it('falls back on a 5xx response', async () => {
    const { fetchFn, urls } = fakeFetch([
      json({ error: 'overloaded' }, 503),
      json({ error: 'down' }, 500),
      json({ ok: true }),
    ]);
    const client = new ChainClient({ endpoints: ENDPOINTS, fetchFn });

    await expect(client.getRest('/q')).resolves.toEqual({ ok: true });
    expect(urls).toHaveLength(3);
  });

  it('does NOT fall back on a 4xx response — throws a ChainQueryError with the details', async () => {
    const body = { code: 5, message: 'client metadata for denom ubze' };
    const { fetchFn, urls } = fakeFetch([json(body, 404)]);
    const client = new ChainClient({ endpoints: ENDPOINTS, fetchFn });

    const error = await client.getRest('/q').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChainQueryError);
    expect((error as ChainQueryError).status).toBe(404);
    expect((error as ChainQueryError).body).toEqual(body);
    expect(urls).toHaveLength(1); // never touched the fallbacks
  });

  it('throws a user-readable ChainUnavailableError when every endpoint fails', async () => {
    const { fetchFn, urls } = fakeFetch([
      new TypeError('fetch failed'),
      json(null, 502),
      new TypeError('fetch failed'),
    ]);
    const client = new ChainClient({ endpoints: ENDPOINTS, fetchFn });

    const error = await client.getRest('/q').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChainUnavailableError);
    expect((error as Error).message).toMatch(/BeeZee network is unreachable/);
    expect(urls).toHaveLength(3);
  });

  it('walks the RPC list for getRpc, independently of the REST list', async () => {
    const { fetchFn, urls } = fakeFetch([new TypeError('fetch failed'), json({ rpc: true })]);
    const client = new ChainClient({ endpoints: ENDPOINTS, fetchFn });

    await expect(client.getRpc('/status')).resolves.toEqual({ rpc: true });
    expect(urls).toEqual(['https://rpc-a.example/status', 'https://rpc-b.example/status']);
  });

  it('normalizes a trailing slash on the configured base URL', async () => {
    const { fetchFn, urls } = fakeFetch([json({})]);
    const client = new ChainClient({
      endpoints: { rest: ['https://rest-a.example/'], rpc: [] },
      fetchFn,
    });

    await client.getRest('/q');
    expect(urls).toEqual(['https://rest-a.example/q']);
  });

  it('rejects a path that does not start with a slash', async () => {
    const { fetchFn } = fakeFetch([]);
    const client = new ChainClient({ endpoints: ENDPOINTS, fetchFn });

    await expect(client.getRest('q')).rejects.toThrow(/must start with '\/'/);
  });

  it('ships BeeZee mainnet defaults: getbze.com primaries with -1/-2 fallbacks', () => {
    expect(DEFAULT_ENDPOINTS.rest[0]).toBe('https://rest.getbze.com');
    expect(DEFAULT_ENDPOINTS.rpc[0]).toBe('https://rpc.getbze.com');
    expect(DEFAULT_ENDPOINTS.rest.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_ENDPOINTS.rpc.length).toBeGreaterThanOrEqual(2);
  });
});
