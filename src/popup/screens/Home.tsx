/**
 * The wallet's main screen, shown while unlocked: the account address, an
 * explicit Lock button, and a way into settings. Balances and transactions
 * arrive in later epics.
 */

import { useState } from 'react';
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
