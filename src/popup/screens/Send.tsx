/**
 * Send screen (BUS-22): enter recipient + amount, review with the fee, then
 * confirm to sign & broadcast.
 *
 * The screen holds no key material and does no signing: on confirm it sends a
 * `send` message and the background resolves the sending account, signs, and
 * broadcasts (today via the Epic-4 placeholder, which rejects — surfacing the
 * failure state). Validation that CAN be done here — a well-formed `bze`
 * recipient and an amount that fits the balance plus fee — is done here so the
 * user gets immediate, specific feedback before the review step, and re-checked
 * in the background as the trust boundary.
 *
 * The success/failure result rendering is deliberately minimal here; BUS-23
 * enriches it with the explorer link and the fee-token re-check hook.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { validateRecipientAddress } from '../../chain/address';
import type { Balance } from '../../chain/balance';
import { txExplorerUrl } from '../../chain/explorer';
import { FEE_INELIGIBLE_REASON } from '../../chain/fees';
import { ACTIVE_TOKEN, formatTokenAmount, parseTokenAmount } from '../../chain/token';
import { DEFAULT_SEND_FEE, type TxResult } from '../../chain/tx';
import { request } from '../keyringClient';
import { useClipboardCopy } from '../useCopy';

interface SendProps {
  readonly onClose: () => void;
}

/** Where the user is in the flow. `result` covers both success and failure. */
type Step = 'form' | 'review' | 'sending' | 'result';

/** A validated send, ready to broadcast: recipient + amount in base units. */
interface PreparedSend {
  readonly toAddress: string;
  readonly amount: string;
}

const { decimals, displayDenom } = ACTIVE_TOKEN;

/** `amount + fee`, both base-unit strings, as a base-unit string. */
function withFee(amount: string): string {
  return (BigInt(amount) + BigInt(DEFAULT_SEND_FEE.amount)).toString();
}

export function Send({ onClose }: SendProps) {
  const [step, setStep] = useState<Step>('form');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedSend | null>(null);

  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [result, setResult] = useState<TxResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const hashCopy = useClipboardCopy();

  // The failure-path hook for Epic 7: re-check whether the account can pay fees.
  const [feeCheck, setFeeCheck] = useState<string | null>(null);
  const [feeChecking, setFeeChecking] = useState(false);

  // The amount is validated against this balance, so load it up front — the same
  // "refresh on popup open" query the Home screen uses.
  useEffect(() => {
    let cancelled = false;
    request({ type: 'getBalance' })
      .then((loaded) => {
        if (cancelled) return;
        setBalance(loaded);
        setBalanceError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setBalanceError(cause instanceof Error ? cause.message : 'Could not load your balance.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Validate the form and move to review, or surface a specific error. */
  function review(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      const toAddress = validateRecipientAddress(recipient);
      const base = parseTokenAmount(amount, decimals);
      if (!balance) {
        throw new Error(balanceError ?? 'Your balance is still loading — try again in a moment.');
      }
      if (BigInt(withFee(base)) > BigInt(balance.amount)) {
        throw new Error(
          `Not enough ${displayDenom} — the amount plus the network fee is more than your balance.`,
        );
      }
      setPrepared({ toAddress, amount: base });
      setStep('review');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Check the recipient and amount.');
    }
  }

  /** Broadcast the prepared send; both outcomes land on the `result` step. */
  async function confirm() {
    if (!prepared) return;
    setSendError(null);
    setStep('sending');
    try {
      const res = await request({
        type: 'send',
        request: { toAddress: prepared.toAddress, amount: prepared.amount },
      });
      setResult(res);
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : 'The transaction could not be sent.');
      // BUS-40: a send can fail because the active token is too low-liquidity to
      // be an accepted fee token, so re-check eligibility automatically the moment
      // it fails — the result shows below without the user having to ask.
      void recheckFeeEligibility();
    } finally {
      setStep('result');
    }
  }

  /**
   * Re-check whether the active token can pay fees (BUS-38/40). Runs
   * automatically when a send fails, and again if the user taps the manual
   * retry. Purely informational — it explains a likely cause, it doesn't retry
   * the send.
   */
  async function recheckFeeEligibility() {
    setFeeCheck(null);
    setFeeChecking(true);
    try {
      const eligibility = await request({ type: 'checkFeeEligibility' });
      setFeeCheck(
        eligibility.eligible
          ? (eligibility.reason ?? 'This token can currently be used to pay network fees.')
          : (eligibility.reason ?? FEE_INELIGIBLE_REASON),
      );
    } catch (cause) {
      setFeeCheck(
        cause instanceof Error ? cause.message : 'Could not check fee-token eligibility.',
      );
    } finally {
      setFeeChecking(false);
    }
  }

  const available = balance
    ? `${formatTokenAmount(balance.amount, decimals)} ${displayDenom}`
    : null;

  return (
    <section className="screen">
      <h1 className="screen__title">Send {displayDenom}</h1>

      {step === 'form' && (
        <>
          <form className="form" onSubmit={review}>
            <label className="form__label" htmlFor="recipient">
              Recipient address
            </label>
            <input
              id="recipient"
              className="form__input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder={`${displayDenom.toLowerCase()}1…`}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />

            <label className="form__label" htmlFor="amount">
              Amount
            </label>
            <input
              id="amount"
              className="form__input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="form__hint">
              Available: {available ?? (balanceError ? 'unavailable' : 'loading…')}
            </p>

            {formError && <p className="form__error">{formError}</p>}

            <button className="button" type="submit">
              Review
            </button>
          </form>

          <button className="button button--link" type="button" onClick={onClose}>
            Cancel
          </button>
        </>
      )}

      {step === 'review' && prepared && (
        <>
          <dl className="review">
            <div className="review__row">
              <dt className="review__label">To</dt>
              <dd className="review__value review__value--mono">{prepared.toAddress}</dd>
            </div>
            <div className="review__row">
              <dt className="review__label">Amount</dt>
              <dd className="review__value">
                {formatTokenAmount(prepared.amount, decimals)} {displayDenom}
              </dd>
            </div>
            <div className="review__row">
              <dt className="review__label">Network fee</dt>
              <dd className="review__value">
                {formatTokenAmount(DEFAULT_SEND_FEE.amount, decimals)} {displayDenom}
              </dd>
            </div>
            <div className="review__row review__row--total">
              <dt className="review__label">Total</dt>
              <dd className="review__value">
                {formatTokenAmount(withFee(prepared.amount), decimals)} {displayDenom}
              </dd>
            </div>
          </dl>

          <button className="button" type="button" onClick={() => void confirm()}>
            Confirm &amp; send
          </button>
          <button className="button button--link" type="button" onClick={() => setStep('form')}>
            Back
          </button>
        </>
      )}

      {step === 'sending' && <p className="screen__body">Signing &amp; broadcasting…</p>}

      {step === 'result' &&
        (sendError ? (
          <div className="result">
            <p className="result__title result__title--error">Transaction failed</p>
            <p className="form__error">{sendError}</p>

            {/* BUS-40: the fee-token re-check runs automatically on failure (a
                common cause is a too-low-liquidity fee token); this button just
                re-runs it on demand. */}
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void recheckFeeEligibility()}
              disabled={feeChecking}
            >
              {feeChecking ? 'Checking…' : 'Re-check fee-token eligibility'}
            </button>
            {feeCheck && <p className="form__hint">{feeCheck}</p>}

            <button className="button" type="button" onClick={() => setStep('form')}>
              Back
            </button>
          </div>
        ) : (
          <div className="result">
            <p className="result__title result__title--success">Transaction sent</p>
            <p className="screen__body">Your {displayDenom} is on its way.</p>

            {result?.hash && (
              <>
                <button
                  type="button"
                  className="address"
                  onClick={() => void hashCopy.copy(result.hash)}
                  title={`${result.hash}\nClick to copy`}
                  aria-label={hashCopy.copied ? 'Transaction hash copied' : 'Copy transaction hash'}
                >
                  <span className="address__value">{result.hash}</span>
                  <span className="address__action" aria-hidden="true">
                    {hashCopy.copied ? 'Copied' : 'Copy'}
                  </span>
                </button>
                <a
                  className="button button--link"
                  href={txExplorerUrl(result.hash)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  View on block explorer
                </a>
              </>
            )}

            <button className="button" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        ))}
    </section>
  );
}
