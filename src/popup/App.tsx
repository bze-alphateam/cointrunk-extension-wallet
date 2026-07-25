/**
 * Popup shell. Asks the background for the keyring state on mount and routes to
 * the matching screen; every state transition comes back from the background, so
 * the popup never holds wallet state of its own.
 */

import { useEffect, useState } from 'react';
import type { KeyringState } from '../keyring/keyring';
import { request } from './keyringClient';
import { CreateWallet } from './screens/CreateWallet';
import { Home } from './screens/Home';
import { Welcome } from './screens/Welcome';

/** Which setup screen the user has navigated to; `null` = follow the keyring state. */
type SetupRoute = 'create' | null;

export function App() {
  const [state, setState] = useState<KeyringState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<SetupRoute>(null);

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

  if (route === 'create') {
    return (
      <main className="app">
        <CreateWallet
          onCreated={(next) => {
            setState(next);
            setRoute(null);
          }}
          onCancel={() => setRoute(null)}
        />
      </main>
    );
  }

  return (
    <main className="app">
      {state.status === 'uninitialized' ? (
        <Welcome onCreate={() => setRoute('create')} />
      ) : (
        // The unlock screen for the `locked` state lands in BUS-18; until then
        // Home at least shows the account metadata, which is visible while locked.
        <Home state={state} />
      )}
    </main>
  );
}
