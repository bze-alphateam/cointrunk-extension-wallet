/**
 * Shared test doubles for the background collaborators. Not a `*.test.ts`, so
 * Vitest does not collect it — it is imported by the suites that need it.
 */

import type { Balance, BalanceService } from '../../src/chain/balance';
import type { BrandingReader, DenomBranding } from '../../src/chain/branding';
import type { TokenIdentityReader } from '../../src/chain/chain-data';
import type { FeeEligibilityService, FeeTokenEligibility } from '../../src/chain/fees';
import type { TokenIdentity } from '../../src/chain/metadata';
import { makeSignDoc } from '@cosmjs/proto-signing';
import type {
  SendParams,
  SendQuote,
  TransactionService,
  TxFee,
  TxResult,
} from '../../src/chain/tx';
import type { SignRequest } from '../../src/keyring/crypto';
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
      tokenSwitchingEnabled: settings.tokenSwitchingEnabled === true,
    };
  };
}

/**
 * `BalanceService` double that records the address it was asked about and
 * returns a fixed balance — or rejects, to exercise the error path.
 */
export class FakeBalanceService implements BalanceService {
  queriedAddress: string | null = null;
  queriedDenom: string | null = null;
  allQueriedAddress: string | null = null;

  constructor(
    private readonly result: Balance | Error = { denom: 'ubze', amount: '0' },
    private readonly all: Balance[] | Error = [],
  ) {}

  getBalance = async (address: string, denom: string): Promise<Balance> => {
    this.queriedAddress = address;
    this.queriedDenom = denom;
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

/** A minimal, well-formed sign doc, for tests that only care whether signing is allowed. */
export const SIGN_REQUEST: SignRequest = {
  signDoc: makeSignDoc(new Uint8Array(), new Uint8Array(), 'beezee-1', 0),
};

/** The fee {@link FakeTransactionService} quotes by default. */
export const QUOTED_FEE: TxFee = { amount: '2600', denom: 'ubze', gas: '260000' };

/**
 * `TransactionService` double that records the params (and confirmed fee) it
 * was called with and returns a fixed quote / result — or rejects, to exercise
 * the failure paths.
 */
export class FakeTransactionService implements TransactionService {
  lastParams: SendParams | null = null;
  lastFee: TxFee | null = null;
  quotedParams: SendParams | null = null;

  constructor(
    private readonly result: TxResult | Error = { hash: 'DEADBEEF' },
    private readonly quoteResult: SendQuote | Error = { status: 'ready', fee: QUOTED_FEE },
  ) {}

  quote = async (params: SendParams): Promise<SendQuote> => {
    this.quotedParams = params;
    if (this.quoteResult instanceof Error) {
      throw this.quoteResult;
    }
    return this.quoteResult;
  };

  send = async (params: SendParams, fee: TxFee): Promise<TxResult> => {
    this.lastParams = params;
    this.lastFee = fee;
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  };
}

/**
 * `FeeEligibilityService` double that records the active-token denom it was asked
 * about and returns a fixed eligibility — or rejects, to exercise the error path.
 * `checkedDenom` starts as `undefined` ("never called") to tell it apart from a
 * genuine `null` denom (checked, but no active token).
 */
export class FakeFeeEligibilityService implements FeeEligibilityService {
  checkedDenom: string | null | undefined = undefined;

  constructor(private readonly result: FeeTokenEligibility | Error = { eligible: true }) {}

  check = async (denom: string | null): Promise<FeeTokenEligibility> => {
    this.checkedDenom = denom;
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  };
}

/**
 * `TokenIdentityReader` double that echoes a denom-derived identity, or serves a
 * per-denom map when one is supplied. Records the denoms it was asked about.
 */
export class FakeTokenIdentityReader implements TokenIdentityReader {
  queriedDenoms: string[] = [];

  constructor(private readonly byDenom: Record<string, TokenIdentity> = {}) {}

  getTokenIdentity = async (denom: string): Promise<TokenIdentity> => {
    this.queriedDenoms.push(denom);
    return (
      this.byDenom[denom] ?? {
        denom,
        name: denom,
        symbol: denom,
        decimals: 0,
        logoUri: null,
      }
    );
  };
}

/**
 * `BrandingReader` double serving a per-denom map (missing → `null`, no
 * branding), or rejecting with a fixed error. Records the denoms it was asked
 * about.
 */
export class FakeBrandingReader implements BrandingReader {
  queriedDenoms: string[] = [];

  constructor(private readonly byDenom: Record<string, DenomBranding> | Error = {}) {}

  getBranding = async (denom: string): Promise<DenomBranding | null> => {
    this.queriedDenoms.push(denom);
    if (this.byDenom instanceof Error) {
      throw this.byDenom;
    }
    return this.byDenom[denom] ?? null;
  };
}

/** Bundle a keyring with fresh settings, balance, transaction, fee, token and branding doubles. */
export function services(
  keyring: Keyring,
  settings = new MemorySettingsStore(),
  balance = new FakeBalanceService(),
  transactions = new FakeTransactionService(),
  feeEligibility = new FakeFeeEligibilityService(),
  tokens = new FakeTokenIdentityReader(),
  branding = new FakeBrandingReader(),
): KeyringServices {
  return { keyring, settings, balance, transactions, feeEligibility, tokens, branding };
}
