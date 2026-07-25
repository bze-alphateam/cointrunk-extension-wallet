/**
 * CoinTrunk background service worker (Manifest V3).
 *
 * Hosts the keyring — the sole holder of decrypted key material and the source
 * of truth for wallet state — and exposes it to the popup over a typed message
 * API (BUS-49), with auto-lock on inactivity layered on top (BUS-18).
 *
 * Note: MV3 service workers are ephemeral — Chrome suspends them when idle and
 * respawns them on the next event, so top-level code here runs on every wake.
 * The keyring instance is recreated on each respawn with an empty in-memory
 * signer, so the wallet naturally returns to `locked` after teardown; only the
 * non-secret vault (ciphertext + metadata) survives, in `chrome.storage`.
 * Keep this file side-effect-light and register listeners synchronously.
 */

import { AutoLock, chromeAlarmScheduler } from '../keyring/autolock';
import { Keyring } from '../keyring/keyring';
import { handleKeyringRequest, type KeyringRequest } from '../keyring/messages';
import { ChromeSettingsStore } from '../keyring/settings';
import { ChromeVaultStore } from '../keyring/storage';
import { webCryptoVaultCrypto } from '../keyring/vault-crypto';

// PBKDF2 + AES-256-GCM encryption at rest (BUS-17). `decrypt` proves the
// password via the GCM auth tag and unlocks the keyring; state and account
// queries work whether locked or unlocked.
const keyring = new Keyring(new ChromeVaultStore(), webCryptoVaultCrypto);
const settings = new ChromeSettingsStore();
const autoLock = new AutoLock(keyring, settings, chromeAlarmScheduler);

// Popup ↔ background message bridge. `handleKeyringRequest` never throws, and
// returning `true` keeps the message channel open for the async `sendResponse`.
//
// Every handled request counts as user activity, so `autoLock.sync()` runs after
// each one: while unlocked it restarts the inactivity countdown, and once locked
// it clears the alarm. Reconciling after the fact means unlock arms the timer
// and lock disarms it without either code path knowing the auto-lock exists.
chrome.runtime.onMessage.addListener((message: KeyringRequest, _sender, sendResponse) => {
  handleKeyringRequest({ keyring, settings }, message)
    .then(async (response) => {
      await autoLock.sync();
      return response;
    })
    .then(sendResponse);
  return true;
});

// The auto-lock alarm fired: the user has been inactive for the configured
// timeout, so drop the in-memory signer. Alarms wake the worker if it was
// suspended — in which case the signer is already gone and locking is a no-op.
chrome.alarms.onAlarm.addListener((alarm) => {
  void autoLock.onAlarm(alarm.name);
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
