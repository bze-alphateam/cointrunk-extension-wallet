/**
 * End-to-end wallet creation (BUS-15): keyring.createAccount over the REAL
 * WebCrypto vault crypto, so this exercises generation → derivation →
 * encryption → persistence → unlock exactly as the background does.
 */

import { describe, expect, it } from 'vitest';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { services } from './support/services';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import { decryptMnemonic, webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import type { EncryptedVault } from '../src/keyring/vault';
import { BZE_BECH32_PREFIX, BZE_HD_PATH } from '../src/chain/constants';
import { DEFAULT_MNEMONIC_WORDS } from '../src/keyring/account';

const PASSWORD = 'correct horse battery staple';

/** In-memory store that sanitises on save, exactly like the chrome.storage one. */
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

describe('keyring.createAccount (BUS-15)', () => {
  it('returns a 24-word mnemonic and leaves the wallet unlocked', async () => {
    const { keyring } = newKeyring();
    const created = await keyring.createAccount(PASSWORD);

    expect(created.mnemonic.split(' ')).toHaveLength(DEFAULT_MNEMONIC_WORDS);
    expect(created.state.status).toBe('unlocked');
    expect((await keyring.getState()).status).toBe('unlocked');
  });

  it('derives and reports the BeeZee account (address, HD path, label)', async () => {
    const { keyring } = newKeyring();
    const [account] = (await keyring.createAccount(PASSWORD)).state.accounts;

    expect(account?.address.startsWith(`${BZE_BECH32_PREFIX}1`)).toBe(true);
    expect(account?.hdPath).toBe(BZE_HD_PATH);
    expect(account?.label).toBe('Account 1');
  });

  it('persists only the encrypted vault — the mnemonic never reaches storage', async () => {
    const { store, keyring } = newKeyring();
    const { mnemonic } = await keyring.createAccount(PASSWORD);

    const persisted = JSON.stringify(store.vault);
    expect(persisted).not.toContain(mnemonic);
    expect(persisted).not.toContain(PASSWORD);
    // Not even a single mnemonic word survives in the blob. Caveat: a handful of
    // BIP39 words are also (prefixes of) the vault's own JSON field names —
    // "version", "salt", "account"→"accounts", "address", "label" — so a `"word`
    // match there is the field name, always present and legitimate, not a leak.
    // Skip words that prefix a field name (a real leak of such a word is
    // indistinguishable from the field anyway, and the whitelist assertion below
    // already proves no stray field rode along). Any other match is a real leak.
    const vaultFieldNames = [
      'version',
      'kdf',
      'algo',
      'hash',
      'iterations',
      'salt',
      'cipher',
      'iv',
      'ciphertext',
      'accounts',
      'address',
      'hdPath',
      'label',
    ];
    for (const word of new Set(mnemonic.split(' '))) {
      if (vaultFieldNames.some((field) => field.startsWith(word))) continue;
      expect(persisted).not.toContain(`"${word}`);
    }
    expect(Object.keys(store.vault ?? {}).sort()).toEqual([
      'accounts',
      'cipher',
      'ciphertext',
      'kdf',
      'version',
    ]);
  });

  it('stores a vault that decrypts back to the same mnemonic', async () => {
    const { store, keyring } = newKeyring();
    const { mnemonic } = await keyring.createAccount(PASSWORD);

    expect(await decryptMnemonic(store.vault!, PASSWORD)).toBe(mnemonic);
  });

  it('survives a simulated service-worker restart: locked, then unlockable', async () => {
    const { store, keyring } = newKeyring();
    const { state } = await keyring.createAccount(PASSWORD);

    // A fresh keyring over the same storage is what a respawn produces.
    const respawned = new Keyring(store, webCryptoVaultCrypto);
    expect((await respawned.getState()).status).toBe('locked');

    const unlocked = await respawned.unlock(PASSWORD);
    expect(unlocked.status).toBe('unlocked');
    expect(unlocked.accounts).toEqual(state.accounts);
  });

  it('refuses to overwrite an existing wallet', async () => {
    const { keyring } = newKeyring();
    await keyring.createAccount(PASSWORD);
    await expect(keyring.createAccount('another password')).rejects.toThrow(
      'a wallet already exists',
    );
  });

  it('gives each new wallet a different mnemonic and address', async () => {
    const first = await newKeyring().keyring.createAccount(PASSWORD);
    const second = await newKeyring().keyring.createAccount(PASSWORD);

    expect(first.mnemonic).not.toBe(second.mnemonic);
    expect(first.state.accounts[0]?.address).not.toBe(second.state.accounts[0]?.address);
  });
});

describe('createAccount over the message API (BUS-15)', () => {
  it('answers with the mnemonic for the one-time backup screen', async () => {
    const { keyring } = newKeyring();
    const response = await handleKeyringRequest(services(keyring), {
      type: 'createAccount',
      password: PASSWORD,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const data = response.data as { mnemonic: string; state: { status: string } };
    expect(data.mnemonic.split(' ')).toHaveLength(DEFAULT_MNEMONIC_WORDS);
    expect(data.state.status).toBe('unlocked');
  });

  it('has no request that can re-read the mnemonic afterwards', async () => {
    const { keyring } = newKeyring();
    await handleKeyringRequest(services(keyring), { type: 'createAccount', password: PASSWORD });

    // The remaining responses are non-secret: state + account metadata only.
    const state = await handleKeyringRequest(services(keyring), { type: 'getState' });
    const accounts = await handleKeyringRequest(services(keyring), { type: 'getAccounts' });
    expect(JSON.stringify(state)).not.toContain('mnemonic');
    expect(JSON.stringify(accounts)).not.toContain('mnemonic');
    // The keyring exposes no reveal/export surface at all.
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(keyring))).not.toContain(
      'revealMnemonic',
    );
  });

  it('reports a duplicate wallet as a non-throwing error response', async () => {
    const { keyring } = newKeyring();
    await keyring.createAccount(PASSWORD);
    expect(
      await handleKeyringRequest(services(keyring), { type: 'createAccount', password: PASSWORD }),
    ).toEqual({ ok: false, error: 'a wallet already exists' });
  });
});
