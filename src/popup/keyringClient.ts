/**
 * Thin popup-side wrapper over the keyring message API.
 *
 * Every call unwraps the `{ ok }` envelope so screens can use plain
 * `try`/`catch`, and the background's error strings (already scrubbed of
 * anything secret) surface as `Error.message` for display.
 */

import {
  sendKeyringRequest,
  type KeyringRequest,
  type KeyringResponseData,
} from '../keyring/messages';

/**
 * Send `request` and return its payload, throwing on the error envelope.
 *
 * Note there is no logging here, deliberately: the `createAccount` response
 * carries the new mnemonic, so a convenience `console.log(response)` would put a
 * recovery phrase in the devtools console.
 */
export async function request<T extends KeyringRequest>(
  message: T,
): Promise<KeyringResponseData[T['type']]> {
  const response = await sendKeyringRequest(message);
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}
