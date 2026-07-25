/**
 * CoinTrunk background service worker (Manifest V3).
 *
 * Hosts the keyring — the sole holder of decrypted key material and the source
 * of truth for wallet state — and exposes it to the popup over a typed message
 * API (BUS-49).
 *
 * Note: MV3 service workers are ephemeral — Chrome suspends them when idle and
 * respawns them on the next event, so top-level code here runs on every wake.
 * The keyring instance is recreated on each respawn with an empty in-memory
 * signer, so the wallet naturally returns to `locked` after teardown; only the
 * non-secret vault (ciphertext + metadata) survives, in `chrome.storage`.
 * Keep this file side-effect-light and register listeners synchronously.
 */

import { Keyring } from '../keyring/keyring';
import { handleKeyringRequest, type KeyringRequest } from '../keyring/messages';
import { ChromeVaultStore } from '../keyring/storage';
import { webCryptoVaultCrypto } from '../keyring/vault-crypto';

// Argon2id + AES-256-GCM encryption at rest (BUS-17). `decrypt` proves the
// password via the GCM auth tag and unlocks the keyring; state and account
// queries work whether locked or unlocked.
const keyring = new Keyring(new ChromeVaultStore(), webCryptoVaultCrypto);

// Popup ↔ background message bridge. `handleKeyringRequest` never throws, and
// returning `true` keeps the message channel open for the async `sendResponse`.
chrome.runtime.onMessage.addListener((message: KeyringRequest, _sender, sendResponse) => {
  handleKeyringRequest(keyring, message).then(sendResponse);
  return true;
});

// Fired once when the extension is installed or updated (and on Chrome update).
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[CoinTrunk] service worker installed (reason: ${details.reason})`);
});

// Fired when a profile that has this extension installed first starts up.
chrome.runtime.onStartup.addListener(() => {
  console.log('[CoinTrunk] service worker started');
});

console.log('[CoinTrunk] background service worker loaded');
