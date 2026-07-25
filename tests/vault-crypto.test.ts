import { beforeAll, describe, expect, it } from 'vitest';
import { decryptMnemonic, encryptVault, webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import {
  AES_GCM_PARAMS,
  ARGON2ID_PARAMS,
  VAULT_VERSION,
  type EncryptedVault,
  type VaultAccount,
} from '../src/keyring/vault';

const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PASSWORD = 'correct horse battery staple';
const ACCOUNTS: VaultAccount[] = [
  { address: 'bze1qexampleaddr', hdPath: "m/44'/118'/0'/0/0", label: 'Account 1' },
];

// A deliberately cheap KDF cost for the fast tests. The vault records whatever
// cost was used, so decrypt re-derives correctly; production uses the ratified
// ARGON2ID_PARAMS — exercised end-to-end in the "default params" test below.
const FAST_KDF = { mem: 256, iters: 1, parallelism: 1 };

describe('vault encryption at rest (BUS-17)', () => {
  let vault: EncryptedVault;

  beforeAll(async () => {
    vault = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS, FAST_KDF);
  });

  it('round-trips the mnemonic with the correct password', async () => {
    expect(await decryptMnemonic(vault, PASSWORD)).toBe(MNEMONIC);
  });

  it('carries the non-secret account metadata alongside the ciphertext', () => {
    expect(vault.accounts).toEqual(ACCOUNTS);
  });

  it('persists only ciphertext + non-secret metadata — never the plaintext', () => {
    // Exactly the whitelisted persisted fields (matches the Security Model schema).
    expect(Object.keys(vault).sort()).toEqual([
      'accounts',
      'cipher',
      'ciphertext',
      'kdf',
      'version',
    ]);
    // The plaintext mnemonic / password never appear anywhere in the blob.
    const serialized = JSON.stringify(vault);
    expect(serialized).not.toContain(MNEMONIC);
    expect(serialized).not.toContain(PASSWORD);
  });

  it('matches the versioned schema: v1, argon2id KDF, aes-256-gcm cipher', () => {
    expect(vault.version).toBe(VAULT_VERSION);
    expect(Object.keys(vault.kdf).sort()).toEqual(['algo', 'iters', 'mem', 'parallelism', 'salt']);
    expect(vault.kdf.algo).toBe('argon2id');
    expect(Object.keys(vault.cipher).sort()).toEqual(['algo', 'iv']);
    expect(vault.cipher.algo).toBe('aes-256-gcm');
    // 16-byte salt → 24 base64 chars; 12-byte IV → 16 base64 chars.
    expect(vault.kdf.salt).toHaveLength(24);
    expect(vault.cipher.iv).toHaveLength(16);
    expect(vault.ciphertext.length).toBeGreaterThan(0);
  });

  it('uses a fresh random salt + IV on every encryption', async () => {
    const other = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS, FAST_KDF);
    expect(other.kdf.salt).not.toBe(vault.kdf.salt);
    expect(other.cipher.iv).not.toBe(vault.cipher.iv);
    expect(other.ciphertext).not.toBe(vault.ciphertext);
  });

  it('rejects a wrong password with a generic, non-secret error', async () => {
    await expect(decryptMnemonic(vault, 'wrong password')).rejects.toThrow('invalid password');
  });

  it('encrypts with the ratified default KDF params when none are given', async () => {
    const prod = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS);
    expect(prod.kdf.mem).toBe(ARGON2ID_PARAMS.mem);
    expect(prod.kdf.iters).toBe(ARGON2ID_PARAMS.iters);
    expect(prod.kdf.parallelism).toBe(ARGON2ID_PARAMS.parallelism);
    expect(prod.cipher.algo).toBe(AES_GCM_PARAMS.algo);
    // Full-strength round-trip proves the ratified params actually work.
    expect(await decryptMnemonic(prod, PASSWORD)).toBe(MNEMONIC);
  }, 30000);
});

describe('webCryptoVaultCrypto seam', () => {
  let vault: EncryptedVault;

  beforeAll(async () => {
    vault = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS, FAST_KDF);
  });

  it('decrypt proves the password and returns an in-memory signer', async () => {
    const signer = await webCryptoVaultCrypto.decrypt(vault, PASSWORD);
    expect(typeof signer.sign).toBe('function');
    // Signing itself is Epic 3; the signer rejects until then.
    await expect(signer.sign({ payload: 'x' })).rejects.toThrow('Epic 3');
  });

  it('decrypt rejects a wrong password (auth-tag failure)', async () => {
    await expect(webCryptoVaultCrypto.decrypt(vault, 'nope')).rejects.toThrow('invalid password');
  });
});
