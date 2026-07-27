/**
 * `checkFeeEligibility` routing (BUS-38): the popup asks to re-check whether the
 * active token can pay fees; the background resolves the sticky active-token
 * denom itself and delegates to the `FeeEligibilityService`. The popup never
 * names a denom or an address, matching the getBalance/send trust boundary.
 */

import { describe, expect, it } from 'vitest';
import { Keyring } from '../src/keyring/keyring';
import { handleKeyringRequest } from '../src/keyring/messages';
import { DEFAULT_AUTO_LOCK_MINUTES } from '../src/keyring/settings';
import { sanitizeVault, type VaultStore } from '../src/keyring/storage';
import type { EncryptedVault } from '../src/keyring/vault';
import { webCryptoVaultCrypto } from '../src/keyring/vault-crypto';
import {
  FakeBalanceService,
  FakeFeeEligibilityService,
  MemorySettingsStore,
  services,
} from './support/services';

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

async function keyringWithAccount(): Promise<Keyring> {
  const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
  await keyring.createAccount(PASSWORD);
  return keyring;
}

/** Build a services bundle overriding the settings, balance and fee doubles. */
function withFeeService(
  keyring: Keyring,
  fee: FakeFeeEligibilityService,
  settings = new MemorySettingsStore(),
  balance = new FakeBalanceService(),
) {
  return services(keyring, settings, balance, undefined, fee);
}

describe('checkFeeEligibility request (BUS-38)', () => {
  it('checks the sticky active token denom, not the account address', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      activeTokenDenom: 'factory/bze1abc/xyz',
      tokenSwitchingEnabled: false,
    });
    const fee = new FakeFeeEligibilityService({ eligible: false, reason: 'Low liquidity.' });

    const response = await handleKeyringRequest(withFeeService(keyring, fee, settings), {
      type: 'checkFeeEligibility',
    });

    expect(response).toEqual({ ok: true, data: { eligible: false, reason: 'Low liquidity.' } });
    expect(fee.checkedDenom).toBe('factory/bze1abc/xyz');
  });

  it('adopts and checks the first held token when none is chosen yet', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore();
    const balance = new FakeBalanceService({ denom: 'ubze', amount: '0' }, [
      { denom: 'ubze', amount: '1000000' },
    ]);
    const fee = new FakeFeeEligibilityService({ eligible: true });

    await handleKeyringRequest(withFeeService(keyring, fee, settings, balance), {
      type: 'checkFeeEligibility',
    });

    expect(fee.checkedDenom).toBe('ubze');
  });

  it('checks a null denom (eligible, nothing to warn on) when there is no account', async () => {
    const keyring = new Keyring(new MemoryStore(), webCryptoVaultCrypto);
    const fee = new FakeFeeEligibilityService({ eligible: true });

    const response = await handleKeyringRequest(withFeeService(keyring, fee), {
      type: 'checkFeeEligibility',
    });

    expect(response).toEqual({ ok: true, data: { eligible: true } });
    expect(fee.checkedDenom).toBeNull();
  });

  it('surfaces a service failure as the error envelope, not a throw', async () => {
    const keyring = await keyringWithAccount();
    const settings = new MemorySettingsStore({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      activeTokenDenom: 'factory/bze1abc/xyz',
      tokenSwitchingEnabled: false,
    });
    const fee = new FakeFeeEligibilityService(new Error('Liquidity is unavailable right now.'));

    const response = await handleKeyringRequest(withFeeService(keyring, fee, settings), {
      type: 'checkFeeEligibility',
    });

    expect(response).toEqual({ ok: false, error: 'Liquidity is unavailable right now.' });
  });
});
