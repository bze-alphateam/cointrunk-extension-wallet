/**
 * The seam between the keyring (BUS-49) and the encryption routine (BUS-17).
 *
 * The keyring never does crypto itself — it holds an injected {@link VaultCrypto}
 * and calls {@link VaultCrypto.decrypt} to turn the persisted {@link EncryptedVault}
 * plus the user password into an in-memory {@link Signer}. This keeps the state
 * container testable; the concrete PBKDF2 + AES-256-GCM implementation lives
 * in `./vault-crypto` (`webCryptoVaultCrypto`) and is injected without the
 * keyring knowing any crypto details.
 */

import type { DirectSignResponse } from '@cosmjs/proto-signing';
import type { SignDoc } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import type { EncryptedVault, VaultAccount } from './vault';

/** A `SIGN_MODE_DIRECT` signing request: the sign doc to sign (BUS-51). */
export interface SignRequest {
  readonly signDoc: SignDoc;
}

/**
 * The decrypted, in-memory signing capability. Held by the keyring ONLY while
 * unlocked and dropped on lock / auto-lock / service-worker teardown. It wraps
 * the secret key material, which never leaves the background service worker:
 * callers get a public key and signatures, never the key or the mnemonic.
 */
export interface Signer {
  /** The account's compressed secp256k1 public key (33 bytes), for the tx's signer info. */
  getPublicKey(): Promise<Uint8Array>;
  /** Sign a sign doc for the wallet's account. */
  sign(request: SignRequest): Promise<DirectSignResponse>;
}

/**
 * The two directions of vault encryption, injected into the keyring so it never
 * does crypto itself.
 *
 * `encrypt` turns a freshly generated or imported mnemonic into the persistable
 * blob (BUS-15 / BUS-16 account setup); `decrypt` turns a persisted vault back
 * into an in-memory signer. Decryption proves the password via the AES-GCM
 * authentication tag and rejects on a wrong password or tampered blob — there is
 * no separate stored password hash.
 */
export interface VaultCrypto {
  encrypt(
    mnemonic: string,
    password: string,
    accounts: readonly VaultAccount[],
  ): Promise<EncryptedVault>;
  decrypt(vault: EncryptedVault, password: string): Promise<Signer>;
}
