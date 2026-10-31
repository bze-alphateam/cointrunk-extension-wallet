# Security and non-custodial statement

Public wording about how CoinTrunk Wallet protects users' funds, for the store
listings (Chrome Web Store, Firefox Add-ons) and the privacy disclosures. The
listing work and the privacy-disclosure work both copy from here, so the wording
stays the same everywhere. Every claim is backed by the shipped code. The
[as-built facts](#as-built-facts) section lists where; update it in the same
change as any code that alters one of them.

## Short statement

For the listing summary or a "Security" line, about 300 characters:

> CoinTrunk Wallet is non-custodial: your recovery phrase is created on your
> device, encrypted with your password, and never leaves it. We never see your
> keys and cannot move your funds. The wallet locks itself when you step away,
> and all of its code ships inside the extension.

## Full statement

For the listing description's security section and the privacy policy:

> **Your keys, your coins.** CoinTrunk Wallet is a non-custodial wallet for the
> BeeZee (BZE) network. Your recovery phrase is generated on your own device and
> stays there. It is never sent to us or to anyone else. We run no account
> system and no server that holds keys, so we cannot access, freeze or recover
> your funds.
>
> **Encrypted on your device.** The recovery phrase is stored only in encrypted
> form, protected by the password you choose. Your password stretches into an
> encryption key with PBKDF2-HMAC-SHA256 at 600,000 iterations, and the phrase is
> encrypted with AES-256-GCM, using your browser's built-in Web Crypto. Neither
> your password nor an unencrypted copy of the phrase is ever saved.
>
> **Unlocked only while you use it.** Your keys are decrypted into memory only
> while the wallet is unlocked. The wallet locks again after a period of
> inactivity (15 minutes by default, adjustable), as soon as your computer's
> screen locks or it goes to sleep, and whenever the browser closes the
> wallet's background process.
>
> **Isolated from websites.** CoinTrunk Wallet does not inject anything into web
> pages and exposes nothing to them, so a website has no way to reach your keys.
>
> **No remote code, no tracking.** All of the wallet's code ships inside the
> extension. Nothing is downloaded and run later. The wallet has no analytics or
> telemetry. It only talks to public BeeZee network nodes, to read balances and
> token information.
>
> **Back up your phrase.** Your recovery phrase is shown once, when you create
> the wallet. Write it down and keep it offline. It is the only way to restore
> your wallet. We cannot recover it for you, and anyone who has it can spend
> your funds.

## Privacy-disclosure facts

The data-handling facts behind the privacy disclosures, written as plain answers.

| Question | Answer |
| --- | --- |
| Is any personal data collected by the developer? | No. There is no backend, account system, analytics or telemetry. |
| What is stored on the device? | In `chrome.storage.local`: the encrypted recovery phrase with its non-secret encryption parameters (salt, IV, iteration count), the account's public address, HD path and label, and wallet settings (auto-lock timeout, active token, token-switching toggle). |
| Is anything stored unencrypted that could move funds? | No. The recovery phrase is stored only as ciphertext. The password and private keys are never stored. |
| What leaves the device? | Requests to public BeeZee nodes (`rest.getbze.com`, `rpc.getbze.com` and their `-1`/`-2` fallbacks) for chain data. These include the wallet's public address, which balance queries need. A public address is already visible on the blockchain. |
| Is data sold or shared with third parties? | No. Nothing is sent anywhere except those public chain queries. |
| Is data synced across devices? | No. `chrome.storage.sync` is not used. |
| Can the developer recover a lost password or phrase? | No. Recovery is only possible with the user's own recovery phrase. |

## As-built facts

Audited for BUS-41 against the wallet's security model, on the `main` branch as
of the BUS-33 merge.

| Claim | As built | Where |
| --- | --- | --- |
| Key derivation | PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte random salt, 32-byte key, native WebCrypto (`SubtleCrypto.deriveKey`). The derived key is a non-extractable `CryptoKey`. About 0.1 s per derivation, measured in Node 24 WebCrypto on the dev machine. | `PBKDF2_PARAMS` in `src/keyring/vault.ts`, `deriveAesKey` in `src/keyring/vault-crypto.ts` |
| Cipher | AES-256-GCM, fresh 12-byte IV per encryption, 128-bit tag, native WebCrypto | `AES_GCM_PARAMS`, `encryptVault` |
| Password check | Only a successful GCM decrypt (auth tag) proves the password. No password hash is stored. Errors are a generic `invalid password`. | `decryptMnemonic` |
| Vault format | Versioned, self-describing blob. A vault in an unknown format (version, KDF, hash, cipher or iteration count) is refused as `unsupported vault format` before any decrypt. | `assertSupportedVault` in `src/keyring/vault-crypto.ts`, `tests/vault-crypto.test.ts` |
| Ciphertext only at rest | The store rebuilds the vault field by field from a whitelist, so no extra field can be persisted. | `sanitizeVault` in `src/keyring/storage.ts` |
| Keys only in service-worker memory | Wallet status derives from the in-memory signer. Lock clears it, and a service-worker restart starts locked. | `Keyring` in `src/keyring/keyring.ts`, `src/background/index.ts` |
| Auto-lock | `chrome.alarms` timeout, 15 minutes by default (1 minute to 24 hours), reset on every popup request. Locks immediately on `chrome.idle` `locked`. | `src/keyring/autolock.ts`, `src/keyring/settings.ts` |
| One-time backup | Only the `createAccount` reply carries the mnemonic. No request re-reads it, import returns nothing secret, and the backup screen has no copy button. | `src/keyring/messages.ts`, `src/popup/screens/BackupPhrase.tsx` |
| No page surface | No content scripts, `web_accessible_resources` or `externally_connectable` in the manifest | `manifest.json`, `tests/manifest.test.ts` |
| No remote code | No `content_security_policy` override (MV3 default), no `eval` or `new Function`, bundled fonts, chain responses parsed as JSON only. Token logo URLs are read but not rendered. | `tests/manifest.test.ts`, [permissions.md](permissions.md#remote-code) |
| Secrets never logged | The only `console.log` calls are lifecycle lines in the service worker. Mnemonic validation errors name the position of a bad word, never the word itself. | `src/background/index.ts`, `assertValidMnemonic` in `src/keyring/account.ts` |
| Crypto libraries | Vault crypto: browser WebCrypto only. BIP39 and HD derivation: `@cosmjs/crypto` and `@cosmjs/proto-signing` 0.39.0, which wrap `@scure/bip39` 2.2.0, `@noble/curves` 2.2.0 and `@noble/hashes` 2.2.0. All are pure JS, bundled, with no WASM. Mnemonic entropy comes from `crypto.getRandomValues` (32 bytes, 24 words). | `package.json`, `pnpm-lock.yaml`, `src/keyring/account.ts` |

### Keep these statements true

- **Transaction signing.** On `main` today there is no local signing or
  broadcast: the send flow ends at a placeholder that rejects, and the unlocked
  signer is a stub that keeps no key material. The statements above are worded
  so they hold either way. When signing lands, the signer will keep the seed in
  service-worker memory while unlocked. The facts above then need re-checking,
  and statements that say "transactions are signed on your device" may only be
  added after that.
- **No audit claim.** Do not describe the wallet as "audited" or "certified".
  This is an internal review, not a third-party audit.
- **No guarantees.** Do not promise that funds "cannot be stolen". Malware on
  the user's computer or a leaked recovery phrase can still lose funds. The
  statements describe what the wallet does, not an outcome.
- Any change to the KDF parameters, the cipher, the stored fields, the network
  endpoints or the manifest surface must update this page in the same PR.
