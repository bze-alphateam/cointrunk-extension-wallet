import manifest from './manifest.json';

// One source manifest (manifest.json, Chrome-shaped) and one derived variant per
// browser. vite.config.ts builds each target from `manifestFor(target)`, and the
// manifest tests check both variants, so neither browser gets keys meant for the
// other.

export type BuildTarget = 'chrome' | 'firefox';

export const BUILD_TARGETS: readonly BuildTarget[] = ['chrome', 'firefox'];

// The add-on id Mozilla knows the extension by. It is fixed by the first AMO
// upload and can never change after that.
export const GECKO_ID = 'wallet@cointrunk.io';

/**
 * Firefox block: the add-on id plus the data collection declaration AMO requires
 * of new add-ons. `data_collection_permissions` is honoured from Firefox 140 on
 * desktop and 142 on Android, hence the minimum versions.
 */
const browserSpecificSettings = {
  gecko: {
    id: GECKO_ID,
    strict_min_version: '140.0',
    data_collection_permissions: {
      required: ['none'],
    },
  },
  gecko_android: {
    strict_min_version: '142.0',
  },
};

// Firefox MV3 runs the background as an event page, not a service worker: the
// same module goes under `background.scripts`.
const { service_worker: serviceWorker, ...background } = manifest.background;

/** The Firefox manifest: manifest.json with the background and gecko changes. */
export const firefoxManifest = {
  ...manifest,
  background: { ...background, scripts: [serviceWorker] },
  browser_specific_settings: browserSpecificSettings,
};

/** The manifest for one browser target. Chrome gets manifest.json unchanged. */
export function manifestFor(target: BuildTarget) {
  return target === 'firefox' ? firefoxManifest : manifest;
}
