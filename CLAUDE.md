# CoinTrunk Wallet — MV3 browser extension

Browser-extension wallet for the BeeZee (BZE) network, published under the **CoinTrunk**
brand (cointrunk.io). Talks to BZE nodes over their public REST and RPC endpoints.

## Stack

- **TypeScript** (strict), **pnpm** (version pinned via `packageManager` in `package.json`), Node per `.nvmrc`.
- Manifest V3 extension (`manifest.config.ts`) built with Vite + `@crxjs/vite-plugin`
  for Chrome and Firefox: background service worker + React popup.
- Chain access through `@cosmjs/{crypto,encoding,proto-signing}` and `cosmjs-types`.
- Tests: Vitest. Lint: ESLint (typescript-eslint). Format: Prettier.

## Layout

```
src/background/  # service worker: wires the keyring, chain services and signing
src/chain/       # chain clients, balances, token metadata, cached read layer
src/keyring/     # HD keys, encryption at rest, auto-lock, settings
src/popup/       # React popup UI and its token-branded skin
tests/           # Vitest unit tests
scripts/         # reproducible packaging scripts
docs/store/      # store listing, permissions, privacy and security docs
```

## Commands

- `pnpm install` — install deps (run `corepack enable` once first).
- `pnpm build` — Chrome + Firefox builds (`build:chrome`, `build:firefox`).
- `pnpm typecheck` — type-check with `tsc --noEmit`.
- `pnpm lint` and `pnpm format:check` — CI runs both; Prettier prefers double quotes.
- `pnpm test` — run unit tests (Vitest, `tests/*.test.ts`).
- `pnpm package` / `pnpm package:source` — reproducible store zip / source zip
  into `release/` (see `BUILD.md`; the build must stay reproducible, CI checks it).

## Conventions

- Keep MV3 permissions minimal; justify each one in `docs/store/permissions.md`.
