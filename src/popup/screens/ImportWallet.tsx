/**
 * Import-an-existing-wallet flow (BUS-16): paste a 12- or 24-word recovery
 * phrase, choose a password, done.
 *
 * The phrase is typed into a textarea that lives only in this component's state
 * and is cleared as soon as the import succeeds. Validation happens in the
 * background (the keyring owns the BIP39 rules); this screen only renders the
 * error string it gets back — which the background has already written to be
 * specific but free of any mnemonic content.
 */

import { useState, type FormEvent } from 'react';
import { ACCEPTED_MNEMONIC_WORD_COUNTS, normalizeMnemonic } from '../../keyring/account';
import type { KeyringState } from '../../keyring/keyring';
import { request } from '../keyringClient';
import { MIN_PASSWORD_LENGTH } from './PasswordForm';

interface ImportWalletProps {
  readonly onImported: (state: KeyringState) => void;
  readonly onCancel: () => void;
}

export function ImportWallet({ onImported, onCancel }: ImportWalletProps) {
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live, non-judgemental progress — no validation verdict until submit, so the
  // user isn't nagged mid-typing.
  const wordCount = normalizeMnemonic(phrase).split(' ').filter(Boolean).length;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const state = await request({ type: 'importAccount', mnemonic: phrase, password });
      // Drop the phrase from popup state the moment it is no longer needed.
      setPhrase('');
      onImported(state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import the wallet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen">
      <h1 className="screen__title">Import a wallet</h1>
      <p className="screen__body">
        Enter your {ACCEPTED_MNEMONIC_WORD_COUNTS.join(' or ')}-word recovery phrase, separated by
        spaces.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="form__label" htmlFor="phrase">
          Recovery phrase
        </label>
        <textarea
          id="phrase"
          className="form__input form__input--area"
          rows={4}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          disabled={busy}
        />
        <p className="form__hint">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </p>

        <label className="form__label" htmlFor="import-password">
          Password
        </label>
        <input
          id="import-password"
          className="form__input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />

        <label className="form__label" htmlFor="import-confirmation">
          Confirm password
        </label>
        <input
          id="import-confirmation"
          className="form__input"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
        />

        <p className="form__hint">
          This password encrypts the imported wallet on this device. It is not your recovery phrase
          and does not have to match the one you used elsewhere.
        </p>

        {error && <p className="form__error">{error}</p>}

        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Importing…' : 'Import wallet'}
        </button>
      </form>

      <button className="button button--link" type="button" onClick={onCancel} disabled={busy}>
        Back
      </button>
    </section>
  );
}
