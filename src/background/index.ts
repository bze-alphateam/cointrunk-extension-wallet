/**
 * CoinTrunk background service worker (Manifest V3).
 *
 * Skeleton entry point. For now it only logs lifecycle events so we can confirm
 * the worker registers and runs after "Load unpacked". Message handling and
 * wallet logic land in later tickets.
 *
 * Note: MV3 service workers are ephemeral — Chrome suspends them when idle and
 * respawns them on the next event, so top-level code here runs on every wake.
 * Keep it side-effect-light and register listeners synchronously at the top.
 */

// Fired once when the extension is installed or updated (and on Chrome update).
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[CoinTrunk] service worker installed (reason: ${details.reason})`);
});

// Fired when a profile that has this extension installed first starts up.
chrome.runtime.onStartup.addListener(() => {
  console.log('[CoinTrunk] service worker started');
});

console.log('[CoinTrunk] background service worker loaded');
