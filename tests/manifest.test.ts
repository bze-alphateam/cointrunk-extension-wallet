import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';

// Every permission the manifest requests must be listed here AND justified in
// the README "Permissions" section. Adding one without documenting it is a
// store-review risk, so the suite fails until both places agree.
const DOCUMENTED_PERMISSIONS: string[] = [
  // Auto-lock on inactivity (BUS-18) — see the README "Permissions" table.
  'alarms',
];

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
