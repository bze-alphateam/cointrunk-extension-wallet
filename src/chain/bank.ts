/**
 * Bank module queries: the account's balances, straight from the chain
 * (BUS-25).
 *
 * This is the first real replacement of an Epic 4 placeholder:
 * {@link BankBalanceService} implements the {@link BalanceService} seam the
 * popup already consumes (BUS-19), so wiring it into the background is the
 * only UI-facing change — the message routing, loading and error states all
 * stay as they are.
 *
 * One call path serves every denom: `GET /cosmos/bank/v1beta1/balances/
 * {address}` returns all of the account's balances (paginated), and the
 * active token's balance is picked out of that same result. An account the
 * chain has never seen — or one holding none of the active token — is not an
 * error; it simply has a zero balance.
 */

import type { Balance, BalanceService } from './balance';
import { ChainClient } from './client';
import { ACTIVE_TOKEN, type ActiveToken } from './token';

/** The bank module's REST route for an account's balances across all denoms. */
const BALANCES_PATH = '/cosmos/bank/v1beta1/balances/';

/**
 * Queries the account's balances from the bank module over the REST API.
 * Network/endpoint failures propagate from {@link ChainClient} with
 * user-readable messages; a malformed response body throws, because a wallet
 * must never render a number it could not actually parse.
 */
export class BankBalanceService implements BalanceService {
  constructor(
    private readonly client: ChainClient,
    private readonly activeToken: ActiveToken = ACTIVE_TOKEN,
  ) {}

  /**
   * All of the account's balances, walking the response pagination so the
   * caller always sees the complete set — one call path regardless of how
   * many denoms the account holds.
   */
  async getAllBalances(address: string): Promise<Balance[]> {
    const balances: Balance[] = [];
    let nextKey: string | null = null;

    do {
      const path: string =
        BALANCES_PATH +
        encodeURIComponent(address) +
        (nextKey === null ? '' : `?pagination.key=${encodeURIComponent(nextKey)}`);
      const page = parseBalancesResponse(await this.client.getRest(path));
      balances.push(...page.balances);
      nextKey = page.nextKey;
    } while (nextKey !== null);

    return balances;
  }

  /**
   * The active token's balance for the popup home screen (Epic 3). Missing
   * from the result set — empty account, or none of this token — is a plain
   * zero balance, not an error.
   */
  async getBalance(address: string): Promise<Balance> {
    const balances = await this.getAllBalances(address);
    const active = balances.find((balance) => balance.denom === this.activeToken.baseDenom);
    return active ?? { denom: this.activeToken.baseDenom, amount: '0' };
  }
}

/** One page of the balances response, already validated. */
interface BalancesPage {
  readonly balances: Balance[];
  /** Opaque cursor for the next page, or null on the last one. */
  readonly nextKey: string | null;
}

/**
 * Validate one page of `QueryAllBalancesResponse` JSON. Every field the
 * service consumes is checked: `balances` entries must be `{ denom, amount }`
 * with an unsigned-integer `amount` (the shape `formatTokenAmount` requires),
 * and `pagination.next_key` must be a string or null/absent.
 */
function parseBalancesResponse(body: unknown): BalancesPage {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`malformed balances response: ${JSON.stringify(body)}`);
  }

  const { balances, pagination } = body as { balances?: unknown; pagination?: unknown };
  if (!Array.isArray(balances)) {
    throw new Error('malformed balances response: "balances" is not an array');
  }

  const parsed = balances.map((entry: unknown): Balance => {
    const { denom, amount } = (entry ?? {}) as { denom?: unknown; amount?: unknown };
    if (typeof denom !== 'string' || denom.length === 0) {
      throw new Error(`malformed balance entry: ${JSON.stringify(entry)}`);
    }
    if (typeof amount !== 'string' || !/^\d+$/.test(amount)) {
      throw new Error(`malformed balance amount for ${denom}: ${JSON.stringify(amount)}`);
    }
    return { denom, amount };
  });

  const nextKey = (pagination as { next_key?: unknown } | null | undefined)?.next_key ?? null;
  if (nextKey !== null && typeof nextKey !== 'string') {
    throw new Error(`malformed pagination.next_key: ${JSON.stringify(nextKey)}`);
  }

  return { balances: parsed, nextKey: nextKey === '' ? null : nextKey };
}
