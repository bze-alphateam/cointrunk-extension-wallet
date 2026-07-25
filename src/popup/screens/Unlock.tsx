/**
 * Unlock screen (BUS-18): the password gate shown whenever a vault exists but no
 * signer is held in memory — on first open, after an explicit lock, after
 * auto-lock, and after the service worker has been evicted.
 *
 * The password is held in component state only until submit and is cleared on a
 * failed attempt; it is never cached across popup sessions (Security Model:
 * "the popup never caches the password or secrets across sessions").
 */

import { useState, type FormEvent } from 'react';
import type { KeyringState } from '../../keyring/keyring';
import type { VaultAccount } from '../../keyring/vault';
import { request } from '../keyringClient';

interface UnlockProps {
  /** Account metadata stays visible while locked, so the user sees whose wallet this is. */
  readonly account: VaultAccount | undefined;
  readonly onUnlocked: (state: KeyringState) => void;
}

export function Unlock({ account, onUnlocked }: UnlockProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await request({ type: 'unlock', password }));
    } catch (cause) {
      // The background returns a generic 'invalid password' — the GCM auth tag
      // is the only check, and it cannot say more than pass/fail anyway.
      setError(cause instanceof Error ? cause.message : 'Could not unlock the wallet.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen screen--centered">
      <img className="screen__logo" src="/icons/icon-48.png" alt="" width={48} height={48} />
      <h1 className="screen__title">Wallet locked</h1>
      {account && <p className="screen__body">{account.label}</p>}

      <form className="form form--wide" onSubmit={handleSubmit}>
        <label className="form__label" htmlFor="unlock-password">
          Password
        </label>
        <input
          id="unlock-password"
          className="form__input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />

        {error && <p className="form__error">{error}</p>}

        <button className="button" type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </section>
  );
}
