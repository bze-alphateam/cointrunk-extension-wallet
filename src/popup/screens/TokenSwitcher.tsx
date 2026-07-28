/**
 * The network-style token switcher (BUS-37), shown on Home only when the user
 * has enabled switching in Settings (BUS-36).
 *
 * Presentational on purpose: it lists the account's held tokens and reports the
 * one the user picks via {@link TokenSwitcherProps.onSwitch}. The parent (Home)
 * owns the side effects a switch triggers — persisting the choice, re-skinning
 * the wallet, and re-checking fee eligibility — so this component stays a pure
 * function of its props and needs no message plumbing of its own.
 */

import type { HeldToken } from '../../keyring/messages';
import { formatTokenAmount } from '../../chain/token';

interface TokenSwitcherProps {
  /** The account's held tokens (denom + amount + identity). */
  readonly tokens: readonly HeldToken[];
  /** The currently-active token's denom, highlighted in the list. */
  readonly activeDenom: string | null;
  /** Called with the picked token's denom; a no-op for the already-active one. */
  readonly onSwitch: (denom: string) => void;
  /** True while a switch is being persisted — disables the list to avoid races. */
  readonly switching?: boolean;
}

export function TokenSwitcher({ tokens, activeDenom, onSwitch, switching }: TokenSwitcherProps) {
  if (tokens.length === 0) {
    return null;
  }

  return (
    <section className="switcher" aria-label="Switch active token">
      <p className="switcher__label">Active token</p>
      <ul className="switcher__list">
        {tokens.map((token) => {
          const isActive = token.denom === activeDenom;
          return (
            <li key={token.denom}>
              <button
                type="button"
                className={`switcher__item${isActive ? ' switcher__item--active' : ''}`}
                aria-current={isActive ? 'true' : undefined}
                disabled={switching || isActive}
                onClick={() => onSwitch(token.denom)}
              >
                <span className="switcher__symbol">{token.identity.symbol}</span>
                <span className="switcher__amount">
                  {formatTokenAmount(token.amount, token.identity.decimals)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
