/**
 * A token's on-chain branding package, read from the tokenfactory module
 * (BUS-32).
 *
 * The denom admin sets it with `MsgSetDenomBranding`; the chain stores it as
 * `DenomBranding { font, light, dark }` (`proto/bze/tokenfactory/
 * denom_branding.proto`), each palette a `BrandingColors { background, text,
 * primary, secondary }`. The package is all or nothing on chain: a font slug
 * matching `^[a-z0-9-]{1,32}$` and all eight colours as `#RRGGBB`
 * (`x/tokenfactory/types/denom_branding.go`).
 *
 * Query path (query string, so factory/IBC denoms with slashes work):
 *
 *     GET /bze/tokenfactory/denom_branding?denom=<url-encoded>
 *       200 { "branding": { font, light: {…}, dark: {…} } }
 *       404 { "code": 5, "message": "not found" } — the denom has no branding.
 *
 * Branding is cosmetic, so this reader never lets a bad answer break the
 * popup: no branding (404), an absent `branding`, or a malformed or partial
 * package all read as `null` — the default skin. Only network trouble
 * propagates, so the cache in {@link ../chain/chain-data.CachedChainData} can
 * serve the last good value; that layer turns an outage with nothing cached
 * into `null` as well.
 */

import { ChainClient, ChainQueryError } from './client';

/** The tokenfactory REST route for one denom's branding. See module docs. */
const BRANDING_PATH = '/bze/tokenfactory/denom_branding?denom=';

/** The chain's own validation rules for a branding package. */
const FONT_PATTERN = /^[a-z0-9-]{1,32}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** One theme's four brand colours, each `#RRGGBB`. */
export interface BrandingColors {
  readonly background: string;
  readonly text: string;
  readonly primary: string;
  readonly secondary: string;
}

/** A token's validated on-chain branding: a font slug plus light and dark palettes. */
export interface DenomBranding {
  readonly font: string;
  readonly light: BrandingColors;
  readonly dark: BrandingColors;
}

/** Reads a denom's branding package, or `null` when it has no valid one. */
export interface BrandingReader {
  getBranding(denom: string): Promise<DenomBranding | null>;
}

/**
 * Queries the tokenfactory module over the REST API. A missing or invalid
 * package resolves to `null`; network/endpoint failures propagate from
 * {@link ChainClient} (see module docs for why).
 */
export class TokenfactoryBrandingService implements BrandingReader {
  constructor(private readonly client: ChainClient) {}

  async getBranding(denom: string): Promise<DenomBranding | null> {
    let body: unknown;
    try {
      body = await this.client.getRest(BRANDING_PATH + encodeURIComponent(denom));
    } catch (error) {
      if (error instanceof ChainQueryError && error.status === 404) {
        return null; // no branding on chain for this denom
      }
      throw error;
    }

    const { branding } = (body ?? {}) as { branding?: unknown };
    return parseBranding(branding);
  }
}

/** The whole package or nothing: any missing or invalid field means no branding. */
function parseBranding(value: unknown): DenomBranding | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const font = raw['font'];
  const light = parseColors(raw['light']);
  const dark = parseColors(raw['dark']);
  if (typeof font !== 'string' || !FONT_PATTERN.test(font) || light === null || dark === null) {
    return null;
  }
  return { font, light, dark };
}

function parseColors(value: unknown): BrandingColors | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const colors = [raw['background'], raw['text'], raw['primary'], raw['secondary']];
  if (!colors.every((color) => typeof color === 'string' && COLOR_PATTERN.test(color))) {
    return null;
  }
  const [background, text, primary, secondary] = colors as string[];
  return { background, text, primary, secondary };
}
