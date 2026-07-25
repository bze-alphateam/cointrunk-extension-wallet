/**
 * BIP39 mnemonic generation and BeeZee account derivation (BUS-15).
 *
 * This is the only place the wallet turns entropy into a mnemonic, and a
 * mnemonic into an address. Everything here runs in the background service
 * worker; nothing in this module logs or persists key material — it hands the
 * mnemonic straight back to its caller (the keyring).
 *
 * Library posture (Security Model, "Library posture"): BIP39 and secp256k1/HD
 * derivation come from CosmJS (`@cosmjs/crypto` wraps `@scure/bip39`;
 * `DirectSecp256k1HdWallet` wraps `@noble/curves`) — pure JS, bundled in the
 * extension, no WASM and no remotely-hosted code. We deliberately do not
 * hand-roll BIP39 or secp256k1.
 */

import { Bip39, EnglishMnemonic, Random, stringToPath } from '@cosmjs/crypto';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { BZE_BECH32_PREFIX, BZE_HD_PATH } from '../chain/constants';
import type { VaultAccount } from './vault';

/**
 * Entropy for a 24-word mnemonic. BIP39 maps 32 bytes (256 bits) → 24 words,
 * which is the ratified default (Security Model: "24-word mnemonic default").
 */
export const MNEMONIC_ENTROPY_BYTES = 32;

/** Number of words the generated mnemonic has, implied by the entropy above. */
export const DEFAULT_MNEMONIC_WORDS = 24;

/**
 * Word counts accepted on import (BUS-16, Security Model: "12 or 24 accepted on
 * import"). BIP39 also defines 15/18/21, but the wallet deliberately narrows to
 * the two counts users actually have, so a 15-word paste gets a clear "must be
 * 12 or 24" rather than silently importing the wrong wallet.
 */
export const ACCEPTED_MNEMONIC_WORD_COUNTS = [12, 24] as const;

/** Label given to the single v1 account. Multi-account is out of scope for v1. */
export const DEFAULT_ACCOUNT_LABEL = 'Account 1';

/**
 * The BIP39 English word list as a set, for O(1) membership checks. Read off the
 * library so there is no second copy that could drift out of sync.
 */
const ENGLISH_WORDS = new Set<string>(EnglishMnemonic.wordlist);

/**
 * Generate a fresh 24-word BIP39 mnemonic.
 *
 * Randomness comes from `Random.getBytes`, which is a CSPRNG
 * (`crypto.getRandomValues`) — never `Math.random`. The caller owns the returned
 * string and must not log it or persist it in plaintext.
 */
export function generateMnemonic(): string {
  return Bip39.encode(Random.getBytes(MNEMONIC_ENTROPY_BYTES)).toString();
}

/**
 * Clean up a pasted recovery phrase (BUS-16): trim, collapse runs of whitespace
 * and newlines into single spaces, and lowercase — the BIP39 English word list
 * is lowercase, so a phrase copied out of a document with capitals or line
 * breaks validates the same as a cleanly typed one.
 */
export function normalizeMnemonic(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed.length === 0 ? '' : trimmed.split(/\s+/u).join(' ');
}

/**
 * Validate a user-supplied mnemonic, throwing a specific, actionable error on
 * failure (BUS-16 AC: "rejected with a clear, specific error").
 *
 * Expects an already-{@link normalizeMnemonic}d string. The three failure modes
 * are reported separately — wrong word count, a word outside the BIP39 list, or
 * a bad checksum — because they need different fixes from the user.
 *
 * The messages name the *class* of problem and, for an unknown word, its
 * position — but never echo any word back. A mnemonic word is secret, and error
 * strings have a habit of ending up in logs and bug reports.
 */
export function assertValidMnemonic(mnemonic: string): void {
  const words = mnemonic.length === 0 ? [] : mnemonic.split(' ');

  if (!(ACCEPTED_MNEMONIC_WORD_COUNTS as readonly number[]).includes(words.length)) {
    throw new Error(
      `recovery phrase must be ${ACCEPTED_MNEMONIC_WORD_COUNTS.join(' or ')} words (got ${words.length})`,
    );
  }

  const unknownIndex = words.findIndex((word) => !ENGLISH_WORDS.has(word));
  if (unknownIndex !== -1) {
    throw new Error(`word ${unknownIndex + 1} is not in the BIP39 English word list`);
  }

  try {
    // Full BIP39 validation, including the checksum bits in the final word.
    new EnglishMnemonic(mnemonic);
  } catch {
    throw new Error('recovery phrase checksum is invalid — check for mistyped or swapped words');
  }
}

/**
 * Derive the BeeZee account for a mnemonic using the confirmed bech32 prefix and
 * BIP-44 HD path (BUS-14), via CosmJS `DirectSecp256k1HdWallet`.
 *
 * Returns only the non-secret {@link VaultAccount} metadata — address, HD path,
 * label. The wallet object (which holds the seed) is local to this call and is
 * dropped when it returns.
 */
export async function deriveAccount(
  mnemonic: string,
  label: string = DEFAULT_ACCOUNT_LABEL,
): Promise<VaultAccount> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: BZE_BECH32_PREFIX,
    hdPaths: [stringToPath(BZE_HD_PATH)],
  });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error('failed to derive a BeeZee account');
  }
  return { address: account.address, hdPath: BZE_HD_PATH, label };
}
