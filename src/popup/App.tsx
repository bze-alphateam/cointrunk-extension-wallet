/**
 * Popup shell. Asks the background for the keyring state on mount and routes to
 * the matching screen; every state transition comes back from the background, so
 * the popup never holds wallet state of its own.
 *
 * The keyring's three statuses map straight onto the three screens — that is why
 * auto-lock needs no popup plumbing: the next time the popup opens (or the next
 * response arrives) the status is `locked` and the unlock screen is what renders.
 */

import { useEffect, useState } from 'react';
import type { KeyringState } from '../keyring/keyring';
import { request } from './keyringClient';
import { CreateWallet } from './screens/CreateWallet';
import { Home } from './screens/Home';
import { ImportWallet } from './screens/ImportWallet';
import { Receive } from './screens/Receive';
import { Settings } from './screens/Settings';
import { Unlock } from './screens/Unlock';
import { Welcome } from './screens/Welcome';

/** Which screen the user has navigated to; `null` = follow the keyring status. */
type Route = 'create' | 'import' | 'settings' | 'receive' | null;

export function App() {
  const [state, setState] = useState<KeyringState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(null);

  useEffect(() => {
    request({ type: 'getState' })
      .then(setState)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not reach the wallet.'),
      );
  }, []);

  if (error) {
    return (
      <main className="app">
        <p className="form__error">{error}</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="app">
        <p className="screen__body">Loading…</p>
      </main>
    );
  }

  /** Adopt a new state from the background and return to status-driven routing. */
  function adopt(next: KeyringState) {
    setState(next);
    setRoute(null);
  }

  const closeRoute = () => setRoute(null);

  // Sub-routes reachable only from the unlocked Home screen, so an account
  // exists; the guard keeps them type-safe and falls back to status routing.
  const [account] = state.accounts;

  if (route === 'receive' && account) {
    return (
      <main className="app">
        <Receive account={account} onClose={closeRoute} />
      </main>
    );
  }

  if (route === 'create') {
    return (
      <main className="app">
        <CreateWallet onCreated={adopt} onCancel={closeRoute} />
      </main>
    );
  }

  if (route === 'import') {
    return (
      <main className="app">
        <ImportWallet onImported={adopt} onCancel={closeRoute} />
      </main>
    );
  }

  if (route === 'settings') {
    return (
      <main className="app">
        <Settings onClose={closeRoute} />
      </main>
    );
  }

  return (
    <main className="app">
      {state.status === 'uninitialized' ? (
        <Welcome onCreate={() => setRoute('create')} onImport={() => setRoute('import')} />
      ) : state.status === 'locked' ? (
        <Unlock account={state.accounts[0]} onUnlocked={adopt} />
      ) : (
        <Home
          state={state}
          onLocked={adopt}
          onReceive={() => setRoute('receive')}
          onOpenSettings={() => setRoute('settings')}
        />
      )}
    </main>
  );
}
