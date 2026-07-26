/**
 * BankBalanceService (BUS-25): all denoms in one call path (with pagination),
 * the active token picked out for the popup, and empty/zero balances treated
 * as zero rather than errors.
 */

import { describe, expect, it } from 'vitest';
import { BankBalanceService } from '../src/chain/bank';
import { ChainClient } from '../src/chain/client';
import { BZE_BASE_DENOM } from '../src/chain/constants';

const ADDRESS = 'bze13gzq40che93tgfm9kzmkpjamah5nj0j73pyhqk';

/** A ChainClient whose single endpoint replays scripted JSON bodies in order. */
function clientFor(pages: unknown[]): { client: ChainClient; paths: string[] } {
  const paths: string[] = [];
  const script = [...pages];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    paths.push(url.pathname + url.search);
    return new Response(JSON.stringify(script.shift()), { status: 200 });
  }) as typeof fetch;
  return {
    client: new ChainClient({ endpoints: { rest: ['https://n.example'], rpc: [] }, fetchFn }),
    paths,
  };
}

const page = (balances: unknown[], nextKey: string | null = null): unknown => ({
  balances,
  pagination: { next_key: nextKey, total: String(balances.length) },
});

describe('BankBalanceService (BUS-25)', () => {
  it('returns every denom from one call path', async () => {
    const { client, paths } = clientFor([
      page([
        { denom: 'factory/bze1abc/utok', amount: '5' },
        { denom: 'ubze', amount: '2581718281' },
      ]),
    ]);

    const balances = await new BankBalanceService(client).getAllBalances(ADDRESS);
    expect(balances).toEqual([
      { denom: 'factory/bze1abc/utok', amount: '5' },
      { denom: 'ubze', amount: '2581718281' },
    ]);
    expect(paths).toEqual([`/cosmos/bank/v1beta1/balances/${ADDRESS}`]);
  });

  it('walks pagination until next_key is exhausted', async () => {
    const { client, paths } = clientFor([
      page([{ denom: 'ubze', amount: '1' }], 'KEY1'),
      page([{ denom: 'udenom2', amount: '2' }], ''),
    ]);

    const balances = await new BankBalanceService(client).getAllBalances(ADDRESS);
    expect(balances.map((b) => b.denom)).toEqual(['ubze', 'udenom2']);
    expect(paths[1]).toContain('?pagination.key=KEY1');
  });

  it('exposes the active token balance for the UI', async () => {
    const { client } = clientFor([
      page([
        { denom: 'factory/bze1abc/utok', amount: '7' },
        { denom: 'ubze', amount: '1234567' },
      ]),
    ]);

    await expect(new BankBalanceService(client).getBalance(ADDRESS)).resolves.toEqual({
      denom: BZE_BASE_DENOM,
      amount: '1234567',
    });
  });

  it('treats an account with no balances as zero, not an error', async () => {
    const { client } = clientFor([page([])]);

    await expect(new BankBalanceService(client).getBalance(ADDRESS)).resolves.toEqual({
      denom: BZE_BASE_DENOM,
      amount: '0',
    });
  });

  it('treats a missing active-token entry as zero, keeping other denoms intact', async () => {
    const { client } = clientFor([page([{ denom: 'factory/bze1abc/utok', amount: '7' }])]);

    await expect(new BankBalanceService(client).getBalance(ADDRESS)).resolves.toEqual({
      denom: BZE_BASE_DENOM,
      amount: '0',
    });
  });

  it('rejects a malformed amount instead of rendering it', async () => {
    const { client } = clientFor([page([{ denom: 'ubze', amount: '12.5' }])]);

    await expect(new BankBalanceService(client).getAllBalances(ADDRESS)).rejects.toThrow(
      /malformed balance amount/,
    );
  });

  it('rejects a response without a balances array', async () => {
    const { client } = clientFor([{ nonsense: true }]);

    await expect(new BankBalanceService(client).getAllBalances(ADDRESS)).rejects.toThrow(
      /malformed balances response/,
    );
  });
});
