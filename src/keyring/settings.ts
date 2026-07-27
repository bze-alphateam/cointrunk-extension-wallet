/**
 * User-configurable wallet settings (BUS-18).
 *
 * Nothing here is secret — these are plain preferences persisted next to the
 * vault in `chrome.storage.local`. They are deliberately kept in their own key
 * (and their own module) so a settings write can never touch the vault blob.
 */

/** `chrome.storage.local` key holding the settings object. */
export const SETTINGS_STORAGE_KEY = 'settings';

/**
 * Ratified default inactivity timeout (Security Model: "Auto-lock default 15
 * min (configurable), via chrome.alarms").
 */
export const DEFAULT_AUTO_LOCK_MINUTES = 15;

/**
 * Bounds for the configurable timeout. The floor is 1 minute because
 * `chrome.alarms` will not fire an alarm sooner than that in a packed
 * extension; the ceiling (24 h) stops a typo like "600000" from turning
 * auto-lock off in all but name — the user who genuinely wants no auto-lock is
 * better served by an explicit switch than by an absurd number.
 */
export const MIN_AUTO_LOCK_MINUTES = 1;
export const MAX_AUTO_LOCK_MINUTES = 24 * 60;

export interface WalletSettings {
  /** Inactivity timeout, in minutes, after which the wallet auto-locks. */
  readonly autoLockMinutes: number;
  /**
   * The sticky active token's base denom, or `null` before one is chosen
   * (BUS-34). The first token the account is seen holding is captured here and
   * then stays put — the wallet reopens skinned to it, and it only changes when
   * the user deliberately switches (Epic 6). `null` means "no token yet", which
   * the UI renders as the neutral default skin.
   */
  readonly activeTokenDenom: string | null;
}

export const DEFAULT_SETTINGS: WalletSettings = {
  autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  activeTokenDenom: null,
};

/** Abstract settings persistence, so the auto-lock can be tested in memory. */
export interface SettingsStore {
  load(): Promise<WalletSettings>;
  save(settings: WalletSettings): Promise<void>;
}

/**
 * Validate a user-supplied timeout. Rejects rather than silently clamping: a
 * user who typed 0 should be told the wallet will not accept it, not left
 * believing they disabled auto-lock when it quietly became 1 minute.
 */
export function assertValidAutoLockMinutes(minutes: number): void {
  if (!Number.isInteger(minutes)) {
    throw new Error('auto-lock timeout must be a whole number of minutes');
  }
  if (minutes < MIN_AUTO_LOCK_MINUTES || minutes > MAX_AUTO_LOCK_MINUTES) {
    throw new Error(
      `auto-lock timeout must be between ${MIN_AUTO_LOCK_MINUTES} and ${MAX_AUTO_LOCK_MINUTES} minutes`,
    );
  }
}

/**
 * Coerce a stored/candidate active-token denom to the persisted shape: a
 * non-empty string, or `null` for anything else (absent, empty, or the wrong
 * type). A corrupt denom therefore degrades to "no token yet" (the neutral
 * default skin) rather than skinning the wallet to a garbage denom.
 */
export function normalizeActiveTokenDenom(candidate: unknown): string | null {
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

/**
 * Reconstruct settings from whatever is on disk, field by field, falling back to
 * the default for anything missing or malformed. Each field recovers on its own,
 * so a corrupt timeout can never wipe the sticky active token (or vice versa):
 * the fail-safe direction is "auto-lock still happens" and "skin stays neutral".
 */
export function withDefaults(stored: unknown): WalletSettings {
  const raw = (stored as Partial<WalletSettings> | null | undefined) ?? {};
  let autoLockMinutes: number;
  try {
    assertValidAutoLockMinutes(raw.autoLockMinutes as number);
    autoLockMinutes = raw.autoLockMinutes as number;
  } catch {
    autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
  }
  return {
    autoLockMinutes,
    activeTokenDenom: normalizeActiveTokenDenom(raw.activeTokenDenom),
  };
}

/** `SettingsStore` backed by `chrome.storage.local`. */
export class ChromeSettingsStore implements SettingsStore {
  async load(): Promise<WalletSettings> {
    const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    return withDefaults(result[SETTINGS_STORAGE_KEY]);
  }

  async save(settings: WalletSettings): Promise<void> {
    assertValidAutoLockMinutes(settings.autoLockMinutes);
    await chrome.storage.local.set({
      // Rebuilt field by field, like the vault store: nothing a caller attached
      // to the object rides along into storage.
      [SETTINGS_STORAGE_KEY]: {
        autoLockMinutes: settings.autoLockMinutes,
        activeTokenDenom: normalizeActiveTokenDenom(settings.activeTokenDenom),
      },
    });
  }
}
