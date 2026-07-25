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

import { deriveAccount, generateMnemonic } from './account';
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

/**
 * Result of creating a brand-new wallet (BUS-15).
 *
 * This is the ONE response in the whole message API that carries secret
 * material: the freshly generated mnemonic, so the popup can render the
 * write-it-down backup screen. It is deliberate and bounded:
 *  - it is returned exactly once, as the direct reply to `createAccount`;
 *  - there is no request that re-reads the mnemonic afterwards, so a popup that
 *    discards it cannot get it back;
 *  - it goes only to the extension's own popup — never to a content script or
 *    page, which is the boundary the Security Model's threat model draws.
 * A wallet cannot be non-custodial without showing the user their phrase once;
 * see the security note in the PR/ticket.
 */
export interface CreatedAccount {
  /** The new mnemonic, for one-time display on the backup screen. */
  readonly mnemonic: string;
  /** Non-secret state after creation (the wallet is left unlocked). */
  readonly state: KeyringState;
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
   * Create a brand-new wallet (BUS-15): generate a 24-word BIP39 mnemonic,
   * derive the BeeZee account from it, encrypt the mnemonic under `password`,
   * and persist only the resulting blob. The keyring is left unlocked.
   *
   * The plaintext mnemonic exists only as a local in this method and in the
   * returned {@link CreatedAccount}; it is never written to storage (the store
   * only ever sees the encrypted vault) and never logged.
   *
   * Refuses if a wallet already exists — v1 holds a single account, and silently
   * replacing a vault would destroy the user's funds.
   */
  async createAccount(password: string, label?: string): Promise<CreatedAccount> {
    await this.assertNoExistingWallet();

    const mnemonic = generateMnemonic();
    const state = await this.persistNewWallet(mnemonic, password, label);
    return { mnemonic, state };
  }

  /** Guard shared by every wallet-setup path: v1 refuses to overwrite a vault. */
  private async assertNoExistingWallet(): Promise<void> {
    if (await this.store.load()) {
      throw new Error('a wallet already exists');
    }
  }

  /**
   * Encrypt `mnemonic`, persist the vault, and unlock the keyring — the shared
   * tail of every wallet-setup path. Unlocking goes through the normal
   * `decrypt` path so creation exercises exactly the same code an unlock does,
   * proving the blob is readable back before the user is told they're set up.
   */
  private async persistNewWallet(
    mnemonic: string,
    password: string,
    label?: string,
  ): Promise<KeyringState> {
    const account = await deriveAccount(mnemonic, label);
    const vault = await this.crypto.encrypt(mnemonic, password, [account]);
    await this.store.save(vault);

    this.signer = await this.crypto.decrypt(vault, password);
    return { status: 'unlocked', accounts: vault.accounts };
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
