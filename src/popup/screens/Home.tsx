/**
 * The wallet's main screen: the account address and lock status. Balances and
 * transactions arrive in later epics; lock / auto-lock controls in BUS-18.
 */

import type { KeyringState } from '../../keyring/keyring';

interface HomeProps {
  readonly state: KeyringState;
}

/** `bze1abc…wxyz` — enough to recognise the account in a 320px popup. */
function shortenAddress(address: string): string {
  return address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

export function Home({ state }: HomeProps) {
  const [account] = state.accounts;

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
      <p className="screen__body">
        Status: <strong>{state.status}</strong>
      </p>
    </section>
  );
}
