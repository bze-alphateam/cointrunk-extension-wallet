/**
 * Send screen (BUS-22): enter recipient + amount of the active token, review
 * with the real fee, then confirm to sign & broadcast.
 *
 * The screen holds no key material and does no signing. Review asks the
 * background for a `quoteSend` (simulated gas, fee coin and amount, BUS-51);
 * confirm sends a `send` with the fee the user saw, and the background resolves
 * the sending account and token, signs locally and broadcasts. Amounts are
 * parsed and shown with the active token's own decimals and symbol (from its
 * chain metadata), never the native-token constants. Validation that CAN be
 * done here — a well-formed `bze` recipient and an amount that fits the
 * balance — is done here so the user gets immediate, specific feedback, and
 * re-checked in the background as the trust boundary.
 *
 * The success/failure result rendering is deliberately minimal here; BUS-23
 * enriches it with the explorer link and the fee-token re-check hook.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { validateRecipientAddress } from '../../chain/address';
import { BZE_BASE_DENOM, BZE_DISPLAY_DECIMALS, BZE_DISPLAY_DENOM } from '../../chain/constants';
import { txExplorerUrl } from '../../chain/explorer';
import { FEE_INELIGIBLE_REASON } from '../../chain/fees';
import { formatTokenAmount, parseTokenAmount } from '../../chain/token';
import type { TxFee, TxResult } from '../../chain/tx';
import type { ActiveBalance } from '../../keyring/messages';
import { request } from '../keyringClient';
import { useClipboardCopy } from '../useCopy';
import { FeeWarning } from './FeeWarning';

interface SendProps {
  readonly onClose: () => void;
}

/** Where the user is in the flow. `result` covers both success and failure. */
type Step = 'form' | 'quoting' | 'review' | 'sending' | 'result';

/** A validated, quoted send, ready to broadcast: recipient, amount in base units, fee. */
interface PreparedSend {
  readonly toAddress: string;
  readonly amount: string;
  readonly fee: TxFee;
}

/** How to render an amount of a denom: decimals and symbol. */
interface Display {
  readonly decimals: number;
  readonly symbol: string;
}

/** The native token's display, for a BZE fee on a non-BZE send. */
const BZE_DISPLAY: Display = { decimals: BZE_DISPLAY_DECIMALS, symbol: BZE_DISPLAY_DENOM };

function show(amount: string, display: Display): string {
  return `${formatTokenAmount(amount, display.decimals)} ${display.symbol}`;
}

export function Send({ onClose }: SendProps) {
  const [step, setStep] = useState<Step>('form');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedSend | null>(null);

  const [balance, setBalance] = useState<ActiveBalance | null>(null);
  // Set when the quote said the active token can't pay the fee (BUS-51).
  const [feeBlocked, setFeeBlocked] = useState<string | null>(null);
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

  const token: Display | null = balance
    ? { decimals: balance.identity.decimals, symbol: balance.identity.symbol }
    : null;

  /** The display for the fee's denom: the active token's, or BZE's. */
  function feeDisplay(fee: TxFee): Display {
    if (balance && fee.denom === balance.denom && token) return token;
    return fee.denom === BZE_BASE_DENOM ? BZE_DISPLAY : { decimals: 0, symbol: fee.denom };
  }

  /**
   * Validate the form, ask the background for the fee, and move to review — or
   * surface a specific error (or the fee warning, when the active token can't
   * pay the fee and there is no BZE to pay it with).
   */
  async function review(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFeeBlocked(null);
    try {
      const toAddress = validateRecipientAddress(recipient);
      if (!balance || !token) {
        throw new Error(balanceError ?? 'Your balance is still loading — try again in a moment.');
      }
      const base = parseTokenAmount(amount, token.decimals);
      if (BigInt(base) > BigInt(balance.amount)) {
        throw new Error(`Not enough ${token.symbol} — the amount is more than your balance.`);
      }
      setStep('quoting');
      const quote = await request({
        type: 'quoteSend',
        request: { toAddress, amount: base, denom: balance.denom },
      });
      if (quote.status === 'blocked') {
        if (quote.feeIneligible) {
          setFeeBlocked(quote.reason);
        } else {
          setFormError(quote.reason);
        }
        setStep('form');
        return;
      }
      setPrepared({ toAddress, amount: base, fee: quote.fee });
      setStep('review');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Check the recipient and amount.');
      setStep('form');
    }
  }

  /** Broadcast the prepared send; both outcomes land on the `result` step. */
  async function confirm() {
    if (!prepared || !balance) return;
    setSendError(null);
    setStep('sending');
    try {
      const res = await request({
        type: 'send',
        request: {
          toAddress: prepared.toAddress,
          amount: prepared.amount,
          denom: balance.denom,
          fee: prepared.fee,
        },
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

  const available = balance && token ? show(balance.amount, token) : null;
  const symbol = token?.symbol ?? BZE_DISPLAY_DENOM;

  return (
    <section className="screen">
      <h1 className="screen__title">Send {symbol}</h1>

      {step === 'quoting' && <p className="screen__body">Estimating the network fee…</p>}

      {step === 'form' && (
        <>
          <form className="form" onSubmit={(event) => void review(event)}>
            <label className="form__label" htmlFor="recipient">
              Recipient address
            </label>
            <input
              id="recipient"
              className="form__input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="bze1…"
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
            {feeBlocked && <FeeWarning reason={feeBlocked} onDismiss={() => setFeeBlocked(null)} />}

            <button className="button" type="submit">
              Review
            </button>
          </form>

          <button className="button button--link" type="button" onClick={onClose}>
            Cancel
          </button>
        </>
      )}

      {step === 'review' && prepared && token && (
        <>
          <dl className="review">
            <div className="review__row">
              <dt className="review__label">To</dt>
              <dd className="review__value review__value--mono">{prepared.toAddress}</dd>
            </div>
            <div className="review__row">
              <dt className="review__label">Amount</dt>
              <dd className="review__value">{show(prepared.amount, token)}</dd>
            </div>
            <div className="review__row">
              <dt className="review__label">Network fee</dt>
              <dd className="review__value">
                {show(prepared.fee.amount, feeDisplay(prepared.fee))}
              </dd>
            </div>
            <div className="review__row review__row--total">
              <dt className="review__label">Total</dt>
              <dd className="review__value">
                {prepared.fee.denom === balance?.denom
                  ? show((BigInt(prepared.amount) + BigInt(prepared.fee.amount)).toString(), token)
                  : `${show(prepared.amount, token)} + ${show(prepared.fee.amount, feeDisplay(prepared.fee))}`}
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
            <p className="screen__body">Your {symbol} is on its way.</p>

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
