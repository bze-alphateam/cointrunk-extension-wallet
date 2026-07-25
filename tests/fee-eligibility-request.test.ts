/**
 * `checkFeeEligibility` routing (BUS-23): the failure-path hook for Epic 7. The
 * popup asks to re-check fee eligibility; the background resolves the active
 * account itself and delegates to the `FeeEligibilityService`. The popup never
 * names an address, matching the getBalance/send trust boundary.
 */

import { describe, expect, it } from 'vitest';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import { FakeFeeEligibilityService, services } from './support/services';

const PASSWORD = 'correct horse battery staple';

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

async function keyringWithAccount(): Promise<{ keyring: Keyring; address: string }> {
  const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
  const [account] = (await keyring.createAccount(PASSWORD)).state.accounts;
  return { keyring, address: account!.address };
}

/** Build a services bundle overriding only the fee-eligibility double. */
function withFeeService(keyring: Keyring, feeEligibility: FakeFeeEligibilityService) {
  return services(keyring, undefined, undefined, undefined, feeEligibility);
}

describe('checkFeeEligibility request (BUS-23)', () => {
  it('returns the eligibility, checked for the active account address', async () => {
    const { keyring, address } = await keyringWithAccount();
    const fee = new FakeFeeEligibilityService({ eligible: false, reason: 'Top up your BZE.' });

    const response = await handleKeyringRequest(withFeeService(keyring, fee), {
      type: 'checkFeeEligibility',
    });

    expect(response).toEqual({ ok: true, data: { eligible: false, reason: 'Top up your BZE.' } });
    expect(fee.checkedAddress).toBe(address);
  });

  it('fails cleanly when there is no account — the service is never called', async () => {
    const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    const fee = new FakeFeeEligibilityService({ eligible: true });

    const response = await handleKeyringRequest(withFeeService(keyring, fee), {
      type: 'checkFeeEligibility',
    });

    expect(response.ok).toBe(false);
    expect(fee.checkedAddress).toBeNull();
  });

  it('surfaces the placeholder failure as the error envelope, not a throw', async () => {
    const { keyring } = await keyringWithAccount();
    const fee = new FakeFeeEligibilityService(
      new Error('Fee-token eligibility checks arrive with alt-fee-token support.'),
    );

    const response = await handleKeyringRequest(withFeeService(keyring, fee), {
      type: 'checkFeeEligibility',
    });

    expect(response).toEqual({
      ok: false,
      error: 'Fee-token eligibility checks arrive with alt-fee-token support.',
    });
  });
});
