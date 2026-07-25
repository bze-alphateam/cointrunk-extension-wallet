/**
 * Persistence layer for the encrypted vault, over `chrome.storage.local`.
 *
 * SECURITY INVARIANT (BUS-48 Security Model): only the encrypted blob and
 * non-secret metadata are ever written to disk — never a plaintext mnemonic or
 * private key. {@link ChromeVaultStore.save} enforces this by reconstructing the
 * persisted object field by field from a whitelist, so even if a caller hands it
 * an object with extra secret fields attached, those fields are dropped and
 * never reach storage.
 */

import type { EncryptedVault } from './vault';

/** `chrome.storage.local` key under which the single vault blob is stored. */
export const VAULT_STORAGE_KEY = 'vault';

/**
 * Abstract vault persistence, so the keyring can be tested against an in-memory
 * fake and the real implementation can target `chrome.storage`.
 */
export interface VaultStore {
  /** Read the persisted vault, or `null` if the wallet has never been set up. */
  load(): Promise<EncryptedVault | null>;
  /** Persist the vault (sanitised to non-secret fields + ciphertext only). */
  save(vault: EncryptedVault): Promise<void>;
  /** Remove the vault entirely (e.g. wallet reset). */
  clear(): Promise<void>;
}

/**
 * Copy ONLY the whitelisted, on-disk fields of a vault. Anything not named here
 * — including any accidentally-attached plaintext secret — is discarded. This is
 * the single chokepoint that guarantees no secret is ever written.
 */
export function sanitizeVault(vault: EncryptedVault): EncryptedVault {
  return {
    version: vault.version,
    kdf: {
      algo: vault.kdf.algo,
      hash: vault.kdf.hash,
      iterations: vault.kdf.iterations,
      salt: vault.kdf.salt,
    },
    cipher: {
      algo: vault.cipher.algo,
      iv: vault.cipher.iv,
    },
    ciphertext: vault.ciphertext,
    accounts: vault.accounts.map((account) => ({
      address: account.address,
      hdPath: account.hdPath,
      label: account.label,
    })),
  };
}

/** `VaultStore` backed by `chrome.storage.local`. */
export class ChromeVaultStore implements VaultStore {
  async load(): Promise<EncryptedVault | null> {
    const result = await chrome.storage.local.get(VAULT_STORAGE_KEY);
    return (result[VAULT_STORAGE_KEY] as EncryptedVault | undefined) ?? null;
  }

  async save(vault: EncryptedVault): Promise<void> {
    await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: sanitizeVault(vault) });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(VAULT_STORAGE_KEY);
  }
}
