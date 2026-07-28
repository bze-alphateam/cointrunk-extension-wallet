/**
 * Settings screen (BUS-18): the auto-lock timeout and the token-switching toggle
 * (BUS-36).
 *
 * The auto-lock value is validated in the background (`assertValidAutoLockMinutes`)
 * and this screen renders whatever error comes back, so there is one set of bounds
 * rather than a UI copy that can drift from the real one. The token-switching
 * toggle persists the moment it flips — there is nothing to validate and a
 * separate Save button for one switch would just be friction.
 */

import { useEffect, useState, type FormEvent } from 'react';
import {
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  type WalletSettings,
} from '../../keyring/settings';
import { request } from '../keyringClient';

interface SettingsProps {
  readonly onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const [settings, setSettings] = useState<WalletSettings | null>(null);
  const [minutes, setMinutes] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request({ type: 'getSettings' })
      .then((loaded) => {
        setSettings(loaded);
        setMinutes(String(loaded.autoLockMinutes));
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load settings.'),
      );
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const updated = await request({
        type: 'setAutoLockMinutes',
        minutes: Number(minutes),
      });
      setSettings(updated);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save settings.');
    }
  }

  /** Flip the token-switching toggle and persist it immediately (BUS-36). */
  async function toggleTokenSwitching(enabled: boolean) {
    setError(null);
    setSaved(false);
    try {
      setSettings(await request({ type: 'setTokenSwitchingEnabled', enabled }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save settings.');
    }
  }

  return (
    <section className="screen">
      <h1 className="screen__title">Settings</h1>

      {settings === null ? (
        error ? (
          <p className="form__error">{error}</p>
        ) : (
          <p className="screen__body">Loading…</p>
        )
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <label className="form__label" htmlFor="auto-lock">
            Auto-lock after (minutes)
          </label>
          <input
            id="auto-lock"
            className="form__input"
            type="number"
            inputMode="numeric"
            min={MIN_AUTO_LOCK_MINUTES}
            max={MAX_AUTO_LOCK_MINUTES}
            step={1}
            value={minutes}
            onChange={(event) => {
              setMinutes(event.target.value);
              setSaved(false);
            }}
          />
          <p className="form__hint">
            The wallet locks itself after this much inactivity and asks for your password again.
            Closing the browser or leaving the extension idle also locks it.
          </p>

          {error && <p className="form__error">{error}</p>}
          {saved && <p className="form__note">Saved.</p>}

          <button className="button" type="submit">
            Save
          </button>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.tokenSwitchingEnabled}
              onChange={(event) => void toggleTokenSwitching(event.target.checked)}
            />
            <span>
              Enable token switching
              <span className="form__hint">
                Show a switcher on the home screen to change which of your tokens is active. The
                wallet re-skins to the token you pick. Off by default.
              </span>
            </span>
          </label>
        </form>
      )}

      <button className="button button--link" type="button" onClick={onClose}>
        Back
      </button>
    </section>
  );
}
