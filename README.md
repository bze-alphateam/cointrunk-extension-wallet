# CoinTrunk Wallet

A [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) browser-extension
wallet for the [BeeZee (BZE)](https://getbze.com/) network. Public brand:
**CoinTrunk** ([cointrunk.io](https://cointrunk.io)); internal codename **BusyWallet**
(Jira project `BUS`).

> **Status:** early scaffolding. This repo currently contains the project
> skeleton (TypeScript + tooling), the Manifest V3 manifest with a background
> service worker stub, a Vite build that produces a loadable extension, and a
> minimal React popup. It is being built out ticket by ticket under Epic
> **BUS-1 — Project foundation & tooling**.

## Project structure

```
manifest.json        # MV3 manifest (source) — references source entry points
manifest.config.ts   # per-browser manifests derived from manifest.json
vite.config.ts       # Vite + @crxjs/vite-plugin build config
vitest.config.ts     # Vitest unit-test config (plain Node env)
tests/               # unit tests (*.test.ts)
public/icons/        # toolbar/store icons (16/32/48/128), CoinTrunk symbol
src/background/       # background service worker source (index.ts)
src/popup/           # toolbar popup (React): index.html, main.tsx, App.tsx
dist/                # build output (git-ignored): dist/chrome/, dist/firefox/
```

The build uses [Vite](https://vite.dev/) with
[`@crxjs/vite-plugin`](https://crxjs.dev/); the UI is built with
[React](https://react.dev/). The **source** `manifest.json` references source
files (e.g. `src/background/index.ts`, `src/popup/index.html`); crxjs bundles
them and rewrites the paths in the emitted `dist/<browser>/manifest.json`.
`public/` assets are copied as-is, so the icons at `public/icons/*` end up at
`dist/<browser>/icons/*`.

One source builds two extensions. `manifest.json` is the Chrome manifest;
`manifest.config.ts` derives the Firefox one from it by moving the background
module from `background.service_worker` to `background.scripts` (Firefox MV3
runs it as an event page) and adding `browser_specific_settings.gecko` (the
add-on id and the data collection declaration Mozilla requires). The Chrome
manifest never gets that block. Everything else, including the bundled code,
is the same in both builds.

## Permissions

The extension requests the **minimal permission set** it needs: `alarms`
(auto-lock timer), `idle` (lock on OS screen lock) and `storage` (the encrypted
vault and settings in `chrome.storage.local`). No host permissions, no content
scripts, no remote code.

Because `manifest.json` cannot carry inline comments, each permission is
justified in [`docs/store/permissions.md`](docs/store/permissions.md), written
as the text the Chrome Web Store dashboard asks for. `tests/manifest.test.ts`
fails if the manifest and that document disagree, if the code calls a
permission-gated `chrome.*` API the manifest does not request, or if the
manifest requests a permission the code never uses.

## Requirements

- [Node.js](https://nodejs.org/) >= 22 (see [`.nvmrc`](.nvmrc))
- [pnpm](https://pnpm.io/) (managed via [corepack](https://nodejs.org/api/corepack.html) — the version is pinned in [`package.json`](package.json))

## Getting started

```bash
corepack enable        # one-time: lets pnpm run from the pinned version
pnpm install           # install dependencies
pnpm build             # build both browsers into dist/chrome/ and dist/firefox/
```

Then load it in Chrome: open `chrome://extensions`, enable **Developer mode**,
click **Load unpacked**, and select the `dist/chrome/` folder. In Firefox, open
`about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and
select `dist/firefox/manifest.json`. Use `pnpm dev` for a
watch build with hot-reload while iterating.

## Scripts

| Script                | Description                                      |
| --------------------- | ------------------------------------------------ |
| `pnpm dev`            | Start Vite (Chrome build) in watch mode with HMR |
| `pnpm build`          | Build both browsers into `dist/<browser>/`       |
| `pnpm build:chrome`   | Build only Chrome into `dist/chrome/`            |
| `pnpm build:firefox`  | Build only Firefox into `dist/firefox/`          |
| `pnpm package`        | Zip each `dist/<browser>/` reproducibly          |
| `pnpm package:source` | Zip the committed source into `release/`         |
| `pnpm typecheck`      | Type-check the project (no emit)                 |
| `pnpm test`           | Run the unit tests (Vitest) once                 |
| `pnpm test:watch`     | Run the tests in watch mode                      |
| `pnpm lint`           | Lint with ESLint                                 |
| `pnpm format`         | Format all files with Prettier                   |
| `pnpm format:check`   | Check formatting without writing                 |

## Testing

Unit tests run with [Vitest](https://vitest.dev/) (`vitest.config.ts`, plain
Node environment — the extension build plugins are not involved). Tests live in
`tests/*.test.ts`; run them with `pnpm test`. The suite covers the MV3 manifest
invariants (manifest version, entry points, that every requested permission
is documented — see [Permissions](#permissions) — and the per-browser
differences), the chain constants, and the
keyring: vault encryption, account generation and import, lock/unlock and
auto-lock.

## Release packages

[`BUILD.md`](BUILD.md) is the step-by-step guide to rebuild the store package
from source (the instructions Mozilla's add-on review needs for bundled code).
The build is reproducible: `pnpm build && pnpm package` always produces
byte-identical `release/cointrunk-wallet-<version>-chrome.zip` and
`release/cointrunk-wallet-<version>-firefox.zip`, and `pnpm package:source`
produces the matching source archive.

## CI

[GitHub Actions](.github/workflows/ci.yml) runs `typecheck`, `lint`,
`format:check`, `test`, and `build` on every push and pull request; the job
fails if any step fails, turning the PR check red.

A separate [Reproducible build](.github/workflows/reproducible.yml) workflow
rebuilds the extension from the source package in a fresh directory, following
`BUILD.md`, and fails unless both zips' SHA-256 match the checkout build. On
pull requests it uploads the packages as the `cointrunk-release-<short-sha>`
artifact.

### Trying a PR build

Every pull-request run also uploads the built extension as downloadable
artifacts, so a change can be tried without building locally:

1. On the PR, open **Checks** (or the CI run) → the run's **Summary** page.
2. Under **Artifacts**, download `cointrunk-chrome-<short-sha>.zip` or
   `cointrunk-firefox-<short-sha>.zip` (the build for that browser) and unzip
   it.
3. **Chrome:** go to `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the unzipped folder.
   **Firefox:** go to `about:debugging#/runtime/this-firefox`, click **Load
   Temporary Add-on…**, and select the `manifest.json` inside the unzipped
   folder.

Formatting is handled by [Prettier](https://prettier.io/) (`.prettierrc.json`);
linting by [ESLint](https://eslint.org/) flat config (`eslint.config.js`), with
`eslint-config-prettier` disabling rules that would conflict with Prettier.

## License

TBD.
