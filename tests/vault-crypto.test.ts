import { Secp256k1, Secp256k1Signature, sha256 } from '@cosmjs/crypto';
import { fromBase64 } from '@cosmjs/encoding';
import { makeSignBytes } from '@cosmjs/proto-signing';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptMnemonic, encryptVault, webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import {
  AES_GCM_PARAMS,
  PBKDF2_PARAMS,
  VAULT_VERSION,
  type EncryptedVault,
  type VaultAccount,
} from '../src/keyring/vault';
import { SIGN_REQUEST } from './support/services';

const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PASSWORD = 'correct horse battery staple';
const ACCOUNTS: VaultAccount[] = [
  { address: 'bze1qexampleaddr', hdPath: "m/44'/118'/0'/0/0", label: 'Account 1' },
];

describe('vault encryption at rest (BUS-17)', () => {
  let vault: EncryptedVault;

  beforeAll(async () => {
    vault = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS);
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

  it('matches the versioned schema: v1, pbkdf2 KDF, aes-256-gcm cipher', () => {
    expect(vault.version).toBe(VAULT_VERSION);
    expect(Object.keys(vault.kdf).sort()).toEqual(['algo', 'hash', 'iterations', 'salt']);
    expect(vault.kdf.algo).toBe('pbkdf2');
    expect(vault.kdf.hash).toBe(PBKDF2_PARAMS.hash);
    expect(vault.kdf.iterations).toBe(PBKDF2_PARAMS.iterations);
    expect(Object.keys(vault.cipher).sort()).toEqual(['algo', 'iv']);
    expect(vault.cipher.algo).toBe(AES_GCM_PARAMS.algo);
    // 16-byte salt → 24 base64 chars; 12-byte IV → 16 base64 chars.
    expect(vault.kdf.salt).toHaveLength(24);
    expect(vault.cipher.iv).toHaveLength(16);
    expect(vault.ciphertext.length).toBeGreaterThan(0);
  });

  it('uses a fresh random salt + IV on every encryption', async () => {
    const other = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS);
    expect(other.kdf.salt).not.toBe(vault.kdf.salt);
    expect(other.cipher.iv).not.toBe(vault.cipher.iv);
    expect(other.ciphertext).not.toBe(vault.ciphertext);
  });

  it('rejects a wrong password with a generic, non-secret error', async () => {
    await expect(decryptMnemonic(vault, 'wrong password')).rejects.toThrow('invalid password');
  });
});

describe('webCryptoVaultCrypto seam', () => {
  let vault: EncryptedVault;

  beforeAll(async () => {
    vault = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS);
  });

  it('decrypt proves the password and returns the real HD signer (BUS-51)', async () => {
    const signer = await webCryptoVaultCrypto.decrypt(vault, PASSWORD);
    const pubkey = await signer.getPublicKey();
    const { signed, signature } = await signer.sign(SIGN_REQUEST);

    // The signature verifies against the account's public key over the sign bytes.
    const valid = await Secp256k1.verifySignature(
      Secp256k1Signature.fromFixedLength(fromBase64(signature.signature)),
      sha256(makeSignBytes(signed)),
      pubkey,
    );
    expect(valid).toBe(true);
  });

  it('exposes no key material on the signer object — only its two methods', async () => {
    const signer = await webCryptoVaultCrypto.decrypt(vault, PASSWORD);
    expect(Object.keys(signer).sort()).toEqual(['getPublicKey', 'sign']);
    expect(JSON.stringify(signer)).not.toContain('legal');
  });

  it('decrypt rejects a wrong password (auth-tag failure)', async () => {
    await expect(webCryptoVaultCrypto.decrypt(vault, 'nope')).rejects.toThrow('invalid password');
  });
});

describe('vault format guard (BUS-41)', () => {
  let vault: EncryptedVault;

  beforeAll(async () => {
    vault = await encryptVault(MNEMONIC, PASSWORD, ACCOUNTS);
  });

  // Each case is a blob this v1 build must refuse to read rather than run the
  // wrong KDF/cipher on and misreport as a wrong password — even with the right
  // password.
  const unsupported: [string, (v: EncryptedVault) => unknown][] = [
    ['a newer vault version', (v) => ({ ...v, version: VAULT_VERSION + 1 })],
    ['a different KDF', (v) => ({ ...v, kdf: { ...v.kdf, algo: 'argon2id' } })],
    ['a different PBKDF2 hash', (v) => ({ ...v, kdf: { ...v.kdf, hash: 'SHA-1' } })],
    ['a different cipher', (v) => ({ ...v, cipher: { ...v.cipher, algo: 'aes-256-ctr' } })],
    ['a zero iteration count', (v) => ({ ...v, kdf: { ...v.kdf, iterations: 0 } })],
    ['a non-integer iteration count', (v) => ({ ...v, kdf: { ...v.kdf, iterations: 1.5 } })],
  ];

  it.each(unsupported)('rejects %s as an unsupported format', async (_label, mutate) => {
    const blob = mutate(vault) as EncryptedVault;
    await expect(decryptMnemonic(blob, PASSWORD)).rejects.toThrow('unsupported vault format');
    await expect(webCryptoVaultCrypto.decrypt(blob, PASSWORD)).rejects.toThrow(
      'unsupported vault format',
    );
  });
});
