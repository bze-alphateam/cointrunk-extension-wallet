/**
 * Encrypted-vault schema and ratified crypto parameters for CoinTrunk key
 * storage. This is the single source of truth that the key-management tickets
 * consume instead of re-deciding (BUS-48).
 *
 * The types mirror the "Stored blob shape" in the Security Model doc; the
 * parameter constants are the ratified PBKDF2 / AES-256-GCM values.
 *
 * Secret-handling invariants every consumer MUST uphold (see the Security Model
 * page on Confluence for the authoritative list):
 *  1. Only ciphertext is persisted — never a plaintext mnemonic or private key.
 *  2. Decrypted secrets live only in the background service-worker memory, only
 *     while unlocked; cleared on lock, auto-lock, and service-worker teardown.
 *  3. Secrets never cross into the popup, page, or content-script context, and
 *     are never logged, put in error messages, or placed in URLs.
 *  4. A correct password is proven by a successful AES-GCM decrypt (auth-tag
 *     check) — no separate password hash is ever stored.
 *
 * Scope (BUS-48): schema types + parameters only. The encrypt/decrypt routine
 * (BUS-17), keyring + storage layer (BUS-49), and generation/import
 * (BUS-15/16) live in their own tickets and import from here.
 */

/** Current on-disk vault schema version. Bump when the blob shape changes. */
export const VAULT_VERSION = 1;

/**
 * Ratified PBKDF2 parameters (BUS-48, revised after the Keplr/MetaMask prior-art
 * spike — see the Security Model "Prior-art review"). Runs on native WebCrypto
 * (`SubtleCrypto.deriveKey`), so key derivation is effectively instant and meets
 * the ≲ 1 s unlock budget, unlike the pure-JS Argon2id it replaces. 600k
 * iterations is the OWASP 2023 baseline for PBKDF2-HMAC-SHA256; it matches the
 * design MetaMask ships. The KDF choice is stored per-vault (`kdf.iterations`),
 * so this can be raised later without a format change.
 */
export const PBKDF2_PARAMS = {
  algo: 'pbkdf2',
  /** HMAC hash used by PBKDF2. */
  hash: 'SHA-256',
  /** Iteration count (OWASP 2023 baseline for PBKDF2-HMAC-SHA256). */
  iterations: 600000,
  /** Random salt length in bytes. */
  saltBytes: 16,
  /** Derived-key length in bytes (AES-256 key). */
  keyBytes: 32,
} as const;

/**
 * Ratified AES-256-GCM parameters (BUS-48). Native WebCrypto (`SubtleCrypto`):
 * a fresh random IV per encryption and a 128-bit authentication tag.
 */
export const AES_GCM_PARAMS = {
  algo: 'aes-256-gcm',
  /** Fresh random IV length in bytes. */
  ivBytes: 12,
  /** GCM authentication-tag length in bits. */
  tagBits: 128,
} as const;

/** KDF descriptor persisted in the vault (non-secret; makes the blob self-describing). */
export interface VaultKdf {
  algo: 'pbkdf2';
  /** HMAC hash used by PBKDF2. */
  hash: 'SHA-256';
  /** Iteration count. */
  iterations: number;
  /** Base64-encoded random salt. */
  salt: string;
}

/** Cipher descriptor persisted in the vault (non-secret). */
export interface VaultCipher {
  algo: 'aes-256-gcm';
  /** Base64-encoded random IV. */
  iv: string;
}

/** Non-secret, per-account metadata shown while the wallet is locked. */
export interface VaultAccount {
  /** Bech32 BeeZee address, e.g. `bze1…`. */
  address: string;
  /** BIP-44 HD derivation path used for this account. */
  hdPath: string;
  /** User-facing label. */
  label: string;
}

/**
 * The persisted vault: non-secret metadata plus the encrypted mnemonic. Only
 * `ciphertext` is sensitive (and it is encrypted). Salt, IV, and KDF params are
 * non-secret and stored alongside so the blob is self-describing and upgradable
 * via `version`.
 */
export interface EncryptedVault {
  version: number;
  kdf: VaultKdf;
  cipher: VaultCipher;
  /** Base64-encoded AES-256-GCM ciphertext of the BIP39 mnemonic. */
  ciphertext: string;
  accounts: VaultAccount[];
}
