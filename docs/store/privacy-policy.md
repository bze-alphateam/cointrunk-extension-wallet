# CoinTrunk Wallet privacy policy

**Effective date:** 31 October 2026

CoinTrunk Wallet is a browser-extension wallet for the BeeZee (BZE) network. This
policy explains what the wallet does with your information. The short version:

- **It is non-custodial.** Your recovery phrase and keys are created on your
  device and never leave it. We never see them and cannot move your funds.
- **We collect no data.** There is no account to sign up for, no analytics, no
  telemetry, no crash reporting, no advertising, no cookies and no tracking.
  We have no server that receives anything from the wallet.
- **We sell nothing and share nothing**, because we have nothing to sell or
  share.

## What stays on your device

The wallet saves a few things in your browser's local extension storage
(`chrome.storage.local`), so your wallet is still there after the browser
restarts:

- **Your recovery phrase, encrypted** with the password you choose
  (PBKDF2-HMAC-SHA256 with 600,000 iterations, then AES-256-GCM), together with
  the non-secret values needed to decrypt it: a random salt, a random IV and the
  iteration count.
- **Your account's public details**: its BeeZee address, its derivation path
  and its label.
- **Your wallet settings**: the auto-lock timeout, your active token (the one
  whose skin the wallet wears), and
  whether the token switcher is turned on.

Your password, your private keys and an unencrypted copy of your recovery
phrase are never saved. While the wallet is unlocked, your keys exist only in
the extension's memory, and they are cleared when it locks.

None of this is synced to other devices or sent anywhere. If you remove the
extension, your browser deletes this storage, so keep your recovery phrase
backed up: it is the only way to restore your wallet, and we cannot recover it
for you.

## What goes over the network

To show your balance and send tokens, the wallet talks to public BeeZee network
nodes at `rest.getbze.com`, with `rest-1.getbze.com` and `rest-2.getbze.com` as
backups. These are the same public nodes the official BeeZee web apps use. The
wallet sends them only what each request needs:

- **Your public address**, to read your balances and your account number.
- **Token and pool identifiers**, to read public token details (name, symbol,
  decimals and on-chain branding colours) and network fee settings.
- **An unsigned draft of a transfer**, when you review a send, so the node can
  estimate the network fee. A draft without a signature cannot be executed.
- **The signed transaction**, only after you confirm a send.

A blockchain is public by design. Your address, your balances and every
transaction you send can be seen by anyone on the BeeZee network and in block
explorers, as with any BeeZee wallet. Like any server on the internet, the
nodes can see the IP address a request comes from. The wallet adds no cookies,
identifiers or tracking to these requests.

The wallet also leaves the network alone in other ways:

- Token skins use colours and a font choice that the token's creator published
  on the chain. The fonts are bundled inside the extension, so nothing is
  downloaded to display them, and token logos are not loaded from the internet.
- All of the wallet's code ships inside the extension. Nothing is downloaded
  and run later.
- The wallet does not read, change or talk to the websites you visit.

If you choose **View on block explorer** after a send, your browser opens
`explorer.getbze.com` in a new tab with that transaction's hash in the address.
That page is an ordinary website you visit.

## What we do not do

- We do not ask for your name, email address or any other personal details.
- We do not collect your browsing history or the content of web pages.
- We do not use analytics, telemetry, crash reporting, advertising or cookies.
- We do not sell, rent, share or transfer any data, and we do not use any data
  for advertising, profiling, creditworthiness or lending decisions.

## Permissions

The wallet asks for three browser permissions, used only on your device:
`storage` (to keep your encrypted wallet and settings), `alarms` (to run the
auto-lock timer) and `idle` (to lock the wallet when your screen locks). It
asks for no access to websites.

## Children

The wallet is not directed at children and collects no information from anyone.

## Changes to this policy

If the wallet's behaviour changes in a way that affects this policy, we will
update this page and its effective date in the same release. The full history
of this page is public in the
[repository](https://github.com/bze-alphateam/cointrunk-extension-wallet/commits/main/docs/store/privacy-policy.md).

## Contact

Questions about this policy or about the wallet's privacy are welcome as an
issue at
[github.com/bze-alphateam/cointrunk-extension-wallet/issues](https://github.com/bze-alphateam/cointrunk-extension-wallet/issues).
The wallet's source code is public in the same repository, so every statement
here can be checked against it.
