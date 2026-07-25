/**
 * The wallet's main screen, shown while unlocked: the active token balance, the
 * account address, an explicit Lock button, and a way into settings.
 *
 * The balance is fetched on mount. Because the popup mounts fresh every time it
 * opens, that is exactly "refresh on popup open" (BUS-19) with no extra plumbing.
 * Transactions arrive in later tickets.
 */

import { useEffect, useState } from 'react';
import type { Balance } from '../../chain/balance';
import { ACTIVE_TOKEN, formatTokenAmount } from '../../chain/token';
import type { KeyringState } from '../../keyring/keyring';
import { request } from '../keyringClient';

interface HomeProps {
  readonly state: KeyringState;
  readonly onLocked: (state: KeyringState) => void;
  readonly onOpenSettings: () => void;
}

/** `bze1abc…wxyz` — enough to recognise the account in a 320px popup. */
function shortenAddress(address: string): string {
  return address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

export function Home({ state, onLocked, onOpenSettings }: HomeProps) {
  const [account] = state.accounts;
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    request({ type: 'getBalance' })
      .then((loaded) => {
        if (cancelled) return;
        setBalance(loaded);
        setBalanceError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setBalanceError(cause instanceof Error ? cause.message : 'Could not load balance.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function lock() {
    try {
      onLocked(await request({ type: 'lock' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not lock the wallet.');
    }
  }

  return (
    <section className="screen">
      <h1 className="screen__title">{account?.label ?? 'Wallet'}</h1>

      <div className="balance">
        {balanceError ? (
          <p className="balance__error">{balanceError}</p>
        ) : balance ? (
          <p className="balance__amount">
            {formatTokenAmount(balance.amount, ACTIVE_TOKEN.decimals)}
            <span className="balance__denom">{ACTIVE_TOKEN.displayDenom}</span>
          </p>
        ) : (
          <p className="balance__loading">Loading balance…</p>
        )}
      </div>

      {account ? (
        <p className="address" title={account.address}>
          {shortenAddress(account.address)}
        </p>
      ) : (
        <p className="screen__body">No account yet.</p>
      )}

      {error && <p className="form__error">{error}</p>}

      <button className="button" type="button" onClick={lock}>
        Lock wallet
      </button>
      <button className="button button--link" type="button" onClick={onOpenSettings}>
        Settings
      </button>
    </section>
  );
}
