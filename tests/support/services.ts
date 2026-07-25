/**
 * Shared test doubles for the background collaborators. Not a `*.test.ts`, so
 * Vitest does not collect it — it is imported by the suites that need it.
 */

import type { Keyring } from '../../src/keyring/keyring';
import type { KeyringServices } from '../../src/keyring/messages';
import {
  assertValidAutoLockMinutes,
  DEFAULT_SETTINGS,
  type SettingsStore,
  type WalletSettings,
} from '../../src/keyring/settings';

/** In-memory `SettingsStore`, validating on save exactly like the chrome one. */
export class MemorySettingsStore implements SettingsStore {
  constructor(public settings: WalletSettings = DEFAULT_SETTINGS) {}

  load = async (): Promise<WalletSettings> => this.settings;

  save = async (settings: WalletSettings): Promise<void> => {
    assertValidAutoLockMinutes(settings.autoLockMinutes);
    this.settings = { autoLockMinutes: settings.autoLockMinutes };
  };
}

/** Bundle a keyring with a fresh settings store for `handleKeyringRequest`. */
export function services(keyring: Keyring, settings = new MemorySettingsStore()): KeyringServices {
  return { keyring, settings };
}
