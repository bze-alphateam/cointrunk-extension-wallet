/**
 * `getBranding` routing (BUS-33): the popup has no chain client, so it asks the
 * background for a token's branding package, which reads it through the cached
 * chain layer. "No branding" comes back as null; a missing denom is rejected.
 */

import { describe, expect, it } from 'vitest';
import type { DenomBranding } from '../src/chain/branding';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest, type KeyringRequest } from '../src/keyring/messages';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import { FakeBrandingReader, services } from './support/services';

const TOKEN = 'factory/bze1abc/xyz';

const BRANDING: DenomBranding = {
  font: 'inter',
  light: { background: '#FFFFFF', text: '#111827', primary: '#D97706', secondary: '#6B7280' },
  dark: { background: '#111827', text: '#F9FAFB', primary: '#FBBF24', secondary: '#9CA3AF' },
};

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

function withBranding(branding: FakeBrandingReader) {
  const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
  return services(keyring, undefined, undefined, undefined, undefined, undefined, branding);
}

describe('getBranding request (BUS-33)', () => {
  it("returns the denom's branding package", async () => {
    const branding = new FakeBrandingReader({ [TOKEN]: BRANDING });
    const response = await handleKeyringRequest(withBranding(branding), {
      type: 'getBranding',
      denom: TOKEN,
    });
    expect(response).toEqual({ ok: true, data: BRANDING });
    expect(branding.queriedDenoms).toEqual([TOKEN]);
  });

  it('returns null for a denom without branding', async () => {
    const response = await handleKeyringRequest(withBranding(new FakeBrandingReader()), {
      type: 'getBranding',
      denom: TOKEN,
    });
    expect(response).toEqual({ ok: true, data: null });
  });

  it('rejects a missing denom without reading the chain', async () => {
    const branding = new FakeBrandingReader({ [TOKEN]: BRANDING });
    const response = await handleKeyringRequest(withBranding(branding), {
      type: 'getBranding',
      denom: '',
    });
    expect(response.ok).toBe(false);
    expect(branding.queriedDenoms).toEqual([]);

    const malformed = { type: 'getBranding' } as unknown as KeyringRequest;
    expect((await handleKeyringRequest(withBranding(branding), malformed)).ok).toBe(false);
  });

  it('turns a failed read into an error envelope', async () => {
    const response = await handleKeyringRequest(
      withBranding(new FakeBrandingReader(new Error('network down'))),
      { type: 'getBranding', denom: TOKEN },
    );
    expect(response).toEqual({ ok: false, error: 'network down' });
  });
});
