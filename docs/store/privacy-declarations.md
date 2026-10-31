# Store privacy declarations

Ready-to-paste answers for the privacy sections of both stores: the Chrome Web
Store **Privacy practices** tab and the Firefox Add-ons (AMO) data-collection
declaration. The public privacy policy they point to is
[`privacy-policy.md`](privacy-policy.md). The data facts behind every answer are
in [`security.md`](security.md#privacy-disclosure-facts). If the wallet's
behaviour changes, update all three in the same change.

**Privacy policy URL** (both stores):

```text
https://github.com/bze-alphateam/cointrunk-extension-wallet/blob/main/docs/store/privacy-policy.md
```

The repository is public, so the GitHub page of the file on `main` is the
policy's public URL. It stays valid as long as the file keeps its path.

## The answer in one line

CoinTrunk Wallet is non-custodial and collects no user data: it has no backend,
no account system, no analytics and no telemetry. It stores the user's wallet
encrypted on the device, and it sends only public chain queries and the
transactions the user confirms to public BeeZee nodes.

## Chrome Web Store: Privacy practices tab

The tab has four parts. Fill them in this order.

### Single purpose

Paste into **Single purpose description**:

```text
CoinTrunk Wallet is a non-custodial wallet for the BeeZee (BZE) blockchain. It lets the user create or import a wallet, see the balance of their tokens, and send and receive BZE and BeeZee tokens. The wallet's look follows the active token's public on-chain branding.
```

### Permission justifications

One field per requested permission. The text for each is in
[`permissions.md`](permissions.md), the single source of truth that
`tests/manifest.test.ts` checks against `manifest.json`. Paste the body of each
section (the paragraph, without the "Code:" line):

| Dashboard field                | Paste from                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `alarms` justification         | [`permissions.md` → `alarms`](permissions.md#alarms)                                                            |
| `idle` justification           | [`permissions.md` → `idle`](permissions.md#idle)                                                                |
| `storage` justification        | [`permissions.md` → `storage`](permissions.md#storage)                                                          |
| Host permission justification  | Not shown: the manifest requests no host permissions                                                            |
| **Are you using remote code?** | **No, I am not using remote code.** Justification: [`permissions.md` → Remote code](permissions.md#remote-code) |

### Data usage

Question: **What user data do you plan to collect from users now or in the
future?** Leave every box unticked:

| Category                            | Answer        | Why                                                                                                                     |
| ----------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | Not collected | No name, email, address or ID is ever asked for. There is no account system.                                            |
| Health information                  | Not collected | None handled.                                                                                                           |
| Financial and payment information   | Not collected | No card or bank data. Balances are public chain data read from public nodes. See the [judgement call](#judgement-call). |
| Authentication information          | Not collected | The wallet password only decrypts the local vault on the device. It is never stored or sent.                            |
| Personal communications             | Not collected | None handled. Sends carry an empty memo.                                                                                |
| Location                            | Not collected | No location API is used and no location is stored or sent. Nodes see the connecting IP, like any server.                |
| Web history                         | Not collected | The extension has no host permissions, content scripts or tabs access.                                                  |
| User activity                       | Not collected | No analytics, click tracking or keystroke logging. The only input is what the user types into the wallet itself.        |
| Website content                     | Not collected | The extension never reads web pages.                                                                                    |

### Limited Use certifications

Tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the
      approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my
      item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for
      lending purposes.

All three are true trivially: the developer receives no user data at all.

### Privacy policy

Paste the privacy policy URL from the top of this page into **Privacy
policy URL**.

## Firefox Add-ons (AMO)

### Manifest declaration

Since 3 November 2025 every new extension submitted to AMO must declare its
data collection in the manifest, through Firefox's built-in data consent. A
wallet that collects nothing declares `none`, the only value allowed on its
own:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "wallet@cointrunk.io",
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```

Firefox for desktop 140+ and Firefox for Android 142+ show the declaration in
the install prompt and in about:addons (**Permissions and data**). With
`none`, older versions need no custom consent screen, since there is nothing to
consent to.

**Where it ships.** The block is only in the Firefox build. `manifest.json` is
the Chrome manifest. `manifest.config.ts` derives the Firefox one from it: it
adds `browser_specific_settings` (id `wallet@cointrunk.io`, minimum Firefox 140
on desktop and 142 on Android, and the `none` declaration above) and moves the
background module to `background.scripts`. `tests/manifest.test.ts` checks
that the Firefox manifest carries the declaration and that the Chrome manifest
never gets the block. Upload `cointrunk-wallet-<version>-firefox.zip` to AMO
(see [`BUILD.md`](../../BUILD.md)).

### Listing questions

The AMO developer hub asks these when you submit or edit the listing:

| Field                                            | Answer                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Privacy policy                                   | Yes: paste the full text of [`privacy-policy.md`](privacy-policy.md), or the URL where a URL is asked for |
| Does the add-on collect or transmit data?        | No user data is collected. Matches `data_collection_permissions: {required: ["none"]}`                    |
| Requires payment, non-free services or software? | No                                                                                                        |
| Source code (for reviewers)                      | The source package and steps in [`BUILD.md`](../../BUILD.md)                                              |

## Judgement call

Both stores define data handling broadly, and neither addresses blockchain
wallets directly. A wallet necessarily sends some data off the device: the
user's public address (to read balances), an unsigned draft of a send (to
estimate the fee) and the signed transaction (after the user confirms), all to
public BeeZee nodes. The answers above treat these as **not collected**,
because:

- they go to the public BeeZee network nodes that serve every BeeZee wallet and
  app, not to a backend of the wallet's own;
- the data is already public on the blockchain, or is published there at the
  user's explicit request;
- nothing personal (no name, email, IP-derived location or browsing data) is
  attached.

A reviewer may read transaction data as **Financial and payment information**
(Chrome) or `financialAndPaymentInfo` (Firefox). If a store asks for it, the
honest fallback is to tick that one category as used only for the wallet's
single purpose, never sold or transferred, and to keep the three Limited Use
certifications. The privacy policy already describes these requests either way.
