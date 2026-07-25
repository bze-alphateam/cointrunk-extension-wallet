/**
 * The seam between the keyring (BUS-49) and the encryption routine (BUS-17).
 *
 * The keyring never does crypto itself — it holds an injected {@link VaultCrypto}
 * and calls {@link VaultCrypto.decrypt} to turn the persisted {@link EncryptedVault}
 * plus the user password into an in-memory {@link Signer}. This keeps the state
 * container testable; the concrete Argon2id + AES-256-GCM implementation lives
 * in `./vault-crypto` (`webCryptoVaultCrypto`) and is injected without the
 * keyring knowing any crypto details.
 */

import type { EncryptedVault } from './vault';

/** A signing request payload. Real fields (chain message, sign-doc) arrive in Epic 3. */
export interface SignRequest {
  readonly payload?: unknown;
}

/**
 * The decrypted, in-memory signing capability. Held by the keyring ONLY while
 * unlocked and dropped on lock / auto-lock / service-worker teardown. It wraps
 * the secret key material, which never leaves the background service worker.
 * The concrete implementation (real signing) lands in Epic 3.
 */
export interface Signer {
  sign(request: SignRequest): Promise<unknown>;
}

/**
 * Turns a persisted vault + password into an in-memory signer. Decryption proves
 * the password via the AES-GCM authentication tag and rejects on a wrong password
 * or tampered blob — there is no separate stored password hash.
 */
export interface VaultCrypto {
  decrypt(vault: EncryptedVault, password: string): Promise<Signer>;
}
