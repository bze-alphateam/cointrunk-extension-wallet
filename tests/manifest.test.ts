/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';
import { BUILD_TARGETS, GECKO_ID, firefoxManifest, manifestFor } from '../manifest.config';
import permissionsDoc from '../docs/store/permissions.md?raw';

// Every permission the manifest requests must be listed here AND justified in
// docs/store/permissions.md (the Chrome Web Store dashboard text). Adding one
// without documenting it is a store-review risk, so the suite fails until both
// places agree.
const DOCUMENTED_PERMISSIONS: string[] = [
  // Auto-lock on inactivity (BUS-18).
  'alarms',
  // Lock on OS screen lock / sleep (BUS-50).
  'idle',
  // Encrypted vault + settings in chrome.storage.local (BUS-17, BUS-18).
  'storage',
];

// `chrome.*` namespaces an extension may call without declaring a permission.
// Any other namespace the source calls must be requested in the manifest — so
// a new API forces a deliberate permission (and justification) decision.
const UNGATED_NAMESPACES = new Set(['runtime', 'i18n', 'action', 'extension']);

const sourceFiles = import.meta.glob<string>('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The `chrome.<namespace>` APIs the extension source calls (comments ignored). */
function chromeNamespacesUsedInSource(): Set<string> {
  const used = new Set<string>();
  for (const source of Object.values(sourceFiles)) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const match of code.matchAll(/\bchrome\.([a-zA-Z]+)\b/g)) {
      used.add(match[1]);
    }
  }
  return used;
}

describe('MV3 manifest invariants', () => {
  it('declares Manifest V3 with a name and a numeric version', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toMatch(/^\d+(\.\d+)*$/);
  });

  it('registers the background service worker as a module', () => {
    expect(manifest.background.service_worker).toBe('src/background/index.ts');
    expect(manifest.background.type).toBe('module');
  });

  it('opens the popup from the toolbar action', () => {
    expect(manifest.action.default_popup).toBe('src/popup/index.html');
    expect(manifest.action.default_title).toBeTruthy();
  });

  it('ships a full icon set', () => {
    expect(Object.keys(manifest.icons)).toEqual(['16', '32', '48', '128']);
  });

  it('requests only documented permissions', () => {
    expect(manifest.permissions).toEqual(DOCUMENTED_PERMISSIONS);
  });

  it('justifies every requested permission in the store document', () => {
    for (const permission of manifest.permissions) {
      expect(permissionsDoc).toContain(`### \`${permission}\``);
    }
  });

  // BUS-43: chrome.storage was used for the vault but never declared, which
  // leaves `chrome.storage` undefined at runtime. Tie the manifest to the code
  // in both directions: every gated API used is requested, and every requested
  // permission is used (the minimal-set audit).
  it('requests a permission for every gated chrome.* API the source calls', () => {
    const gated = [...chromeNamespacesUsedInSource()].filter((ns) => !UNGATED_NAMESPACES.has(ns));
    expect(gated.length).toBeGreaterThan(0);
    for (const namespace of gated) {
      expect(manifest.permissions).toContain(namespace);
    }
  });

  it('requests no permission the source does not use', () => {
    const used = [...chromeNamespacesUsedInSource()];
    for (const permission of manifest.permissions) {
      expect(used).toContain(permission);
    }
  });

  it('requests no host access and no CSP override (no remote code)', () => {
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest).not.toHaveProperty('content_security_policy');
  });

  // BUS-15 AC4 / Security Model: the mnemonic must never be exposed to the page
  // context. With no content script and nothing web-accessible, there is no
  // channel from a web page into the extension at all — the guarantee holds by
  // construction, not by discipline. The injected provider (a later epic) will
  // add a content script; when it does, it must keep the no-secrets rule and
  // this test must be revisited deliberately rather than silently deleted.
  it('exposes no page-context surface (no content scripts, nothing web-accessible)', () => {
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest).not.toHaveProperty('web_accessible_resources');
    expect(manifest).not.toHaveProperty('externally_connectable');
  });
});

// One source manifest, one variant per browser (manifest.config.ts). Firefox MV3
// has no background service worker and AMO requires the gecko block; Chrome
// warns on `browser_specific_settings`, so it must stay out of the Chrome build.
describe('per-browser manifests', () => {
  it('builds Chrome from manifest.json unchanged', () => {
    const chrome = manifestFor('chrome');
    expect(chrome).toEqual(manifest);
    expect(chrome).not.toHaveProperty('browser_specific_settings');
    expect(chrome.background).not.toHaveProperty('scripts');
  });

  it('runs the Firefox background as a module event page, not a service worker', () => {
    expect(manifestFor('firefox')).toBe(firefoxManifest);
    expect(firefoxManifest.background).toEqual({
      scripts: ['src/background/index.ts'],
      type: 'module',
    });
    expect(firefoxManifest.background).not.toHaveProperty('service_worker');
  });

  it('gives Firefox the add-on id and the AMO data collection declaration', () => {
    const { gecko, gecko_android: geckoAndroid } = firefoxManifest.browser_specific_settings;
    expect(gecko.id).toBe(GECKO_ID);
    expect(gecko.data_collection_permissions).toEqual({ required: ['none'] });
    // data_collection_permissions is honoured from Firefox 140 (desktop) / 142 (Android).
    expect(Number.parseFloat(gecko.strict_min_version)).toBeGreaterThanOrEqual(140);
    expect(Number.parseFloat(geckoAndroid.strict_min_version)).toBeGreaterThanOrEqual(142);
  });

  it('keeps every other key identical across browsers', () => {
    const shared = (m: object) => {
      const copy: Record<string, unknown> = { ...m };
      delete copy.background;
      delete copy.browser_specific_settings;
      return copy;
    };
    for (const target of BUILD_TARGETS) {
      expect(shared(manifestFor(target))).toEqual(shared(manifest));
    }
  });
});
