/**
 * The keyring: the background service worker's single source of truth for wallet
 * state and the sole holder of decrypted key material (BUS-49).
 *
 * State model — the status is DERIVED, never separately persisted:
 *  - `uninitialized` — no vault in storage (wallet not set up yet).
 *  - `locked`        — a vault exists but there is no in-memory signer.
 *  - `unlocked`      — a signer is held in memory (only reachable via `unlock`).
 *
 * Because status derives from the presence of the in-memory `signer`, MV3
 * lifecycle handling is automatic: when the service worker is torn down the
 * signer (and all secret material) is gone, and a freshly respawned keyring
 * reports `locked` again from the persisted, non-secret metadata. No secret ever
 * survives in storage. See the vault schema and the Security Model doc.
 */

import type { SignRequest, Signer, VaultCrypto } from './crypto';
import type { VaultStore } from './storage';
import type { VaultAccount } from './vault';

export type KeyringStatus = 'uninitialized' | 'locked' | 'unlocked';

/**
 * Non-secret snapshot handed to the popup. Contains account metadata
 * (address / label / HD path) and the lock status — never key material.
 */
export interface KeyringState {
  readonly status: KeyringStatus;
  readonly accounts: readonly VaultAccount[];
}

export class Keyring {
  /**
   * The decrypted signer. Present ONLY while unlocked; held in service-worker
   * memory and never persisted, logged, or sent across the popup boundary.
   * Cleared on `lock()` and gone implicitly on service-worker teardown.
   */
  private signer: Signer | null = null;

  constructor(
    private readonly store: VaultStore,
    private readonly crypto: VaultCrypto,
  ) {}

  /**
   * Current lock status plus the non-secret account metadata. Accounts always
   * come from the persisted vault, so address/label are visible while locked.
   */
  async getState(): Promise<KeyringState> {
    const vault = await this.store.load();
    if (!vault) {
      return { status: 'uninitialized', accounts: [] };
    }
    return {
      status: this.signer ? 'unlocked' : 'locked',
      accounts: vault.accounts,
    };
  }

  /**
   * Decrypt the vault with the user password and hold the resulting signer in
   * memory. The password is proven by the AES-GCM auth tag inside `decrypt`,
   * which rejects on a wrong password — leaving the keyring locked.
   */
  async unlock(password: string): Promise<KeyringState> {
    const vault = await this.store.load();
    if (!vault) {
      throw new Error('no wallet to unlock');
    }
    // The plaintext signer exists only here, in service-worker memory.
    this.signer = await this.crypto.decrypt(vault, password);
    return { status: 'unlocked', accounts: vault.accounts };
  }

  /** Drop the in-memory signer and return to the locked state. */
  async lock(): Promise<KeyringState> {
    this.signer = null;
    return this.getState();
  }

  /** Non-secret account metadata; available whether locked or unlocked. */
  async getAccounts(): Promise<readonly VaultAccount[]> {
    const { accounts } = await this.getState();
    return accounts;
  }

  /**
   * Sign a payload. Gated on unlock: throws while locked so no operation needing
   * key material can proceed. The actual signing is implemented in Epic 3 by the
   * concrete {@link Signer}.
   */
  async sign(request: SignRequest): Promise<unknown> {
    if (!this.signer) {
      throw new Error('locked');
    }
    return this.signer.sign(request);
  }
}
