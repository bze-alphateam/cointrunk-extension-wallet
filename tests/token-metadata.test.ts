/**
 * TokenMetadataService (BUS-26): identity resolved from bank denom metadata
 * via the query-string route (the only one that accepts factory/… denoms),
 * with sensible per-field defaults when the chain has nothing.
 */

import { describe, expect, it } from 'vitest';
import { ChainClient } from '../src/chain/client';
import { BZE_DISPLAY_DECIMALS } from '../src/chain/constants';
import { TokenMetadataService } from '../src/chain/metadata';

const VDL_DENOM = 'factory/bze13gzq40che93tgfm9kzmkpjamah5nj0j73pyhqk/uvdl';

/** As the live node answers for the Vidulum factory token (captured 2026-07-26). */
const VDL_METADATA = {
  metadata: {
    description: 'Vidulum App Token',
    denom_units: [
      { denom: VDL_DENOM, exponent: 0, aliases: [] },
      { denom: 'VDL', exponent: 6, aliases: [] },
    ],
    base: VDL_DENOM,
    display: 'VDL',
    name: 'Vidulum',
    symbol: 'VDL',
    uri: '',
    uri_hash: '',
  },
};

/** gRPC-gateway NotFound, as returned for denoms without metadata (e.g. ubze). */
const NOT_FOUND = { code: 5, message: 'client metadata for denom ubze', details: [] };

function serviceFor(
  body: unknown,
  status = 200,
): { service: TokenMetadataService; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const client = new ChainClient({ endpoints: { rest: ['https://n.example'], rpc: [] }, fetchFn });
  return { service: new TokenMetadataService(client), urls };
}

describe('TokenMetadataService (BUS-26)', () => {
  it('queries the denoms_metadata_by_query_string route with the denom URL-encoded', async () => {
    const { service, urls } = serviceFor(VDL_METADATA);

    await service.getTokenIdentity(VDL_DENOM);
    expect(urls).toEqual([
      'https://n.example/cosmos/bank/v1beta1/denoms_metadata_by_query_string?denom=' +
        encodeURIComponent(VDL_DENOM),
    ]);
  });

  it('maps full metadata to name, symbol, decimals and logo', async () => {
    const { service } = serviceFor({
      metadata: {
        ...VDL_METADATA.metadata,
        uri: 'https://cdn.example/vdl.png',
      },
    });

    await expect(service.getTokenIdentity(VDL_DENOM)).resolves.toEqual({
      denom: VDL_DENOM,
      name: 'Vidulum',
      symbol: 'VDL',
      decimals: 6,
      logoUri: 'https://cdn.example/vdl.png',
    });
  });

  it('turns an empty uri into a null logo (creators often set none)', async () => {
    const { service } = serviceFor(VDL_METADATA);

    const identity = await service.getTokenIdentity(VDL_DENOM);
    expect(identity.logoUri).toBeNull();
  });

  it('defaults name/symbol to the denom last segment when metadata leaves them empty', async () => {
    const { service } = serviceFor({
      metadata: {
        denom_units: [{ denom: VDL_DENOM, exponent: 0 }],
        base: VDL_DENOM,
        display: '',
        name: '',
        symbol: '',
        uri: '',
      },
    });

    const identity = await service.getTokenIdentity(VDL_DENOM);
    expect(identity.name).toBe('uvdl');
    expect(identity.symbol).toBe('uvdl');
    expect(identity.decimals).toBe(0);
  });

  it('defaults decimals to 0 when the display name matches no denom unit', async () => {
    const { service } = serviceFor({
      metadata: {
        ...VDL_METADATA.metadata,
        display: 'GONE',
      },
    });

    const identity = await service.getTokenIdentity(VDL_DENOM);
    expect(identity.decimals).toBe(0);
    expect(identity.name).toBe('Vidulum'); // other fields unaffected
  });

  it('resolves a denom without on-chain metadata (404) to full defaults', async () => {
    const denom = 'factory/bze1someone/umeme';
    const { service } = serviceFor(NOT_FOUND, 404);

    await expect(service.getTokenIdentity(denom)).resolves.toEqual({
      denom,
      name: 'umeme',
      symbol: 'umeme',
      decimals: 0,
      logoUri: null,
    });
  });

  it('resolves the native ubze (no metadata in genesis) to the pinned BZE identity', async () => {
    const { service } = serviceFor(NOT_FOUND, 404);

    await expect(service.getTokenIdentity('ubze')).resolves.toEqual({
      denom: 'ubze',
      name: 'BZE',
      symbol: 'BZE',
      decimals: BZE_DISPLAY_DECIMALS,
      logoUri: null,
    });
  });

  it('propagates network unavailability instead of faking defaults', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const client = new ChainClient({
      endpoints: { rest: ['https://n.example'], rpc: [] },
      fetchFn,
    });

    await expect(new TokenMetadataService(client).getTokenIdentity('ubze')).rejects.toThrow(
      /unreachable/,
    );
  });

  it('rejects garbled metadata rather than rendering a half-empty identity', async () => {
    const { service } = serviceFor({ metadata: { name: 42 } });

    await expect(service.getTokenIdentity(VDL_DENOM)).rejects.toThrow(
      /malformed denom metadata "name"/,
    );
  });

  it('rejects malformed denom units', async () => {
    const { service } = serviceFor({
      metadata: { denom_units: [{ denom: 'x', exponent: -1 }] },
    });

    await expect(service.getTokenIdentity(VDL_DENOM)).rejects.toThrow(/malformed denom unit/);
  });
});
