/**
 * Copy-to-clipboard with transient "Copied" feedback (BUS-20/BUS-21).
 *
 * Keeps the timer bookkeeping — and the unmount cleanup that avoids a state
 * update after the popup closes — in one place, so any screen that copies text
 * (the Receive address, later the Send review) gets the same behaviour without
 * re-implementing it.
 */

import { useEffect, useRef, useState } from 'react';
import { copyText } from './clipboard';

/** How long the "Copied" confirmation stays up after a successful copy. */
export const COPIED_FEEDBACK_MS = 1500;

export interface ClipboardCopy {
  /** `true` for {@link COPIED_FEEDBACK_MS} after a successful copy. */
  readonly copied: boolean;
  /** A user-readable message if the last copy failed, else `null`. */
  readonly error: string | null;
  /** Copy `text` to the clipboard and flash the confirmation. */
  copy(text: string): Promise<void>;
}

export function useClipboardCopy(): ClipboardCopy {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clear any pending "Copied" reset when the screen unmounts / popup closes.
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(text: string): Promise<void> {
    try {
      await copyText(text);
      setError(null);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch (cause) {
      setCopied(false);
      setError(cause instanceof Error ? cause.message : 'Could not copy the address.');
    }
  }

  return { copied, error, copy };
}
