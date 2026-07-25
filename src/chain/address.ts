/**
 * Recipient-address validation for the send flow (BUS-22).
 *
 * The bech32 decode — prefix split and checksum — comes from `@cosmjs/encoding`
 * (the same library family the wallet already uses), never a hand-rolled
 * checksum. On top of it we enforce the two BeeZee-specific rules the send flow
 * needs: the human-readable prefix must be `bze`, and the payload must be a
 * 20-byte account address. A wrong-prefix address (e.g. a `cosmos1…`) is
 * rejected with its own message so the user learns they pasted the wrong
 * chain's address rather than just "invalid".
 */

import { fromBech32 } from '@cosmjs/encoding';
import { BZE_BECH32_PREFIX } from './constants';

/**
 * Byte length of a Cosmos SDK account address payload: the 20-byte RIPEMD-160
 * hash of the secp256k1 public key. A valid bech32 string of the right prefix
 * but the wrong length is not an account address (e.g. a validator operator or
 * a truncated paste).
 */
export const ACCOUNT_ADDRESS_BYTES = 20;

/**
 * Validate that `input` is a well-formed BeeZee (`bze1…`) account address and
 * return it trimmed. Throws a specific, user-readable error on each distinct
 * failure so the Send screen can show the user exactly what is wrong:
 *  - empty input,
 *  - not decodable as bech32 (malformed or bad checksum),
 *  - a valid address on the wrong chain (prefix ≠ `bze`),
 *  - a bech32 payload that is not a 20-byte account address.
 */
export function validateRecipientAddress(input: string): string {
  const address = input.trim();
  if (address.length === 0) {
    throw new Error('Enter a recipient address.');
  }

  let decoded: { prefix: string; data: Uint8Array };
  try {
    decoded = fromBech32(address);
  } catch {
    throw new Error('That is not a valid address — check for a typo.');
  }

  if (decoded.prefix !== BZE_BECH32_PREFIX) {
    throw new Error(
      `Enter a BeeZee (${BZE_BECH32_PREFIX}1…) address — that one is for another chain.`,
    );
  }
  if (decoded.data.length !== ACCOUNT_ADDRESS_BYTES) {
    throw new Error('That is not a valid account address.');
  }
  return address;
}

/** Non-throwing form for live field validation as the user types. */
export function isValidRecipientAddress(input: string): boolean {
  try {
    validateRecipientAddress(input);
    return true;
  } catch {
    return false;
  }
}
