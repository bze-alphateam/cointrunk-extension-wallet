/**
 * The wallet's main screen, shown while unlocked: the active token balance, the
 * account address, an explicit Lock button, and a way into settings. When the
 * user has enabled token switching (BUS-36), a switcher lists their tokens and
 * lets them change the active one, re-skinning the wallet (BUS-37).
 *
 * The balance is fetched on mount. Because the popup mounts fresh every time it
 * opens, that is exactly "refresh on popup open" (BUS-19) with no extra plumbing.
 */

import { useEffect, useRef, useState } from 'react';
import type { Balance } from '../../chain/balance';
import { FEE_INELIGIBLE_REASON } from '../../chain/fees';
import { ACTIVE_TOKEN, formatTokenAmount } from '../../chain/token';
import type { HeldToken } from '../../keyring/messages';
import type { KeyringState } from '../../keyring/keyring';
import { applyActiveSkin } from '../activeSkin';
import { copyText } from '../clipboard';
import { request } from '../keyringClient';
import { FeeWarning } from './FeeWarning';
import { TokenSwitcher } from './TokenSwitcher';

/** How long the "Copied" confirmation stays up after a successful copy. */
const COPIED_FEEDBACK_MS = 1500;

interface HomeProps {
  readonly state: KeyringState;
  readonly onLocked: (state: KeyringState) => void;
  readonly onSend: () => void;
  readonly onReceive: () => void;
  readonly onOpenSettings: () => void;
}

/** `bze1abc…wxyz` — enough to recognise the account in a 320px popup. */
function shortenAddress(address: string): string {
  return address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

export function Home({ state, onLocked, onSend, onReceive, onOpenSettings }: HomeProps) {
  const [account] = state.accounts;
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Token switcher (BUS-37), shown only when enabled in Settings (BUS-36).
  const [switchingEnabled, setSwitchingEnabled] = useState(false);
  const [tokens, setTokens] = useState<readonly HeldToken[]>([]);
  const [activeDenom, setActiveDenom] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // Fee-token warning (BUS-39): the reason the active token can't pay fees, or
  // null when it can (or the check hasn't run). Dismissible for the session.
  const [feeWarning, setFeeWarning] = useState<string | null>(null);
  const [feeWarningDismissed, setFeeWarningDismissed] = useState(false);

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
        setBalanceError(cause instanceof Error ? cause.message : 'Could not load balance.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the switcher's inputs on open: the toggle, the active denom, and (only
  // when switching is on) the held-token list. Failures leave the switcher
  // hidden rather than surfacing an error — it is an optional convenience, and a
  // flaky chain read must never block the wallet's core balance/send/receive.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await request({ type: 'getSettings' });
        if (cancelled) return;
        setSwitchingEnabled(settings.tokenSwitchingEnabled);
        const { denom } = await request({ type: 'getActiveToken' });
        if (cancelled) return;
        setActiveDenom(denom);
        if (settings.tokenSwitchingEnabled) {
          const held = await request({ type: 'getHeldTokens' });
          if (cancelled) return;
          setTokens(held);
        }
      } catch {
        // Keep the switcher hidden; the core screen still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Re-check whether the active token can pay fees and refresh the warning
   * (BUS-38/39). One of the two BUS-40 re-check points (the other is a failed tx,
   * on the Send screen); both funnel through the same `checkFeeEligibility`. A
   * failed check leaves the current warning untouched — never invent one from an
   * error — and never blocks anything.
   */
  async function refreshFeeWarning() {
    try {
      const eligibility = await request({ type: 'checkFeeEligibility' });
      setFeeWarning(eligibility.eligible ? null : (eligibility.reason ?? FEE_INELIGIBLE_REASON));
    } catch {
      // Keep whatever warning state we already have.
    }
  }

  // Check on open (BUS-39), after the core balance load — a fee warning is an FYI
  // layered on top of a fully working wallet, never a gate in front of it.
  useEffect(() => {
    void refreshFeeWarning();
  }, []);

  /**
   * Switch the active token (BUS-37): persist the choice, re-skin the wallet to
   * it immediately, and re-check fee eligibility for the new token (BUS-40). A
   * fresh check un-dismisses the warning, so switching to a low-liquidity token
   * re-surfaces it even if the previous one was dismissed.
   */
  async function switchToken(denom: string) {
    if (denom === activeDenom || switching) return;
    setSwitching(true);
    try {
      const active = await request({ type: 'setActiveToken', denom });
      setActiveDenom(active.denom);
      applyActiveSkin(active.denom);
      setFeeWarningDismissed(false);
      await refreshFeeWarning();
    } catch {
      // A failed switch leaves the previous active token in place.
    } finally {
      setSwitching(false);
    }
  }

  // Clear any pending "Copied" reset when the popup closes.
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function copyAddress() {
    if (!account) return;
    try {
      await copyText(account.address);
      setError(null);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch (cause) {
      setCopied(false);
      setError(cause instanceof Error ? cause.message : 'Could not copy the address.');
    }
  }

  async function lock() {
    try {
      onLocked(await request({ type: 'lock' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not lock the wallet.');
    }
  }

  return (
    <section className="screen">
      <h1 className="screen__title">{account?.label ?? 'Wallet'}</h1>

      <div className="balance">
        {balanceError ? (
          <p className="balance__error">{balanceError}</p>
        ) : balance ? (
          <p className="balance__amount">
            {formatTokenAmount(balance.amount, ACTIVE_TOKEN.decimals)}
            <span className="balance__denom">{ACTIVE_TOKEN.displayDenom}</span>
          </p>
        ) : (
          <p className="balance__loading">Loading balance…</p>
        )}
      </div>

      {account ? (
        <button
          type="button"
          className="address"
          onClick={copyAddress}
          title={`${account.address}\nClick to copy`}
          aria-label={copied ? 'Address copied' : 'Copy address'}
        >
          <span className="address__value">{shortenAddress(account.address)}</span>
          <span className="address__action" aria-hidden="true">
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
      ) : (
        <p className="screen__body">No account yet.</p>
      )}

      {account && (
        <div className="actions">
          <button className="button button--secondary" type="button" onClick={onSend}>
            Send
          </button>
          <button className="button button--secondary" type="button" onClick={onReceive}>
            Receive
          </button>
        </div>
      )}

      {feeWarning && !feeWarningDismissed && (
        <FeeWarning reason={feeWarning} onDismiss={() => setFeeWarningDismissed(true)} />
      )}

      {switchingEnabled && (
        <TokenSwitcher
          tokens={tokens}
          activeDenom={activeDenom}
          onSwitch={(denom) => void switchToken(denom)}
          switching={switching}
        />
      )}

      {error && <p className="form__error">{error}</p>}

      <button className="button" type="button" onClick={lock}>
        Lock wallet
      </button>
      <button className="button button--link" type="button" onClick={onOpenSettings}>
        Settings
      </button>
    </section>
  );
}
