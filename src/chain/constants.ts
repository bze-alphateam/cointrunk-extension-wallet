/**
 * BeeZee (BZE) chain constants.
 *
 * These pin how the wallet derives and renders BeeZee accounts, so every
 * key/account ticket (BUS-15, BUS-16, …) consumes them instead of re-deciding.
 *
 * Confirmed against two independent sources (BUS-14):
 *  - Chain source `bze-alphateam/bze` — `app/app.go` sets
 *    `AccountAddressPrefix = "bze"`, and `app/config.go` seals the Cosmos SDK
 *    config WITHOUT calling `SetCoinType`, so the SDK default coin type (118)
 *    applies. This is exactly what the live node runs.
 *  - Cosmos chain-registry `beezee/chain.json` — `bech32_prefix: "bze"`,
 *    `slip44: 118`, `chain_id: "beezee-1"`.
 */

/** Bech32 human-readable prefix for BeeZee account addresses (e.g. `bze1…`). */
export const BZE_BECH32_PREFIX = 'bze';

/**
 * SLIP-44 coin type for BeeZee. The chain does not override the Cosmos SDK
 * default, so it derives on the standard Cosmos coin type 118 (NOT a
 * BeeZee-specific type).
 */
export const BZE_COIN_TYPE = 118;

/** BIP-44 purpose field (hardened) — the standard `44'`. */
export const BIP44_PURPOSE = 44;

/** Chain ID of the BeeZee mainnet. */
export const BZE_CHAIN_ID = 'beezee-1';

/**
 * On-chain base ("micro") denomination of the native token, as the bank module
 * stores and returns it. Balances and amounts on the wire are always integers of
 * this unit.
 *
 * Confirmed against three sources (BUS-19):
 *  - Chain genesis (`bze-alphateam/bze` `genesis.json`) — staking `bond_denom`,
 *    mint `mint_denom` and gentx amounts are all `ubze`.
 *  - Cosmos `u`-prefix micro convention: `u` + symbol.
 *  - Frontend Keplr config (`bze-frontend-apps` `packages/ui-kit`) —
 *    `coinMinimalDenom: "ubze"`.
 */
export const BZE_BASE_DENOM = 'ubze';

/** Human-facing symbol for the native token (`coinDenom` in the Keplr config). */
export const BZE_DISPLAY_DENOM = 'BZE';

/**
 * Decimal places between the base denom and the display denom: `1 BZE = 10^6
 * ubze`. The chain ships no on-chain `denom_metadata` (genesis `denom_metadata`
 * is empty), so this is pinned from the `u`-micro convention and the frontend
 * Keplr config's `coinDecimals: 6` — the value every existing BZE app renders.
 */
export const BZE_DISPLAY_DECIMALS = 6;

/**
 * Default BIP-44 HD derivation path for the first BeeZee account:
 * `m / 44' / 118' / 0' / 0 / 0`.
 *
 * Matches CosmJS's default account index/change; later tickets may vary the
 * final segments for additional accounts.
 */
export const BZE_HD_PATH = `m/${BIP44_PURPOSE}'/${BZE_COIN_TYPE}'/0'/0/0`;

/**
 * Gas limit for a v1 native `bank` Send. A single-message send comfortably fits
 * under 200k gas on a Cosmos SDK chain; v1 uses this fixed limit rather than
 * simulating gas (dynamic simulation is a later data-layer concern, Epic 4).
 */
export const DEFAULT_SEND_GAS = '200000';

/**
 * Flat fee for a v1 send, in base units (`ubze`). `200000` gas at a
 * `0.01 ubze` minimum gas price is `2000 ubze` (0.002 BZE) — a conservative,
 * user-visible default shown on the review step. It is deliberately a constant,
 * not a chain query: like the balance and broadcast, real fee/gas estimation is
 * wired in Epic 4; this keeps the review step honest and complete until then.
 */
export const DEFAULT_SEND_FEE_AMOUNT = '2000';
