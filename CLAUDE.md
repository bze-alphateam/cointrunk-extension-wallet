# CoinTrunk Wallet — MV3 browser extension

Browser-extension wallet for the BeeZee (BZE) network. Public brand **CoinTrunk**
(cointrunk.io); internal codename **BusyWallet**.

- Jira project: `BUS` (BusyWallet) · GitHub: `bze-alphateam/cointrunk-extension-wallet`
- Lives under `bze-ecosystem/` because it targets the BZE chain, though it tracks
  its own Jira project (`BUS`) and Confluence space (`BusyWallet`).

## Stack

- **TypeScript** (strict), **pnpm** (version pinned via `packageManager` in `package.json`), Node >= 22 (`.nvmrc`).
- Manifest V3 extension: background service worker + popup UI. Bundler and UI
  framework are introduced in later Epic 1 tickets (BUS-11 / BUS-13).

## Layout

```
src/            # extension source (entry points added ticket by ticket)
tsconfig.json   # strict TS, noEmit (bundler owns emit)
```

## Commands

- `pnpm install` — install deps (run `corepack enable` once first).
- `pnpm typecheck` — type-check with `tsc --noEmit`.
- `pnpm test` — run unit tests (Vitest, `tests/*.test.ts`).

**Never run the extension on this VM** (VM-wide rule): build/typecheck/lint/test
only. Stefan loads the unpacked build in Chrome himself.

## Conventions

- One Jira ticket = one branch = one draft PR into the parent branch (see the
  `git-workflow` skill). Keep MV3 permissions minimal and documented inline.
