# CoinTrunk Wallet

A [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) browser-extension
wallet for the [BeeZee (BZE)](https://getbze.com/) network. Public brand:
**CoinTrunk** ([cointrunk.io](https://cointrunk.io)); internal codename **BusyWallet**
(Jira project `BUS`).

> **Status:** early scaffolding. This repo currently contains the project
> skeleton (TypeScript + tooling) and the Manifest V3 manifest with a background
> service worker stub. The extension is being built out ticket by ticket under
> Epic **BUS-1 — Project foundation & tooling**.

## Project structure

```
manifest.json        # MV3 manifest — describes the built extension (dist layout)
public/icons/        # placeholder toolbar/store icons (16/32/48/128)
src/background/       # background service worker source (index.ts)
```

The manifest paths (`background/index.js`, `icons/*.png`) refer to the **built**
extension. Until the bundler lands (BUS-11) there is no `dist/` yet; the intended
source → output mapping is:

| Source                  | Built output          |
| ----------------------- | --------------------- |
| `manifest.json`         | `dist/manifest.json`  |
| `src/background/index.ts` | `dist/background/index.js` |
| `public/icons/*`        | `dist/icons/*`        |

## Permissions

The extension requests the **minimal permission set** needed at each stage.
Right now the skeleton needs none, so `permissions` in `manifest.json` is empty.
Because `manifest.json` cannot carry inline comments, every permission added
later must be justified here (what it's for) as it is introduced.

Current permissions: _none._

## Requirements

- [Node.js](https://nodejs.org/) >= 22 (see [`.nvmrc`](.nvmrc))
- [pnpm](https://pnpm.io/) (managed via [corepack](https://nodejs.org/api/corepack.html) — the version is pinned in [`package.json`](package.json))

## Getting started

```bash
corepack enable        # one-time: lets pnpm run from the pinned version
pnpm install           # install dependencies
pnpm typecheck         # type-check the project
```

## Scripts

| Script           | Description                     |
| ---------------- | ------------------------------- |
| `pnpm typecheck` | Type-check the project (no emit) |

Build tooling, linting, and the extension bundle are added in subsequent
tickets (BUS-11, BUS-12, …).

## License

TBD.
