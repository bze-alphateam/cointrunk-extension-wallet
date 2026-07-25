import { describe, expect, it } from 'vitest';
import { Bip39, EnglishMnemonic } from '@cosmjs/crypto';
import {
  DEFAULT_ACCOUNT_LABEL,
  DEFAULT_MNEMONIC_WORDS,
  deriveAccount,
  generateMnemonic,
  MNEMONIC_ENTROPY_BYTES,
} from '../src/keyring/account';
import { BZE_BECH32_PREFIX, BZE_HD_PATH } from '../src/chain/constants';

/**
 * A BIP39 test vector (all-zero entropy) — a known mnemonic with a known
 * derivation, so the address assertion below is a real regression guard on the
 * prefix + HD path rather than a self-fulfilling round-trip.
 */
const ZERO_ENTROPY_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

describe('generateMnemonic (BUS-15)', () => {
  it('produces a 24-word mnemonic', () => {
    expect(generateMnemonic().split(' ')).toHaveLength(DEFAULT_MNEMONIC_WORDS);
  });

  it('produces a valid BIP39 phrase (word list + checksum)', () => {
    // The EnglishMnemonic constructor throws unless every word is in the list
    // and the checksum bits are correct.
    expect(() => new EnglishMnemonic(generateMnemonic())).not.toThrow();
  });

  it('encodes 256 bits of entropy', () => {
    const entropy = Bip39.decode(new EnglishMnemonic(generateMnemonic()));
    expect(entropy).toHaveLength(MNEMONIC_ENTROPY_BYTES);
  });

  it('is different on every call (secure RNG, not a fixed seed)', () => {
    const mnemonics = new Set(Array.from({ length: 25 }, () => generateMnemonic()));
    expect(mnemonics.size).toBe(25);
  });
});

describe('deriveAccount (BUS-15)', () => {
  it('derives a bech32 BeeZee address on the confirmed prefix and HD path', async () => {
    const account = await deriveAccount(ZERO_ENTROPY_MNEMONIC);
    expect(account.address.startsWith(`${BZE_BECH32_PREFIX}1`)).toBe(true);
    expect(account.hdPath).toBe(BZE_HD_PATH);
    expect(account.label).toBe(DEFAULT_ACCOUNT_LABEL);
  });

  it('is deterministic for a given mnemonic', async () => {
    const [first, second] = await Promise.all([
      deriveAccount(ZERO_ENTROPY_MNEMONIC),
      deriveAccount(ZERO_ENTROPY_MNEMONIC),
    ]);
    expect(first.address).toBe(second.address);
  });

  it('derives the known address for the all-zero-entropy test vector', async () => {
    // This mnemonic on coin type 118 / m/44'/118'/0'/0/0 is the widely published
    // Cosmos test vector `cosmos1r5v5srda7xfth3hn2s26txvrcrntldjumt8mhl`. The
    // expectation below is the same public key re-encoded with the `bze` HRP, so
    // a regression in either the coin type or the prefix fails this test.
    const account = await deriveAccount(ZERO_ENTROPY_MNEMONIC);
    expect(account.address).toBe('bze1r5v5srda7xfth3hn2s26txvrcrntldjux0ts9g');
  });

  it('derives different addresses for different mnemonics', async () => {
    const [a, b] = await Promise.all([
      deriveAccount(generateMnemonic()),
      deriveAccount(generateMnemonic()),
    ]);
    expect(a.address).not.toBe(b.address);
  });

  it('returns only non-secret metadata — no key material', async () => {
    const account = await deriveAccount(ZERO_ENTROPY_MNEMONIC);
    expect(Object.keys(account).sort()).toEqual(['address', 'hdPath', 'label']);
    expect(JSON.stringify(account)).not.toContain('abandon');
  });

  it('honours a custom label', async () => {
    const account = await deriveAccount(ZERO_ENTROPY_MNEMONIC, 'Savings');
    expect(account.label).toBe('Savings');
  });
});
