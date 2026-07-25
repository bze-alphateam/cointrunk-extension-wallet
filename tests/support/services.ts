/**
 * Shared test doubles for the background collaborators. Not a `*.test.ts`, so
 * Vitest does not collect it — it is imported by the suites that need it.
 */

import type { Balance, BalanceService } from '../../src/chain/balance';
import type { Keyring } from '../../src/keyring/keyring';
import type { KeyringServices } from '../../src/keyring/messages';
import {
  assertValidAutoLockMinutes,
  DEFAULT_SETTINGS,
  type SettingsStore,
  type WalletSettings,
} from '../../src/keyring/settings';

/** In-memory `SettingsStore`, validating on save exactly like the chrome one. */
export class MemorySettingsStore implements SettingsStore {
  constructor(public settings: WalletSettings = DEFAULT_SETTINGS) {}

  load = async (): Promise<WalletSettings> => this.settings;

  save = async (settings: WalletSettings): Promise<void> => {
    assertValidAutoLockMinutes(settings.autoLockMinutes);
    this.settings = { autoLockMinutes: settings.autoLockMinutes };
  };
}

/**
 * `BalanceService` double that records the address it was asked about and
 * returns a fixed balance — or rejects, to exercise the error path.
 */
export class FakeBalanceService implements BalanceService {
  queriedAddress: string | null = null;

  constructor(private readonly result: Balance | Error = { denom: 'ubze', amount: '0' }) {}

  getBalance = async (address: string): Promise<Balance> => {
    this.queriedAddress = address;
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  };
}

/** Bundle a keyring with fresh settings and balance doubles for the router. */
export function services(
  keyring: Keyring,
  settings = new MemorySettingsStore(),
  balance = new FakeBalanceService(),
): KeyringServices {
  return { keyring, settings, balance };
}
