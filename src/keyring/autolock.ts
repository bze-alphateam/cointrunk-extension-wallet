/**
 * Auto-lock on inactivity (BUS-18).
 *
 * Why `chrome.alarms` and not `setTimeout`: an MV3 service worker is evicted
 * after ~30 s idle, and a `setTimeout` dies with it — so a timer-based
 * auto-lock would simply never fire in the one case it matters (the user walked
 * away and stopped interacting). Alarms are owned by the browser, survive
 * eviction, and wake the worker to run the handler. MetaMask moved to alarms in
 * MV3 for exactly this reason; see the Security Model's prior-art review.
 *
 * Eviction is itself a lock (the in-memory signer dies with the worker), so the
 * alarm is not what makes the wallet safe — it is what makes the wallet lock
 * *promptly and predictably* while the worker happens to stay alive, and what
 * guarantees the locked state is reached even on a browser that keeps the worker
 * warm.
 */

import type { Keyring } from './keyring';
import type { SettingsStore } from './settings';

/** Name of the single auto-lock alarm. */
export const AUTO_LOCK_ALARM = 'cointrunk:auto-lock';

/**
 * The slice of `chrome.alarms` this needs, as an interface — so the state
 * machine below can be tested against a fake instead of a browser.
 */
export interface AlarmScheduler {
  /** (Re)create the named alarm to fire once, `delayMinutes` from now. */
  schedule(name: string, delayMinutes: number): Promise<void>;
  /** Remove the named alarm if it exists. */
  cancel(name: string): Promise<void>;
}

/** `AlarmScheduler` backed by the real `chrome.alarms` API. */
export const chromeAlarmScheduler: AlarmScheduler = {
  async schedule(name: string, delayMinutes: number): Promise<void> {
    // `create` replaces any existing alarm of the same name, which is exactly
    // the "reset the countdown" semantics activity needs.
    await chrome.alarms.create(name, { delayInMinutes: delayMinutes });
  },
  async cancel(name: string): Promise<void> {
    await chrome.alarms.clear(name);
  },
};

/**
 * Keeps the auto-lock alarm in step with the keyring's lock state.
 *
 * The whole design is one idempotent method, {@link sync}: unlocked ⇒ an alarm
 * is pending `autoLockMinutes` from now; not unlocked ⇒ no alarm. Calling it
 * after every popup interaction both arms the timer on unlock and resets the
 * countdown on activity, with no separate "is it armed?" bookkeeping to drift
 * out of sync with reality.
 */
export class AutoLock {
  constructor(
    private readonly keyring: Keyring,
    private readonly settings: SettingsStore,
    private readonly alarms: AlarmScheduler,
  ) {}

  /**
   * Reconcile the alarm with the current state. Call after every handled
   * request: while unlocked this restarts the inactivity countdown, and once
   * locked it clears the alarm so a stale one cannot fire later.
   */
  async sync(): Promise<void> {
    const { status } = await this.keyring.getState();
    if (status === 'unlocked') {
      const { autoLockMinutes } = await this.settings.load();
      await this.alarms.schedule(AUTO_LOCK_ALARM, autoLockMinutes);
      return;
    }
    await this.alarms.cancel(AUTO_LOCK_ALARM);
  }

  /**
   * Handle a fired alarm. Ignores alarms that aren't ours — the extension may
   * add others later — and locks the keyring otherwise, clearing the in-memory
   * signer. Returns whether it acted, which the tests assert on.
   */
  async onAlarm(name: string): Promise<boolean> {
    if (name !== AUTO_LOCK_ALARM) {
      return false;
    }
    await this.keyring.lock();
    return true;
  }
}
