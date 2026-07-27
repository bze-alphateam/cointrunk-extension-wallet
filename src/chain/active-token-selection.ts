/**
 * Choosing the wallet's sticky active token (BUS-34).
 *
 * The active token owns the wallet's skin (see the UX doc "Choosing the active
 * token"). It is picked with no user effort and then left alone:
 *
 *  - **Sticky wins.** Once a denom has been chosen (persisted in
 *    {@link ../keyring/settings.WalletSettings.activeTokenDenom}), it stays the
 *    active token — it never changes on its own, even if that balance later
 *    drops to zero. Only a deliberate user switch (Epic 6) replaces it.
 *  - **Otherwise, first received.** With nothing chosen yet, the first token the
 *    account is seen holding becomes the active token.
 *  - **Otherwise, none.** A brand-new account holding nothing has no active
 *    token (`null`); the UI renders the neutral default skin plus the address.
 *
 * This is a pure decision — no chain reads, no storage — so it is trivially
 * unit-tested; the caller supplies the stored denom and the held denoms, and
 * persists the result when it changes.
 *
 * On "first received": the bank module exposes only *current* balances, not
 * receive timestamps, so "first received" is approximated as the first denom in
 * the held list the caller passes (the account's current balances). The choice
 * is captured once and then made sticky, so ordering only matters on the single
 * observation that first finds the account funded.
 */

/**
 * The sticky active-token denom given the currently-stored choice and the denoms
 * the account holds. Returns the stored denom if there is one, else the first
 * held denom, else `null` (no token yet).
 *
 * @param stored the persisted active-token denom, or `null` if none chosen yet
 * @param heldDenoms the account's held denoms, in balance order (may be empty)
 */
export function selectStickyActiveDenom(
  stored: string | null,
  heldDenoms: readonly string[],
): string | null {
  if (stored !== null && stored.length > 0) {
    return stored;
  }
  return heldDenoms.length > 0 ? heldDenoms[0]! : null;
}

/** The resolved active token reported to the popup: just its denom, or `null`. */
export interface ActiveTokenState {
  /** The active token's base denom, or `null` when the account holds nothing. */
  readonly denom: string | null;
}
