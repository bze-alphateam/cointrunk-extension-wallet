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
vite.config.ts       # Vite + @crxjs/vite-plugin build config
vitest.config.ts     # Vitest unit-test config (plain Node env)
tests/               # unit tests (*.test.ts)
public/icons/        # placeholder toolbar/store icons (16/32/48/128)
src/background/       # background service worker source (index.ts)
src/popup/           # toolbar popup (React): index.html, main.tsx, App.tsx
dist/                # build output (git-ignored) — the loadable extension
```

The build uses [Vite](https://vite.dev/) with
[`@crxjs/vite-plugin`](https://crxjs.dev/); the UI is built with
[React](https://react.dev/). The **source** `manifest.json` references source
files (e.g. `src/background/index.ts`, `src/popup/index.html`); crxjs bundles
them and rewrites the paths in the emitted `dist/manifest.json`. `public/`
assets are copied as-is, so the icons at `public/icons/*` end up at
`dist/icons/*`.

## Permissions

The extension requests the **minimal permission set** needed at each stage.
Because `manifest.json` cannot carry inline comments, every permission must be
justified here (what it's for) as it is introduced; `tests/manifest.test.ts`
fails if the manifest and this list disagree.

| Permission | Why it's needed                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alarms`   | Auto-lock on inactivity (BUS-18). An MV3 service worker is evicted after ~30 s idle, taking any `setTimeout` with it, so a timer-based auto-lock would never fire. `chrome.alarms` is owned by the browser and survives eviction. |

Note that `chrome.storage.local` — where the encrypted vault lives — needs **no**
permission for an extension's own storage area, so it does not appear above.

## Requirements

- [Node.js](https://nodejs.org/) >= 22 (see [`.nvmrc`](.nvmrc))
- [pnpm](https://pnpm.io/) (managed via [corepack](https://nodejs.org/api/corepack.html) — the version is pinned in [`package.json`](package.json))

## Getting started

```bash
corepack enable        # one-time: lets pnpm run from the pinned version
pnpm install           # install dependencies
pnpm build             # build the extension into dist/
```

Then load it in Chrome: open `chrome://extensions`, enable **Developer mode**,
click **Load unpacked**, and select the `dist/` folder. Use `pnpm dev` for a
watch build with hot-reload while iterating.

## Scripts

| Script              | Description                       |
| ------------------- | --------------------------------- |
| `pnpm dev`          | Start Vite in watch mode with HMR |
| `pnpm build`        | Build the extension into `dist/`  |
| `pnpm typecheck`    | Type-check the project (no emit)  |
| `pnpm test`         | Run the unit tests (Vitest) once  |
| `pnpm test:watch`   | Run the tests in watch mode       |
| `pnpm lint`         | Lint with ESLint                  |
| `pnpm format`       | Format all files with Prettier    |
| `pnpm format:check` | Check formatting without writing  |

## Testing

Unit tests run with [Vitest](https://vitest.dev/) (`vitest.config.ts`, plain
Node environment — the extension build plugins are not involved). Tests live in
`tests/*.test.ts`; run them with `pnpm test`. The suite covers the MV3 manifest
invariants (manifest version, entry points, and that every requested permission
is documented — see [Permissions](#permissions)), the chain constants, and the
keyring: vault encryption, account generation and import, lock/unlock and
auto-lock.

## CI

[GitHub Actions](.github/workflows/ci.yml) runs `typecheck`, `lint`,
`format:check`, `test`, and `build` on every push and pull request; the job
fails if any step fails, turning the PR check red.

### Trying a PR build

Every pull-request run also uploads the built extension as downloadable
artifacts, so a change can be tried without building locally:

1. On the PR, open **Checks** (or the CI run) → the run's **Summary** page.
2. Under **Artifacts**, download `cointrunk-chrome-<short-sha>.zip` or
   `cointrunk-firefox-<short-sha>.zip` and unzip it.
3. **Chrome:** go to `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the unzipped folder.
   **Firefox:** go to `about:debugging#/runtime/this-firefox`, click **Load
   Temporary Add-on…**, and select the `manifest.json` inside the unzipped
   folder.

The two artifacts are currently built from the same output; Firefox-specific
manifest adjustments land in a later ticket.

Formatting is handled by [Prettier](https://prettier.io/) (`.prettierrc.json`);
linting by [ESLint](https://eslint.org/) flat config (`eslint.config.js`), with
`eslint-config-prettier` disabling rules that would conflict with Prettier.

## License

TBD.
