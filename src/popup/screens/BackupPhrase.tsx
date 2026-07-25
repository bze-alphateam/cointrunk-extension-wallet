/**
 * One-time recovery-phrase backup screen (BUS-15).
 *
 * The mnemonic reaches this component exactly once — as the direct reply to
 * `createAccount` — and there is no message that can fetch it again. Confirming
 * "I've saved it" is therefore a real gate: the parent drops the phrase from
 * React state on confirm and it is unrecoverable from the UI afterwards.
 *
 * Secret-handling rules this screen upholds:
 *  - the phrase is rendered into the popup DOM only; it is never logged, never
 *    written to storage, never placed in a URL, and never leaves the popup;
 *  - no copy-to-clipboard, so the phrase cannot be picked up by clipboard
 *    readers — the user transcribes it, which is also the safer backup habit.
 */

import { useState } from 'react';

interface BackupPhraseProps {
  readonly mnemonic: string;
  /** Called once the user confirms. The parent must then drop the mnemonic. */
  readonly onConfirmed: () => void;
}

export function BackupPhrase({ mnemonic, onConfirmed }: BackupPhraseProps) {
  const [saved, setSaved] = useState(false);
  const words = mnemonic.split(' ');

  return (
    <section className="screen">
      <h1 className="screen__title">Back up your recovery phrase</h1>
      <p className="screen__body">
        These {words.length} words are the only way to restore this wallet. Write them down in order
        and keep them offline — anyone who has them can spend your funds. They are shown once and
        cannot be displayed again.
      </p>

      <ol className="phrase">
        {words.map((word, index) => (
          // Index keys are correct here: the list is fixed and never reordered.
          <li className="phrase__word" key={index}>
            <span className="phrase__index">{index + 1}</span>
            {word}
          </li>
        ))}
      </ol>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        I have written down my recovery phrase and stored it safely.
      </label>

      <button className="button" type="button" disabled={!saved} onClick={onConfirmed}>
        Continue
      </button>
    </section>
  );
}
