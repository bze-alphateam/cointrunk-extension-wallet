/**
 * On-chain token branding (BUS-32): TokenfactoryBrandingService reads and
 * validates a denom's branding package, and decideBranding turns it into
 * branded/default. Any valid package means branded — liquidity is never asked.
 */

import { describe, expect, it } from 'vitest';
import { TokenfactoryBrandingService } from '../src/chain/branding';
import { ChainClient } from '../src/chain/client';
import { decideBranding } from '../src/theme/branding';

const VDL_DENOM = 'factory/bze13gzq40che93tgfm9kzmkpjamah5nj0j73pyhqk/uvdl';

const BRANDING = {
  font: 'space-grotesk',
  light: { background: '#FFFFFF', text: '#111111', primary: '#ff6600', secondary: '#0066ff' },
  dark: { background: '#0a0a0a', text: '#f5f5f5', primary: '#FF8833', secondary: '#3388ff' },
};

/** gRPC-gateway NotFound, as returned for a denom without branding. */
const NOT_FOUND = { code: 5, message: 'not found', details: [] };

/** A service over a fake REST node; every call answers `body` with `status`. */
function serviceFor(
  body: unknown,
  status = 200,
): { service: TokenfactoryBrandingService; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const client = new ChainClient({ endpoints: { rest: ['https://n.example'], rpc: [] }, fetchFn });
  return { service: new TokenfactoryBrandingService(client), urls };
}

describe('TokenfactoryBrandingService.getBranding (BUS-32)', () => {
  it('queries denom_branding with the denom URL-encoded in the query string', async () => {
    const { service, urls } = serviceFor({ branding: BRANDING });

    await service.getBranding(VDL_DENOM);
    expect(urls).toEqual([
      'https://n.example/bze/tokenfactory/denom_branding?denom=' + encodeURIComponent(VDL_DENOM),
    ]);
  });

  it('returns a complete, valid package as-is', async () => {
    const { service } = serviceFor({ branding: BRANDING });
    await expect(service.getBranding(VDL_DENOM)).resolves.toEqual(BRANDING);
  });

  it('drops fields the wallet does not consume', async () => {
    const { service } = serviceFor({
      branding: { ...BRANDING, extra: 1, light: { ...BRANDING.light, accent: '#000000' } },
    });
    await expect(service.getBranding(VDL_DENOM)).resolves.toEqual(BRANDING);
  });

  it('reads a denom without branding (404) as null', async () => {
    const { service } = serviceFor(NOT_FOUND, 404);
    await expect(service.getBranding(VDL_DENOM)).resolves.toBeNull();
  });

  it.each([
    ['an empty body', {}],
    ['a null branding', { branding: null }],
    ['a non-object branding', { branding: 'brand' }],
    ['a missing font', { branding: { ...BRANDING, font: undefined } }],
    ['an empty font', { branding: { ...BRANDING, font: '' } }],
    ['a font with invalid characters', { branding: { ...BRANDING, font: 'Space Grotesk' } }],
    ['a font longer than 32 chars', { branding: { ...BRANDING, font: 'a'.repeat(33) } }],
    ['a missing dark palette', { branding: { ...BRANDING, dark: undefined } }],
    [
      'a missing colour',
      { branding: { ...BRANDING, light: { ...BRANDING.light, text: undefined } } },
    ],
    [
      'a short hex colour',
      { branding: { ...BRANDING, dark: { ...BRANDING.dark, primary: '#fff' } } },
    ],
    [
      'a colour without #',
      { branding: { ...BRANDING, light: { ...BRANDING.light, primary: 'ff6600' } } },
    ],
    [
      'a non-hex colour',
      { branding: { ...BRANDING, light: { ...BRANDING.light, secondary: '#gg0000' } } },
    ],
    ['a numeric colour', { branding: { ...BRANDING, dark: { ...BRANDING.dark, background: 0 } } }],
  ])('reads %s as null (all or nothing)', async (_name, body) => {
    const { service } = serviceFor(body);
    await expect(service.getBranding(VDL_DENOM)).resolves.toBeNull();
  });

  it('lets network trouble propagate so the cache can serve stale branding', async () => {
    const fetchFn = (async () => {
      throw new TypeError('network down');
    }) as typeof fetch;
    const client = new ChainClient({
      endpoints: { rest: ['https://n.example'], rpc: [] },
      fetchFn,
    });
    await expect(new TokenfactoryBrandingService(client).getBranding(VDL_DENOM)).rejects.toThrow(
      /unreachable/,
    );
  });
});

describe('decideBranding (BUS-32)', () => {
  it('is branded, carrying the package, when the token has valid branding', () => {
    expect(decideBranding(BRANDING)).toEqual({ kind: 'branded', branding: BRANDING });
  });

  it('is default when the token has no branding', () => {
    expect(decideBranding(null)).toEqual({ kind: 'default' });
  });

  it.each([
    ['no branding (404)', NOT_FOUND, 404],
    ['a partial package', { branding: { ...BRANDING, dark: undefined } }, 200],
    ['a malformed package', { branding: { ...BRANDING, font: 'Bad Font' } }, 200],
  ])('ends at default for %s read from the chain', async (_name, body, status) => {
    const { service } = serviceFor(body, status);
    expect(decideBranding(await service.getBranding(VDL_DENOM))).toEqual({ kind: 'default' });
  });
});
