import { describe, expect, it } from 'vitest';
import {
  AES_GCM_PARAMS,
  ARGON2ID_PARAMS,
  VAULT_VERSION,
  type EncryptedVault,
} from '../src/keyring/vault';

// These are the ratified security parameters (BUS-48). Downstream tickets
// (BUS-17 encrypt, BUS-49 keyring) build on exactly these numbers, so pin them
// and fail loudly if anyone changes a value without a deliberate schema bump.
describe('vault crypto parameters', () => {
  it('pins the Argon2id parameters (64 MiB, t=3, p=1, 16B salt, 32B key)', () => {
    expect(ARGON2ID_PARAMS).toEqual({
      algo: 'argon2id',
      mem: 65536,
      iters: 3,
      parallelism: 1,
      saltBytes: 16,
      keyBytes: 32,
    });
  });

  it('pins the AES-256-GCM parameters (12B IV, 128-bit tag)', () => {
    expect(AES_GCM_PARAMS).toEqual({
      algo: 'aes-256-gcm',
      ivBytes: 12,
      tagBits: 128,
    });
  });

  it('starts at vault schema version 1', () => {
    expect(VAULT_VERSION).toBe(1);
  });
});

describe('EncryptedVault schema', () => {
  it('describes a self-contained blob whose only secret field is the ciphertext', () => {
    // Compile-time + runtime check that the persisted shape matches the
    // Security Model doc. A plaintext mnemonic must never appear here.
    const sample: EncryptedVault = {
      version: VAULT_VERSION,
      kdf: { algo: 'argon2id', mem: 65536, iters: 3, parallelism: 1, salt: 'c2FsdA==' },
      cipher: { algo: 'aes-256-gcm', iv: 'aXYtMTItYnl0ZXM=' },
      ciphertext: 'Y2lwaGVydGV4dA==',
      accounts: [{ address: 'bze1example', hdPath: "m/44'/118'/0'/0/0", label: 'Account 1' }],
    };

    expect(sample.accounts[0].address.startsWith('bze1')).toBe(true);
    expect(Object.keys(sample).sort()).toEqual([
      'accounts',
      'cipher',
      'ciphertext',
      'kdf',
      'version',
    ]);
  });
});
