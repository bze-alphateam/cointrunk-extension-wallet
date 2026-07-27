/**
 * Shared test doubles for the background collaborators. Not a `*.test.ts`, so
 * Vitest does not collect it — it is imported by the suites that need it.
 */

import type { Balance, BalanceService } from '../../src/chain/balance';
import type { FeeEligibilityService, FeeTokenEligibility } from '../../src/chain/fees';
import type { SendParams, TransactionService, TxResult } from '../../src/chain/tx';
import type { Keyring } from '../../src/keyring/keyring';
import type { KeyringServices } from '../../src/keyring/messages';
import {
  assertValidAutoLockMinutes,
  DEFAULT_SETTINGS,
  normalizeActiveTokenDenom,
  type SettingsStore,
  type WalletSettings,
} from '../../src/keyring/settings';

/** In-memory `SettingsStore`, validating on save exactly like the chrome one. */
export class MemorySettingsStore implements SettingsStore {
  constructor(public settings: WalletSettings = DEFAULT_SETTINGS) {}

  load = async (): Promise<WalletSettings> => this.settings;

  save = async (settings: WalletSettings): Promise<void> => {
    assertValidAutoLockMinutes(settings.autoLockMinutes);
    // Rebuild field by field, like the chrome store, so a caller's extra keys
    // never ride along and the denom is normalised on the way in.
    this.settings = {
      autoLockMinutes: settings.autoLockMinutes,
      activeTokenDenom: normalizeActiveTokenDenom(settings.activeTokenDenom),
    };
  };
}

/**
 * `BalanceService` double that records the address it was asked about and
 * returns a fixed balance — or rejects, to exercise the error path.
 */
export class FakeBalanceService implements BalanceService {
  queriedAddress: string | null = null;
  allQueriedAddress: string | null = null;

  constructor(
    private readonly result: Balance | Error = { denom: 'ubze', amount: '0' },
    private readonly all: Balance[] | Error = [],
  ) {}

  getBalance = async (address: string): Promise<Balance> => {
    this.queriedAddress = address;
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  };

  getAllBalances = async (address: string): Promise<Balance[]> => {
    this.allQueriedAddress = address;
    if (this.all instanceof Error) {
      throw this.all;
    }
    return this.all;
  };
}

/**
 * `TransactionService` double that records the params it was called with and
 * returns a fixed result — or rejects, to exercise the send failure path.
 */
export class FakeTransactionService implements TransactionService {
  lastParams: SendParams | null = null;

  constructor(private readonly result: TxResult | Error = { hash: 'DEADBEEF' }) {}

  send = async (params: SendParams): Promise<TxResult> => {
    this.lastParams = params;
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  };
}

/**
 * `FeeEligibilityService` double that records the address it was asked about and
 * returns a fixed eligibility — or rejects, to exercise the hook's error path.
 */
export class FakeFeeEligibilityService implements FeeEligibilityService {
  checkedAddress: string | null = null;

  constructor(private readonly result: FeeTokenEligibility | Error = { eligible: true }) {}

  check = async (address: string): Promise<FeeTokenEligibility> => {
    this.checkedAddress = address;
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  };
}

/** Bundle a keyring with fresh settings, balance, transaction and fee doubles. */
export function services(
  keyring: Keyring,
  settings = new MemorySettingsStore(),
  balance = new FakeBalanceService(),
  transactions = new FakeTransactionService(),
  feeEligibility = new FakeFeeEligibilityService(),
): KeyringServices {
  return { keyring, settings, balance, transactions, feeEligibility };
}
