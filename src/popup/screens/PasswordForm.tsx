/**
 * Password step shared by every wallet-setup path (BUS-15 create, BUS-16
 * import). Collects and confirms the password that encrypts the vault.
 *
 * The password lives only in this component's state for the length of the
 * submit; it is handed to the background and never persisted or logged
 * (Security Model: "the password is held only transiently").
 */

import { useState, type FormEvent } from 'react';

/**
 * Minimum password length. The vault's real defence is the 600k-iteration
 * PBKDF2 (BUS-17); this floor plus the hint below is the UI-side
 * password-strength guidance the Security Model calls for.
 */
export const MIN_PASSWORD_LENGTH = 8;

interface PasswordFormProps {
  /** Called with the confirmed password. Rejections surface as an inline error. */
  readonly onSubmit: (password: string) => Promise<void>;
  readonly submitLabel: string;
  readonly busy: boolean;
  readonly error: string | null;
}

export function PasswordForm({ onSubmit, submitLabel, busy, error }: PasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setLocalError('Passwords do not match.');
      return;
    }
    setLocalError(null);
    await onSubmit(password);
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label className="form__label" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        className="form__input"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={busy}
      />

      <label className="form__label" htmlFor="confirmation">
        Confirm password
      </label>
      <input
        id="confirmation"
        className="form__input"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={busy}
      />

      <p className="form__hint">
        This password encrypts your wallet on this device. It cannot be recovered — if you forget
        it, you can only restore from your recovery phrase.
      </p>

      {(localError ?? error) && <p className="form__error">{localError ?? error}</p>}

      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Working…' : submitLabel}
      </button>
    </form>
  );
}
