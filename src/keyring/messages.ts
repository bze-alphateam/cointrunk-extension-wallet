/**
 * Typed popup ↔ background message contract for the keyring (BUS-49).
 *
 * The popup is untrusted UI: it sends a {@link KeyringRequest} and receives a
 * {@link KeyringResponse} carrying only non-secret data (lock status, account
 * metadata, signing results). Key material never crosses this boundary.
 *
 * Both sides import these shared types. The background wires
 * {@link handleKeyringRequest} into `chrome.runtime.onMessage`; the popup calls
 * {@link sendKeyringRequest}.
 */

import type { Balance, BalanceService } from '../chain/balance';
import { selectStickyActiveDenom, type ActiveTokenState } from '../chain/active-token-selection';
import { validateRecipientAddress } from '../chain/address';
import type { FeeEligibilityService, FeeTokenEligibility } from '../chain/fees';
import type { SendRequest, TransactionService, TxResult } from '../chain/tx';
import type { SignRequest } from './crypto';
import type { CreatedAccount, Keyring, KeyringState } from './keyring';
import {
  assertValidActiveTokenDenom,
  assertValidAutoLockMinutes,
  type SettingsStore,
  type WalletSettings,
} from './settings';
import type { VaultAccount } from './vault';

/**
 * What the router needs to answer a request. Settings and balance live outside
 * the keyring on purpose: the keyring's job is key material, and neither a
 * preferences read nor a public balance query has any business going through the
 * object that holds the signer.
 */
export interface KeyringServices {
  readonly keyring: Keyring;
  readonly settings: SettingsStore;
  readonly balance: BalanceService;
  readonly transactions: TransactionService;
  readonly feeEligibility: FeeEligibilityService;
}

/** Every request the popup can send. Discriminated by `type`. */
export type KeyringRequest =
  | { readonly type: 'getState' }
  | { readonly type: 'createAccount'; readonly password: string; readonly label?: string }
  | {
      readonly type: 'importAccount';
      readonly mnemonic: string;
      readonly password: string;
      readonly label?: string;
    }
  | { readonly type: 'unlock'; readonly password: string }
  | { readonly type: 'lock' }
  | { readonly type: 'getAccounts' }
  | { readonly type: 'getBalance' }
  | { readonly type: 'getActiveToken' }
  | { readonly type: 'setActiveToken'; readonly denom: string }
  | { readonly type: 'send'; readonly request: SendRequest }
  | { readonly type: 'checkFeeEligibility' }
  | { readonly type: 'getSettings' }
  | { readonly type: 'setAutoLockMinutes'; readonly minutes: number }
  | { readonly type: 'sign'; readonly request: SignRequest };

/** Success payload for each request type. */
export interface KeyringResponseData {
  getState: KeyringState;
  /**
   * The only response carrying secret material: the new mnemonic, for the
   * one-time backup screen. See {@link CreatedAccount} for why this is bounded
   * and safe. Popup code MUST render it and drop it — never store or forward it.
   */
  createAccount: CreatedAccount;
  /** Non-secret: the user already has the phrase they imported. */
  importAccount: KeyringState;
  unlock: KeyringState;
  lock: KeyringState;
  getAccounts: readonly VaultAccount[];
  /** The active token's balance, in base units — see {@link Balance}. */
  getBalance: Balance;
  /** The resolved sticky active token (denom or null) — see {@link ActiveTokenState}. */
  getActiveToken: ActiveTokenState;
  /** The now-active token after a deliberate switch (its denom) — see {@link ActiveTokenState}. */
  setActiveToken: ActiveTokenState;
  /** The broadcast result (tx hash) of a send — see {@link TxResult}. */
  send: TxResult;
  /** Re-checked fee-token eligibility for the active account (Epic 7 hook). */
  checkFeeEligibility: FeeTokenEligibility;
  getSettings: WalletSettings;
  setAutoLockMinutes: WalletSettings;
  sign: unknown;
}

/**
 * Response envelope: either the typed success payload for the request, or a
 * generic error string. Error strings are deliberately non-sensitive (e.g.
 * `'locked'`) and never contain secrets.
 */
export type KeyringResponse<T extends KeyringRequest['type'] = KeyringRequest['type']> =
  | { readonly ok: true; readonly data: KeyringResponseData[T] }
  | { readonly ok: false; readonly error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertNever(request: never): never {
  throw new Error(`unknown keyring request: ${JSON.stringify(request)}`);
}

/**
 * Route a request to the keyring and wrap the outcome in a {@link KeyringResponse}.
 * Never throws: rejections become `{ ok: false, error }` so the popup always gets
 * a well-formed reply.
 */
export async function handleKeyringRequest(
  { keyring, settings, balance, transactions, feeEligibility }: KeyringServices,
  request: KeyringRequest,
): Promise<KeyringResponse> {
  try {
    switch (request.type) {
      case 'getState':
        return { ok: true, data: await keyring.getState() };
      case 'createAccount':
        return { ok: true, data: await keyring.createAccount(request.password, request.label) };
      case 'importAccount':
        return {
          ok: true,
          data: await keyring.importAccount(request.mnemonic, request.password, request.label),
        };
      case 'unlock':
        return { ok: true, data: await keyring.unlock(request.password) };
      case 'lock':
        return { ok: true, data: await keyring.lock() };
      case 'getAccounts':
        return { ok: true, data: await keyring.getAccounts() };
      case 'getBalance': {
        // The background owns whose balance this is: the popup asks "my balance"
        // and never gets to name an address, so it can't query an arbitrary one.
        const [account] = await keyring.getAccounts();
        if (!account) {
          throw new Error('no account to query a balance for');
        }
        return { ok: true, data: await balance.getBalance(account.address) };
      }
      case 'getActiveToken': {
        // Resolve the sticky active token (BUS-34). If one is already chosen, it
        // stays put — no chain read needed. Otherwise the first denom the account
        // is seen holding becomes the active token and is persisted, so the choice
        // sticks across reopens. A brand-new account (no account, or holding
        // nothing) resolves to `null` → the neutral default skin.
        const stored = await settings.load();
        let denom = stored.activeTokenDenom;
        if (denom === null) {
          const [account] = await keyring.getAccounts();
          if (account) {
            const held = (await balance.getAllBalances(account.address)).map((b) => b.denom);
            denom = selectStickyActiveDenom(null, held);
            if (denom !== null) {
              await settings.save({ ...stored, activeTokenDenom: denom });
            }
          }
        }
        return { ok: true, data: { denom } };
      }
      case 'setActiveToken': {
        // A deliberate user switch (Epic 6): persist the chosen denom as the new
        // sticky active token, replacing whatever was chosen before. Only this
        // path and the first-received bootstrap in `getActiveToken` ever write
        // the active token, so the choice stays put until the next switch and
        // survives reopen / lock-unlock (settings live outside the vault).
        assertValidActiveTokenDenom(request.denom);
        const current = await settings.load();
        await settings.save({ ...current, activeTokenDenom: request.denom });
        return { ok: true, data: { denom: request.denom } };
      }
      case 'send': {
        // Same trust boundary as getBalance: the background owns the sending
        // address (the active account), so the popup can never spend from an
        // arbitrary one. The recipient is re-validated here — the popup already
        // validates it, but the background is the trust boundary — before the
        // request reaches the signer.
        const [account] = await keyring.getAccounts();
        if (!account) {
          throw new Error('no account to send from');
        }
        const toAddress = validateRecipientAddress(request.request.toAddress);
        return {
          ok: true,
          data: await transactions.send({
            from: account.address,
            toAddress,
            amount: request.request.amount,
          }),
        };
      }
      case 'checkFeeEligibility': {
        // The Epic-7 hook: re-check whether the active account can pay fees.
        // Like getBalance/send, the background owns whose account this is.
        const [account] = await keyring.getAccounts();
        if (!account) {
          throw new Error('no account to check fee eligibility for');
        }
        return { ok: true, data: await feeEligibility.check(account.address) };
      }
      case 'getSettings':
        return { ok: true, data: await settings.load() };
      case 'setAutoLockMinutes': {
        assertValidAutoLockMinutes(request.minutes);
        // Change only the timeout; keep every other setting (e.g. the sticky
        // active token) as it was, rather than resetting the whole blob.
        const current = await settings.load();
        const updated: WalletSettings = { ...current, autoLockMinutes: request.minutes };
        await settings.save(updated);
        return { ok: true, data: updated };
      }
      case 'sign':
        return { ok: true, data: await keyring.sign(request.request) };
      default:
        return assertNever(request);
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * Popup-side helper: send a typed request to the background service worker and
 * receive the matching typed response.
 */
export async function sendKeyringRequest<T extends KeyringRequest>(
  request: T,
): Promise<KeyringResponse<T['type']>> {
  return chrome.runtime.sendMessage(request);
}
