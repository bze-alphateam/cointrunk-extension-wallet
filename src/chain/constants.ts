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
 * Default BIP-44 HD derivation path for the first BeeZee account:
 * `m / 44' / 118' / 0' / 0 / 0`.
 *
 * Matches CosmJS's default account index/change; later tickets may vary the
 * final segments for additional accounts.
 */
export const BZE_HD_PATH = `m/${BIP44_PURPOSE}'/${BZE_COIN_TYPE}'/0'/0/0`;
