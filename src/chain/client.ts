/**
 * HTTP client for the BeeZee chain's public node APIs, with endpoint fallback
 * (BUS-24).
 *
 * A node exposes two HTTP surfaces the wallet cares about: the **REST** (LCD /
 * gRPC-gateway) API for module queries — balances, denom metadata — and the
 * **RPC** (CometBFT) API for broadcasting transactions. Both are plain
 * GET/JSON from the extension's point of view, so one client serves both; it
 * only keeps separate endpoint lists because a given host serves one surface
 * or the other.
 *
 * Fallback semantics: endpoints are tried in order. An endpoint that is
 * *unavailable* — network error, timeout, or a 5xx response — falls through to
 * the next one. A 4xx response does NOT fall back: it means the node
 * understood the query and rejected it (e.g. "no metadata for this denom"),
 * so every other node would answer the same, and callers need to see it (as a
 * {@link ChainQueryError} carrying the HTTP status).
 *
 * No MV3 host permissions are needed: the public BZE nodes answer with
 * `Access-Control-Allow-Origin: *` (verified against rest.getbze.com,
 * BUS-24), and an endpoint that ever lacked CORS would just count as
 * unavailable and fall through.
 */

/** The endpoint lists the client walks, in priority order. */
export interface ChainEndpoints {
  /** REST (LCD / gRPC-gateway) base URLs, e.g. `https://rest.getbze.com`. */
  readonly rest: readonly string[];
  /** RPC (CometBFT) base URLs, e.g. `https://rpc.getbze.com`. */
  readonly rpc: readonly string[];
}

/**
 * Default BeeZee mainnet endpoints, primary first. Taken from the Cosmos
 * chain-registry (`beezee/chain.json`) — these are the AlphaTeam-operated
 * hosts the official BZE frontends also use; `-1`/`-2` are the fallbacks.
 * Tests (and a future settings screen) override these via the
 * {@link ChainClient} constructor rather than editing this constant.
 */
export const DEFAULT_ENDPOINTS: ChainEndpoints = {
  rest: ['https://rest.getbze.com', 'https://rest-1.getbze.com', 'https://rest-2.getbze.com'],
  rpc: ['https://rpc.getbze.com', 'https://rpc-1.getbze.com', 'https://rpc-2.getbze.com'],
};

/** How long to wait on one endpoint before falling through to the next. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * A node answered with an HTTP error that no amount of falling back would
 * change (4xx). `status` and the parsed error `body` (usually
 * `{ code, message }` from the gRPC-gateway) let callers tell "not found"
 * apart from a genuinely malformed query.
 */
export class ChainQueryError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    url: string,
  ) {
    super(`chain query failed with HTTP ${status} at ${url}`);
    this.name = 'ChainQueryError';
  }
}

/**
 * Every configured endpoint was unavailable. The message is user-readable on
 * purpose: services surface it to the popup as-is, like the placeholder
 * services before them did.
 */
export class ChainUnavailableError extends Error {
  constructor(kind: keyof ChainEndpoints) {
    super(`The BeeZee network is unreachable right now (all ${kind} endpoints failed).`);
    this.name = 'ChainUnavailableError';
  }
}

/** Constructor options; every field has a production default. */
export interface ChainClientOptions {
  readonly endpoints?: ChainEndpoints;
  /** Injected in tests; defaults to the global `fetch`. */
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * GET-and-parse-JSON against the chain's REST or RPC surface, walking the
 * endpoint list on failure. Stateless between calls: every request starts
 * again from the primary, so a one-off outage does not demote it.
 */
export class ChainClient {
  private readonly endpoints: ChainEndpoints;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ChainClientOptions = {}) {
    this.endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** GET `path` (absolute, starting with `/`, query string included) from the REST API. */
  getRest(path: string): Promise<unknown> {
    return this.get('rest', path);
  }

  /** GET `path` (absolute, starting with `/`, query string included) from the RPC API. */
  getRpc(path: string): Promise<unknown> {
    return this.get('rpc', path);
  }

  private async get(kind: keyof ChainEndpoints, path: string): Promise<unknown> {
    if (!path.startsWith('/')) {
      throw new Error(`chain query path must start with '/': ${JSON.stringify(path)}`);
    }

    for (const base of this.endpoints[kind]) {
      const url = base.replace(/\/+$/, '') + path;

      let response: Response;
      try {
        response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      } catch {
        continue; // network error or timeout — endpoint unavailable, try the next
      }

      if (response.status >= 500) {
        continue; // node broken or overloaded — try the next
      }
      if (!response.ok) {
        throw new ChainQueryError(response.status, await parseBody(response), url);
      }
      return response.json();
    }

    throw new ChainUnavailableError(kind);
  }
}

/** Error bodies are JSON from the gRPC-gateway, but never trust that blindly. */
async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
