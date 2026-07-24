# CoinTrunk Wallet

A [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) browser-extension
wallet for the [BeeZee (BZE)](https://getbze.com/) network. Public brand:
**CoinTrunk** ([cointrunk.io](https://cointrunk.io)); internal codename **BusyWallet**
(Jira project `BUS`).

> **Status:** early scaffolding. This repo currently contains only the project
> skeleton (TypeScript + tooling). The extension itself is being built out
> ticket by ticket under Epic **BUS-1 — Project foundation & tooling**.

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
