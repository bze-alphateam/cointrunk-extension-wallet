/**
 * Wallet import from a user-supplied mnemonic (BUS-16), over the REAL WebCrypto
 * vault crypto — so this covers validation → derivation → encryption →
 * persistence exactly as the background does it.
 */

import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_MNEMONIC_WORD_COUNTS,
  assertValidMnemonic,
  deriveAccount,
  generateMnemonic,
  normalizeMnemonic,
} from '../src/keyring/account';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import { decryptMnemonic, webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import type { EncryptedVault } from '../src/keyring/vault';

const PASSWORD = 'correct horse battery staple';

/** Published BIP39 test vectors — valid checksums, so they import cleanly. */
const VALID_12 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const VALID_24 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

/** Same words as VALID_12 but with the last two swapped — word list OK, checksum not. */
const BAD_CHECKSUM = 'legal winner thank year wave sausage worth useful legal winner yellow thank';

class MemoryStore implements VaultStore {
  vault: EncryptedVault | null = null;
  load = async (): Promise<EncryptedVault | null> => this.vault;
  save = async (vault: EncryptedVault): Promise<void> => {
    this.vault = sanitizeVault(vault);
  };
  clear = async (): Promise<void> => {
    this.vault = null;
  };
}

function newKeyring() {
  const store = new MemoryStore();
  return { store, keyring: new Keyring(store, webCryptoVaultCrypto) };
}

describe('normalizeMnemonic (BUS-16)', () => {
  it('collapses padding, newlines and repeated spaces from a paste', () => {
    expect(normalizeMnemonic('  legal   winner\nthank\tyear  ')).toBe('legal winner thank year');
  });

  it('lowercases, so a phrase copied with capitals still validates', () => {
    expect(normalizeMnemonic('Legal WINNER Thank')).toBe('legal winner thank');
  });

  it('maps an empty or whitespace-only input to the empty string', () => {
    expect(normalizeMnemonic('   \n ')).toBe('');
  });

  it('leaves an already-clean phrase untouched', () => {
    expect(normalizeMnemonic(VALID_12)).toBe(VALID_12);
  });
});

describe('assertValidMnemonic (BUS-16)', () => {
  it.each(ACCEPTED_MNEMONIC_WORD_COUNTS)('accepts a valid %i-word phrase', (count) => {
    const mnemonic = count === 12 ? VALID_12 : VALID_24;
    expect(mnemonic.split(' ')).toHaveLength(count);
    expect(() => assertValidMnemonic(mnemonic)).not.toThrow();
  });

  it('rejects a wrong word count, naming the accepted counts and what it got', () => {
    expect(() => assertValidMnemonic('legal winner thank')).toThrow(
      'recovery phrase must be 12 or 24 words (got 3)',
    );
  });

  it('rejects an empty phrase', () => {
    expect(() => assertValidMnemonic('')).toThrow('must be 12 or 24 words (got 0)');
  });

  it('rejects a 15-word BIP39 phrase — valid BIP39, but not a count we accept', () => {
    const fifteen = `${VALID_12} legal winner thank`;
    expect(() => assertValidMnemonic(fifteen)).toThrow('must be 12 or 24 words (got 15)');
  });

  it('rejects an off-word-list word by position', () => {
    const words = VALID_12.split(' ');
    words[4] = 'notaword';
    expect(() => assertValidMnemonic(words.join(' '))).toThrow(
      'word 5 is not in the BIP39 English word list',
    );
  });

  it('rejects a bad checksum with a distinct, actionable message', () => {
    expect(() => assertValidMnemonic(BAD_CHECKSUM)).toThrow(
      'recovery phrase checksum is invalid — check for mistyped or swapped words',
    );
  });

  it('never echoes any mnemonic word back in an error message', () => {
    const words = VALID_12.split(' ');
    words[4] = 'notaword';
    const cases = ['legal winner thank', words.join(' '), BAD_CHECKSUM];

    for (const input of cases) {
      let message = '';
      try {
        assertValidMnemonic(input);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      // Not one of the user's words appears in what we would show or log.
      for (const word of new Set(input.split(' '))) {
        expect(message.split(/\W+/u)).not.toContain(word);
      }
    }
  });
});

describe('keyring.importAccount (BUS-16)', () => {
  it('derives the address that belongs to the imported phrase', async () => {
    const { keyring } = newKeyring();
    const expected = await deriveAccount(VALID_24);

    const state = await keyring.importAccount(VALID_24, PASSWORD);
    expect(state.accounts[0]?.address).toBe(expected.address);
    expect(state.status).toBe('unlocked');
  });

  it('round-trips a generated wallet: create elsewhere, import here, same address', async () => {
    const mnemonic = generateMnemonic();
    const { keyring } = newKeyring();

    const state = await keyring.importAccount(mnemonic, PASSWORD);
    expect(state.accounts[0]?.address).toBe((await deriveAccount(mnemonic)).address);
  });

  it('imports a messily-pasted phrase (padding, newlines, capitals)', async () => {
    const { keyring } = newKeyring();
    const messy = `  Legal  Winner\nthank year wave sausage worth useful legal winner thank YELLOW `;

    const state = await keyring.importAccount(messy, PASSWORD);
    expect(state.accounts[0]?.address).toBe((await deriveAccount(VALID_12)).address);
  });

  it('accepts both 12- and 24-word phrases', async () => {
    const twelve = await newKeyring().keyring.importAccount(VALID_12, PASSWORD);
    const twentyFour = await newKeyring().keyring.importAccount(VALID_24, PASSWORD);

    expect(twelve.accounts[0]?.address).toBeTruthy();
    expect(twentyFour.accounts[0]?.address).toBeTruthy();
    expect(twelve.accounts[0]?.address).not.toBe(twentyFour.accounts[0]?.address);
  });

  it('persists only ciphertext — the imported phrase never reaches storage', async () => {
    const { store, keyring } = newKeyring();
    await keyring.importAccount(VALID_24, PASSWORD);

    const persisted = JSON.stringify(store.vault);
    expect(persisted).not.toContain(VALID_24);
    expect(persisted).not.toContain(PASSWORD);
    expect(persisted).not.toContain('abandon');
    expect(Object.keys(store.vault ?? {}).sort()).toEqual([
      'accounts',
      'cipher',
      'ciphertext',
      'kdf',
      'version',
    ]);
  });

  it('stores the NORMALISED phrase, so unlocking recovers a clean mnemonic', async () => {
    const { store, keyring } = newKeyring();
    await keyring.importAccount(
      `  LEGAL winner\n thank year wave sausage worth useful legal winner thank yellow  `,
      PASSWORD,
    );

    expect(await decryptMnemonic(store.vault!, PASSWORD)).toBe(VALID_12);
  });

  it('writes nothing when the phrase is invalid', async () => {
    const { store, keyring } = newKeyring();
    await expect(keyring.importAccount(BAD_CHECKSUM, PASSWORD)).rejects.toThrow('checksum');

    expect(store.vault).toBeNull();
    expect((await keyring.getState()).status).toBe('uninitialized');
  });

  it('refuses to overwrite an existing wallet', async () => {
    const { keyring } = newKeyring();
    await keyring.importAccount(VALID_12, PASSWORD);
    await expect(keyring.importAccount(VALID_24, PASSWORD)).rejects.toThrow(
      'a wallet already exists',
    );
  });

  it('relocks on a simulated service-worker restart and reopens with the password', async () => {
    const { store, keyring } = newKeyring();
    const imported = await keyring.importAccount(VALID_24, PASSWORD);

    const respawned = new Keyring(store, webCryptoVaultCrypto);
    expect((await respawned.getState()).status).toBe('locked');
    expect((await respawned.unlock(PASSWORD)).accounts).toEqual(imported.accounts);
  });
});

describe('importAccount over the message API (BUS-16)', () => {
  it('answers with non-secret state only — no mnemonic comes back', async () => {
    const { keyring } = newKeyring();
    const response = await handleKeyringRequest(keyring, {
      type: 'importAccount',
      mnemonic: VALID_24,
      password: PASSWORD,
    });

    expect(response.ok).toBe(true);
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('abandon');
    expect(serialized).not.toContain('mnemonic');
  });

  it('surfaces a validation failure as a specific, secret-free error response', async () => {
    const { keyring } = newKeyring();
    expect(
      await handleKeyringRequest(keyring, {
        type: 'importAccount',
        mnemonic: BAD_CHECKSUM,
        password: PASSWORD,
      }),
    ).toEqual({
      ok: false,
      error: 'recovery phrase checksum is invalid — check for mistyped or swapped words',
    });
  });
});
