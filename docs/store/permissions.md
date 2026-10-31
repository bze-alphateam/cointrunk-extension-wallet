# Store permission justifications

The text to paste into the **Privacy practices** tab of the Chrome Web Store
developer dashboard, one field per requested permission, plus the host-permission
and remote-code answers. It is the single source of truth for why each entry in
`manifest.json` exists: `tests/manifest.test.ts` fails if a permission is
requested without a section here, or if the code calls a permission-gated
`chrome.*` API that the manifest does not declare.

Requested permissions: `alarms`, `idle`, `storage`. None of them triggers an
install-time permission warning in Chrome or Firefox.

## Permission justifications

### `alarms`

CoinTrunk Wallet locks itself after a period of inactivity that the user
configures (15 minutes by default). The lock timer is scheduled with
chrome.alarms because a Manifest V3 service worker is shut down when idle, which
would cancel an ordinary setTimeout and leave the wallet unlocked indefinitely.
The extension creates and clears one alarm for this timeout and uses alarms for
nothing else.

Code: `src/keyring/autolock.ts` (`chromeAlarmScheduler`) and the
`chrome.alarms.onAlarm` listener in `src/background/index.ts`.

### `idle`

CoinTrunk Wallet locks immediately when the operating system locks the screen or
goes to sleep, so the wallet is never left unlocked on an unattended computer.
It listens to chrome.idle.onStateChanged and acts only on the "locked" state;
plain input inactivity is left to the auto-lock timer. No idle data is stored or
sent anywhere.

Code: the `chrome.idle.onStateChanged` listener in `src/background/index.ts` and
`AutoLock.onIdleStateChanged` in `src/keyring/autolock.ts`.

### `storage`

CoinTrunk Wallet keeps the user's wallet on the user's own device: the recovery
phrase, encrypted with the user's password (PBKDF2 + AES-256-GCM), plus
non-secret account metadata and wallet settings such as the auto-lock timeout.
These are saved in chrome.storage.local so the wallet survives browser
restarts. The recovery phrase and private keys are never stored unencrypted, and
nothing is synced or sent off the device.

Code: `ChromeVaultStore` in `src/keyring/storage.ts` and `ChromeSettingsStore`
in `src/keyring/settings.ts`.

## Host permissions

None requested. The wallet reads public BeeZee chain data (balances, token
metadata and branding), simulates sends for their fee and broadcasts signed
transactions over the public BeeZee REST API (`rest.getbze.com` and its
`rest-1`/`rest-2` fallbacks, listed in `src/chain/client.ts`; the client also
lists `rpc.getbze.com` and its fallbacks, but no feature calls them yet). Those
nodes answer with
`Access-Control-Allow-Origin: *`, so the requests need no host access, and the
extension never reads or modifies web pages.

## Remote code

Dashboard answer: **No, I am not using remote code.**

All JavaScript ships inside the extension package. The manifest declares no
custom `content_security_policy`, so the Manifest V3 default policy applies,
which only allows scripts from the package and blocks `eval`. The source does
not use `eval`, `new Function`, string timers or remotely loaded scripts or
modules, and fonts are bundled rather than fetched (the six brand fonts are
woff2 files in the package, registered from `src/popup/brandFonts.ts`; no
remote stylesheets or font services). Responses from the chain
APIs, including token branding, are parsed as JSON data and never executed.

## Not requested

The audit also checked APIs that look as though they might need a permission
but do not:

- `chrome.runtime` messaging between the popup and the background service worker
  needs no permission.
- Copying an address in the popup uses `navigator.clipboard.writeText` from a
  user click, which needs no `clipboardWrite` permission.
- There are no content scripts, web-accessible resources or
  `externally_connectable` entries, so no web page can reach the extension.
