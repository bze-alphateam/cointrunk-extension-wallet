/**
 * Encryption at rest for the vault (BUS-17): the concrete {@link VaultCrypto}
 * that turns a BIP39 mnemonic into the persisted {@link EncryptedVault} and back.
 *
 * Scheme (ratified in {@link ./vault} and the Security Model doc):
 *  - PBKDF2-HMAC-SHA256 stretches the user password into a 256-bit AES key,
 *    entirely on native WebCrypto (`SubtleCrypto`) — no third-party crypto lib
 *    and no WASM, so derivation is fast enough for the unlock-latency budget.
 *  - AES-256-GCM (also WebCrypto) encrypts the mnemonic under that key with a
 *    fresh 12-byte IV and a 128-bit authentication tag.
 *
 * Secret-handling invariants (see {@link ./vault}):
 *  1. Only ciphertext + non-secret metadata (salt, IV, KDF params, accounts) is
 *     ever persisted — never the plaintext mnemonic or derived key.
 *  2. The plaintext mnemonic exists only transiently in service-worker memory
 *     during an encrypt/decrypt call; the derived key is a non-extractable
 *     `CryptoKey` that never leaves WebCrypto.
 *  3. A correct password is proven solely by a successful AES-GCM auth-tag check
 *     inside {@link decryptMnemonic} — no separate password hash is stored.
 */

import type { Signer, VaultCrypto } from './crypto';
import {
  AES_GCM_PARAMS,
  PBKDF2_PARAMS,
  VAULT_VERSION,
  type EncryptedVault,
  type VaultAccount,
} from './vault';

/** PBKDF2 cost parameters as re-derived from a persisted vault. */
interface KdfParams {
  iterations: number;
  hash: string;
}

// --- byte / base64 helpers --------------------------------------------------
// Base64 (not hex) matches the vault schema; `btoa`/`atob` exist in both the
// service worker and the test (Node) runtime, so no `Buffer` dependency.

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decode base64 into a fresh, `ArrayBuffer`-backed view (a valid `BufferSource`). */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Cryptographically-random bytes in a fresh, `ArrayBuffer`-backed view. */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Copy `bytes` into a fresh `ArrayBuffer`-backed view. WebCrypto's `BufferSource`
 * requires an `ArrayBuffer` backing, whereas `TextEncoder` returns the wider
 * `Uint8Array<ArrayBufferLike>`; this normalises it.
 */
function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

// --- core crypto ------------------------------------------------------------

/**
 * PBKDF2(password, salt) → a non-extractable AES-256-GCM `CryptoKey`, entirely
 * inside native WebCrypto. The derived key bytes are never exposed to JS.
 */
async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  kdf: KdfParams,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBufferSource(salt), iterations: kdf.iterations, hash: kdf.hash },
    baseKey,
    { name: 'AES-GCM', length: PBKDF2_PARAMS.keyBytes * 8 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const gcmParams = (iv: Uint8Array<ArrayBuffer>): AesGcmParams => ({
  name: 'AES-GCM',
  iv,
  tagLength: AES_GCM_PARAMS.tagBits,
});

/**
 * Encrypt a mnemonic into a fresh vault: derive a key from `password` under a
 * random salt, AES-256-GCM the mnemonic under a random IV, and assemble the
 * versioned blob. `accounts` is copied field-by-field so only non-secret
 * metadata is carried. The returned vault is safe to persist as-is.
 */
export async function encryptVault(
  mnemonic: string,
  password: string,
  accounts: readonly VaultAccount[],
): Promise<EncryptedVault> {
  const salt = randomBytes(PBKDF2_PARAMS.saltBytes);
  const iv = randomBytes(AES_GCM_PARAMS.ivBytes);

  const key = await deriveAesKey(password, salt, PBKDF2_PARAMS);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      gcmParams(iv),
      key,
      toBufferSource(new TextEncoder().encode(mnemonic)),
    ),
  );

  return {
    version: VAULT_VERSION,
    kdf: {
      algo: PBKDF2_PARAMS.algo,
      hash: PBKDF2_PARAMS.hash,
      iterations: PBKDF2_PARAMS.iterations,
      salt: bytesToBase64(salt),
    },
    cipher: {
      algo: AES_GCM_PARAMS.algo,
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(ciphertext),
    accounts: accounts.map((account) => ({
      address: account.address,
      hdPath: account.hdPath,
      label: account.label,
    })),
  };
}

/**
 * Recover the mnemonic from a vault using `password`. Re-derives the key from
 * the persisted salt + KDF params and AES-GCM-decrypts; the GCM auth-tag check
 * is what proves the password. A wrong password (or tampered blob) makes
 * WebCrypto reject — surfaced here as a generic, non-secret `invalid password`
 * so no detail about the failure leaks.
 */
export async function decryptMnemonic(vault: EncryptedVault, password: string): Promise<string> {
  const key = await deriveAesKey(password, base64ToBytes(vault.kdf.salt), {
    iterations: vault.kdf.iterations,
    hash: vault.kdf.hash,
  });

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      gcmParams(base64ToBytes(vault.cipher.iv)),
      key,
      base64ToBytes(vault.ciphertext),
    );
  } catch {
    throw new Error('invalid password');
  }
  return new TextDecoder().decode(plaintext);
}

/**
 * Placeholder signing capability held while unlocked. In BUS-17 the vault
 * decrypts successfully — proving the password and flipping the keyring to
 * `unlocked` — but signing itself is Epic 3. Epic 3 replaces this with a signer
 * that retains the recovered seed and derives keys from it; retaining the seed
 * now would keep an unusable secret in memory for no benefit.
 */
const unimplementedSigner: Signer = {
  sign() {
    return Promise.reject(new Error('signing not implemented yet (Epic 3)'));
  },
};

/**
 * The concrete {@link VaultCrypto} the keyring is wired with (replacing the
 * BUS-49 `unavailableCrypto` stub). `decrypt` recovers the mnemonic — which
 * proves the password via the GCM auth tag — and returns the in-memory signer.
 */
export const webCryptoVaultCrypto: VaultCrypto = {
  async decrypt(vault: EncryptedVault, password: string): Promise<Signer> {
    await decryptMnemonic(vault, password);
    return unimplementedSigner;
  },
};
