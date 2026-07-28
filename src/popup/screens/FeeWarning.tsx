/**
 * The fee-token warning (BUS-39), shown on Home when the active token can't
 * currently be used to pay network fees because its liquidity is too low
 * (BUS-38).
 *
 * Deliberately calm and unobtrusive: it uses `role="status"` (a polite live
 * region, not an alarm), reads as an FYI rather than an error, and is
 * dismissible. It changes nothing else — not the skin, not the balance, and it
 * never blocks send/receive; paying fees in native BZE still works. It is a pure
 * function of its props; Home owns when it shows and re-checks it.
 */

interface FeeWarningProps {
  /** The human-readable reason the active token can't pay fees right now. */
  readonly reason: string;
  /** Dismiss the warning for this popup session. */
  readonly onDismiss: () => void;
}

export function FeeWarning({ reason, onDismiss }: FeeWarningProps) {
  return (
    <aside className="fee-warning" role="status">
      <p className="fee-warning__text">{reason}</p>
      <button
        type="button"
        className="fee-warning__dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </aside>
  );
}
