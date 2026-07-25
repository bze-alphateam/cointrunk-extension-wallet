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

import { Bip39, Random, stringToPath } from '@cosmjs/crypto';
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

/** Label given to the single v1 account. Multi-account is out of scope for v1. */
export const DEFAULT_ACCOUNT_LABEL = 'Account 1';

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
