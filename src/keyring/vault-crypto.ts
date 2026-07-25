/**
 * Encryption at rest for the vault (BUS-17): the concrete {@link VaultCrypto}
 * that turns a BIP39 mnemonic into the persisted {@link EncryptedVault} and back.
 *
 * Scheme (ratified in {@link ./vault} and the Security Model doc):
 *  - Argon2id stretches the user password into a 32-byte key (via `@noble/hashes`,
 *    the audited pure-JS implementation — no native/WASM dependency).
 *  - AES-256-GCM (native WebCrypto `SubtleCrypto`) encrypts the mnemonic under
 *    that key with a fresh 12-byte IV and a 128-bit authentication tag.
 *
 * Secret-handling invariants (see {@link ./vault}):
 *  1. Only ciphertext + non-secret metadata (salt, IV, KDF params, accounts) is
 *     ever persisted — never the plaintext mnemonic or derived key.
 *  2. The plaintext mnemonic and derived key exist only transiently in
 *     service-worker memory during an encrypt/decrypt call.
 *  3. A correct password is proven solely by a successful AES-GCM auth-tag check
 *     inside {@link decryptMnemonic} — no separate password hash is stored.
 */

import { argon2id } from '@noble/hashes/argon2.js';

import type { Signer, VaultCrypto } from './crypto';
import {
  AES_GCM_PARAMS,
  ARGON2ID_PARAMS,
  VAULT_VERSION,
  type EncryptedVault,
  type VaultAccount,
} from './vault';

/** Argon2id cost parameters as they travel to `@noble/hashes` (`m`/`t`/`p`). */
interface KdfCost {
  mem: number;
  iters: number;
  parallelism: number;
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
 * requires an `ArrayBuffer` backing, whereas `TextEncoder` / `@noble/hashes`
 * return the wider `Uint8Array<ArrayBufferLike>`; this normalises them.
 */
function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

// --- core crypto ------------------------------------------------------------

/**
 * Argon2id(password, salt) → 32-byte AES key. Runs synchronously; called only
 * on the rare, user-initiated encrypt/unlock paths, never in a hot loop.
 */
function deriveKey(password: string, salt: Uint8Array, cost: KdfCost): Uint8Array {
  return argon2id(new TextEncoder().encode(password), salt, {
    m: cost.mem,
    t: cost.iters,
    p: cost.parallelism,
    dkLen: ARGON2ID_PARAMS.keyBytes,
  });
}

function importAesKey(keyBytes: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toBufferSource(keyBytes), { name: 'AES-GCM' }, false, [
    usage,
  ]);
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
 *
 * `kdfCost` defaults to the ratified {@link ARGON2ID_PARAMS} and is what
 * production always uses. It is a parameter (not a hardcoded constant) because
 * the vault is self-describing — the chosen cost is stored in `kdf`, so
 * {@link decryptMnemonic} re-derives with the same cost regardless. Overriding
 * it (e.g. to a cheap cost in unit tests) exercises the identical code path.
 */
export async function encryptVault(
  mnemonic: string,
  password: string,
  accounts: readonly VaultAccount[],
  kdfCost: KdfCost = ARGON2ID_PARAMS,
): Promise<EncryptedVault> {
  const salt = randomBytes(ARGON2ID_PARAMS.saltBytes);
  const iv = randomBytes(AES_GCM_PARAMS.ivBytes);

  const key = await importAesKey(deriveKey(password, salt, kdfCost), 'encrypt');
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
      algo: ARGON2ID_PARAMS.algo,
      mem: kdfCost.mem,
      iters: kdfCost.iters,
      parallelism: kdfCost.parallelism,
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
  const key = await importAesKey(
    deriveKey(password, base64ToBytes(vault.kdf.salt), {
      mem: vault.kdf.mem,
      iters: vault.kdf.iters,
      parallelism: vault.kdf.parallelism,
    }),
    'decrypt',
  );

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
