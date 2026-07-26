/**
 * Token identity metadata — name, symbol, logo, decimals — read from the
 * chain (BUS-26).
 *
 * BZE's Token Factory does not store identity itself: `MsgSetDenomMetadata`
 * writes straight into the **bank module's denom metadata** (see
 * `x/tokenfactory/keeper/msg_server.go` → `bankKeeper.SetDenomMetaData`), so
 * reading it back is a bank query, not a tokenfactory one (the tokenfactory
 * query API only exposes `params` and `denom_authority`).
 *
 * Exact query path, confirmed against the live node (rest.getbze.com,
 * 2026-07-26):
 *
 *     GET /cosmos/bank/v1beta1/denoms_metadata_by_query_string?denom=<url-encoded>
 *
 *   - 200 `{ "metadata": { description, denom_units, base, display, name,
 *     symbol, uri, uri_hash } }` for a factory denom, e.g.
 *     `factory/bze13gzq…/uvdl` → name "Vidulum", symbol "VDL", display unit
 *     exponent 6, `uri` "" (creators often leave the logo unset).
 *   - HTTP 404 `{ "code": 5, … }` (gRPC NotFound) for a denom without
 *     metadata — notably `ubze` itself, since genesis shipped no metadata for
 *     the native token.
 *
 * The classic path-param route is NOT usable on this chain and is why the
 * query-string variant exists (Cosmos SDK ≥ v0.50): factory denoms are
 * `factory/{creator}/{subdenom}`, and the embedded slashes break the URL —
 * verified live: `/cosmos/bank/v1beta1/denoms_metadata/factory/bze1…/uvdl`
 * answers HTTP 501 "Not Implemented" (and 404 for `ubze`).
 *
 * Missing or partial metadata degrades to sensible defaults rather than
 * failing: identity is cosmetic, and a token without a name is still
 * spendable. See {@link TokenMetadataService.getTokenIdentity}.
 */

import { ChainClient, ChainQueryError } from './client';
import { BZE_BASE_DENOM } from './constants';
import { ACTIVE_TOKEN } from './token';

/** The bank REST route that accepts slashed (factory/…) denoms. See module docs. */
const METADATA_PATH = '/cosmos/bank/v1beta1/denoms_metadata_by_query_string?denom=';

/** A token's display identity, resolved from chain metadata plus defaults. */
export interface TokenIdentity {
  /** The base denom this identity was resolved for (as queried). */
  readonly denom: string;
  /** Human-readable name, e.g. `Vidulum`. Defaults to the denom's last path segment. */
  readonly name: string;
  /** Ticker-style symbol, e.g. `VDL`. Defaults like `name`. */
  readonly symbol: string;
  /** Base→display decimal places (display unit's exponent). Defaults to 0 (raw base units). */
  readonly decimals: number;
  /** Logo reference (the metadata `uri`), or null when the creator set none. */
  readonly logoUri: string | null;
}

/**
 * Reads a token's identity from the bank denom metadata (where the Token
 * Factory writes it), falling back per-field when the chain has nothing:
 *
 * - no metadata at all (gRPC NotFound) → all defaults;
 * - the native `ubze` → the wallet's pinned constants (BZE, 6 decimals) —
 *   genesis ships no metadata for it, and rendering `0 decimals` for the
 *   native token would be wrong, not conservative;
 * - empty `name`/`symbol` → the denom's last path segment (`factory/bze1…/
 *   uvdl` → `uvdl`), so a factory token always has a printable identity;
 * - no display denom unit → 0 decimals (amounts shown in raw base units,
 *   never rescaled by a guessed exponent);
 * - empty `uri` → `logoUri: null`, and the UI shows its placeholder art.
 */
export class TokenMetadataService {
  constructor(private readonly client: ChainClient) {}

  async getTokenIdentity(denom: string): Promise<TokenIdentity> {
    let body: unknown;
    try {
      body = await this.client.getRest(METADATA_PATH + encodeURIComponent(denom));
    } catch (error) {
      if (error instanceof ChainQueryError && error.status === 404) {
        return defaultIdentity(denom); // no metadata on chain for this denom
      }
      throw error; // endpoint/network trouble is real trouble — surface it
    }

    return identityFromMetadata(denom, parseMetadataResponse(body));
  }
}

/** The bank `Metadata` fields this service consumes (all optional on chain). */
interface DenomMetadata {
  readonly name?: string;
  readonly symbol?: string;
  readonly display?: string;
  readonly uri?: string;
  readonly denomUnits: readonly { denom: string; exponent: number }[];
}

function defaultIdentity(denom: string): TokenIdentity {
  // The native token's identity is pinned in constants (BUS-14/19); the chain
  // itself has no metadata for ubze, and 0 decimals would misrender BZE.
  if (denom === BZE_BASE_DENOM) {
    return {
      denom,
      name: ACTIVE_TOKEN.displayDenom,
      symbol: ACTIVE_TOKEN.displayDenom,
      decimals: ACTIVE_TOKEN.decimals,
      logoUri: null,
    };
  }
  const lastSegment = denom.split('/').at(-1) || denom;
  return { denom, name: lastSegment, symbol: lastSegment, decimals: 0, logoUri: null };
}

function identityFromMetadata(denom: string, metadata: DenomMetadata): TokenIdentity {
  const defaults = defaultIdentity(denom);

  // Decimals = the exponent of the display unit ("VDL" at exponent 6). A
  // display name that matches no unit yields the 0-decimals default.
  const displayUnit =
    metadata.display === undefined || metadata.display === ''
      ? undefined
      : metadata.denomUnits.find((unit) => unit.denom === metadata.display);

  return {
    denom,
    name: metadata.name || defaults.name,
    symbol: metadata.symbol || defaults.symbol,
    decimals: displayUnit?.exponent ?? defaults.decimals,
    logoUri: metadata.uri ? metadata.uri : null,
  };
}

/**
 * Validate the `QueryDenomMetadataByQueryStringResponse` JSON down to the
 * fields consumed above. Anything present but of the wrong type throws — a
 * half-garbled answer must not silently become "this token has no name".
 */
function parseMetadataResponse(body: unknown): DenomMetadata {
  const { metadata } = (body ?? {}) as { metadata?: unknown };
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error(`malformed denom metadata response: ${JSON.stringify(body)}`);
  }

  const raw = metadata as Record<string, unknown>;
  for (const field of ['name', 'symbol', 'display', 'uri'] as const) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string') {
      throw new Error(`malformed denom metadata "${field}": ${JSON.stringify(raw[field])}`);
    }
  }

  const units = raw['denom_units'] ?? [];
  if (!Array.isArray(units)) {
    throw new Error(`malformed denom metadata "denom_units": ${JSON.stringify(units)}`);
  }
  const denomUnits = units.map((unit: unknown) => {
    const { denom, exponent } = (unit ?? {}) as { denom?: unknown; exponent?: unknown };
    if (typeof denom !== 'string' || !Number.isInteger(exponent) || (exponent as number) < 0) {
      throw new Error(`malformed denom unit: ${JSON.stringify(unit)}`);
    }
    return { denom, exponent: exponent as number };
  });

  return {
    name: raw['name'] as string | undefined,
    symbol: raw['symbol'] as string | undefined,
    display: raw['display'] as string | undefined,
    uri: raw['uri'] as string | undefined,
    denomUnits,
  };
}
