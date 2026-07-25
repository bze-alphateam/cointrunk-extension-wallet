/**
 * First-run create-wallet flow (BUS-15): choose a password → back up the
 * generated recovery phrase → done.
 *
 * The mnemonic is held in this component's state only between those two steps
 * and is cleared the moment the user confirms the backup, so it does not linger
 * in the popup after the flow completes.
 */

import { useState } from 'react';
import type { KeyringState } from '../../keyring/keyring';
import { request } from '../keyringClient';
import { BackupPhrase } from './BackupPhrase';
import { PasswordForm } from './PasswordForm';

interface CreateWalletProps {
  /** Called once the wallet exists and the phrase has been acknowledged. */
  readonly onCreated: (state: KeyringState) => void;
  readonly onCancel: () => void;
}

export function CreateWallet({ onCreated, onCancel }: CreateWalletProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Present only between "wallet created" and "I've saved it".
  const [pending, setPending] = useState<{ mnemonic: string; state: KeyringState } | null>(null);

  async function create(password: string) {
    setBusy(true);
    setError(null);
    try {
      const created = await request({ type: 'createAccount', password });
      setPending({ mnemonic: created.mnemonic, state: created.state });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the wallet.');
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <BackupPhrase
        mnemonic={pending.mnemonic}
        onConfirmed={() => {
          const { state } = pending;
          // Drop the mnemonic from popup state before moving on.
          setPending(null);
          onCreated(state);
        }}
      />
    );
  }

  return (
    <section className="screen">
      <h1 className="screen__title">Create a wallet</h1>
      <p className="screen__body">
        Choose a password to encrypt your new BeeZee wallet on this device.
      </p>
      <PasswordForm onSubmit={create} submitLabel="Create wallet" busy={busy} error={error} />
      <button className="button button--link" type="button" onClick={onCancel} disabled={busy}>
        Back
      </button>
    </section>
  );
}
