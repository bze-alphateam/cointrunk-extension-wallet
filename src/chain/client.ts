/**
 * HTTP client for the BeeZee chain's public node APIs, with endpoint fallback
 * (BUS-24).
 *
 * A node exposes two HTTP surfaces: the **REST** (LCD / gRPC-gateway) API for
 * module queries — balances, denom metadata — and tx simulate/broadcast
 * (BUS-51), and the **RPC** (CometBFT) API. One client serves both; it only
 * keeps separate endpoint lists because a given host serves one surface or
 * the other.
 *
 * Fallback semantics below apply to reads and to simulate; a broadcast has
 * its own, stricter rule (see {@link ChainClient.broadcastRest}).
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

/**
 * A broadcast reached a node, but its answer never came back (timeout, or a
 * gateway 500/504): the transaction may or may not be in that node's mempool.
 * The client does NOT try another endpoint in that case — see
 * {@link ChainClient.broadcastRest} — so the caller has to tell the user to
 * check before sending again.
 */
export class ChainOutcomeUnknownError extends Error {
  constructor(url: string) {
    super(`no answer to the broadcast from ${url}`);
    this.name = 'ChainOutcomeUnknownError';
  }
}

/**
 * The REST surface the transaction path needs (BUS-51), as an interface so the
 * signer/broadcast code can be tested against a double. {@link ChainClient}
 * is the production implementation.
 */
export interface RestTransport {
  getRest(path: string): Promise<unknown>;
  /** An idempotent POST (e.g. simulate): falls back exactly like a GET. */
  postRest(path: string, body: unknown): Promise<unknown>;
  /** A non-idempotent POST (a broadcast): see {@link ChainClient.broadcastRest}. */
  broadcastRest(path: string, body: unknown): Promise<unknown>;
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
export class ChainClient implements RestTransport {
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

  /** POST a JSON `body` to the REST API, for idempotent calls (simulate). Falls back like a GET. */
  postRest(path: string, body: unknown): Promise<unknown> {
    return this.request('rest', path, body);
  }

  /**
   * POST a transaction broadcast to the REST API (BUS-51). Unlike every other
   * call, this one must never reach a second node once a first one may have
   * taken the transaction, so it only falls back when the endpoint was plainly
   * **unreachable**: a connection failure (fetch rejects before any answer) or
   * a 502/503 from the proxy in front of the node. A timeout, a 500 or a 504
   * means the node may already have the tx; that throws
   * {@link ChainOutcomeUnknownError} instead of trying the next endpoint.
   *
   * (Re-sending the same signed bytes could not move funds twice anyway: the
   * account sequence makes the second copy invalid. The rule keeps the user's
   * view honest: "sent", "rejected" or "unknown, check the explorer".)
   */
  async broadcastRest(path: string, body: unknown): Promise<unknown> {
    assertPath(path);
    for (const base of this.endpoints.rest) {
      const url = joinUrl(base, path);

      let response: Response;
      try {
        response = await this.fetchFn(url, this.init(body));
      } catch (error) {
        // AbortSignal.timeout rejects with a DOMException named TimeoutError.
        if ((error as { name?: unknown } | null)?.name === 'TimeoutError') {
          throw new ChainOutcomeUnknownError(url);
        }
        continue; // never connected — nothing was delivered, try the next
      }

      if (response.status === 502 || response.status === 503) {
        continue; // the proxy could not reach its node — nothing was delivered
      }
      if (response.status >= 500) {
        throw new ChainOutcomeUnknownError(url);
      }
      if (!response.ok) {
        throw new ChainQueryError(response.status, await parseBody(response), url);
      }
      return response.json();
    }

    throw new ChainUnavailableError('rest');
  }

  private get(kind: keyof ChainEndpoints, path: string): Promise<unknown> {
    return this.request(kind, path, undefined);
  }

  /** `fetch` options: a timeout, plus a JSON body for a POST. */
  private init(body: unknown): RequestInit {
    const signal = AbortSignal.timeout(this.timeoutMs);
    if (body === undefined) {
      return { signal };
    }
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    };
  }

  private async request(kind: keyof ChainEndpoints, path: string, body: unknown): Promise<unknown> {
    assertPath(path);

    for (const base of this.endpoints[kind]) {
      const url = joinUrl(base, path);

      let response: Response;
      try {
        response = await this.fetchFn(url, this.init(body));
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

function assertPath(path: string): void {
  if (!path.startsWith('/')) {
    throw new Error(`chain query path must start with '/': ${JSON.stringify(path)}`);
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

/** Error bodies are JSON from the gRPC-gateway, but never trust that blindly. */
async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
