# CoinTrunk Wallet

A [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) browser-extension
wallet for the [BeeZee (BZE)](https://getbze.com/) network. Public brand:
**CoinTrunk** ([cointrunk.io](https://cointrunk.io)); internal codename **BusyWallet**
(Jira project `BUS`).

> **Status:** early scaffolding. This repo currently contains the project
> skeleton (TypeScript + tooling), the Manifest V3 manifest with a background
> service worker stub, and a Vite build that produces a loadable extension. It
> is being built out ticket by ticket under Epic **BUS-1 — Project foundation &
> tooling**.

## Project structure

```
manifest.json        # MV3 manifest (source) — references source entry points
vite.config.ts       # Vite + @crxjs/vite-plugin build config
public/icons/        # placeholder toolbar/store icons (16/32/48/128)
src/background/       # background service worker source (index.ts)
dist/                # build output (git-ignored) — the loadable extension
```

The build uses [Vite](https://vite.dev/) with
[`@crxjs/vite-plugin`](https://crxjs.dev/). The **source** `manifest.json`
references source files (e.g. `src/background/index.ts`); crxjs bundles them and
rewrites the paths in the emitted `dist/manifest.json`. `public/` assets are
copied as-is, so the icons at `public/icons/*` end up at `dist/icons/*`.

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
| `pnpm lint`         | Lint with ESLint                  |
| `pnpm format`       | Format all files with Prettier    |
| `pnpm format:check` | Check formatting without writing  |

## CI

[GitHub Actions](.github/workflows/ci.yml) runs `typecheck`, `lint`,
`format:check`, and `build` on every push and pull request; the job fails if any
step fails.

Formatting is handled by [Prettier](https://prettier.io/) (`.prettierrc.json`);
linting by [ESLint](https://eslint.org/) flat config (`eslint.config.js`), with
`eslint-config-prettier` disabling rules that would conflict with Prettier.

## License

TBD.
