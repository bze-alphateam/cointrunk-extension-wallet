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

import type { SignRequest } from './crypto';
import type { Keyring, KeyringState } from './keyring';
import type { VaultAccount } from './vault';

/** Every request the popup can send. Discriminated by `type`. */
export type KeyringRequest =
  | { readonly type: 'getState' }
  | { readonly type: 'unlock'; readonly password: string }
  | { readonly type: 'lock' }
  | { readonly type: 'getAccounts' }
  | { readonly type: 'sign'; readonly request: SignRequest };

/** Success payload for each request type. */
export interface KeyringResponseData {
  getState: KeyringState;
  unlock: KeyringState;
  lock: KeyringState;
  getAccounts: readonly VaultAccount[];
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
  keyring: Keyring,
  request: KeyringRequest,
): Promise<KeyringResponse> {
  try {
    switch (request.type) {
      case 'getState':
        return { ok: true, data: await keyring.getState() };
      case 'unlock':
        return { ok: true, data: await keyring.unlock(request.password) };
      case 'lock':
        return { ok: true, data: await keyring.lock() };
      case 'getAccounts':
        return { ok: true, data: await keyring.getAccounts() };
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
