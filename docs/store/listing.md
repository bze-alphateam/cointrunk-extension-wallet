# Store listing copy

The text to paste into the Chrome Web Store dashboard (**Store listing** tab) and
the Firefox Add-ons (AMO) developer hub (**Describe add-on**). Icons, promo tiles
and the screenshot shot list are in [`graphics.md`](graphics.md); permission
justifications are in [`permissions.md`](permissions.md).

One rule shapes all of it: the listing presents **CoinTrunk Wallet** as the
product. The wallet re-skins itself to the active token's on-chain branding, so
the copy says plainly that a skin is decoration taken from public chain data, not
a sign that the token's project made or endorses the wallet. Listing graphics and
captions always use CoinTrunk's own brand, never a token's.

## Name

```text
CoinTrunk Wallet
```

16 characters. Same in both stores; it comes from `name` in `manifest.json`
(Chrome limit 75, AMO limit 50).

## Summary

Chrome shows the manifest `description` as the summary (132 characters at most),
so `manifest.json` carries this text:

```text
A wallet for the BeeZee (BZE) network. Send and receive BZE and tokens, in skins drawn from each token's on-chain branding.
```

123 characters.

AMO takes a separate summary of up to 250 characters, which leaves room for the
identity line:

```text
CoinTrunk Wallet is a browser wallet for the BeeZee (BZE) network. Send and receive BZE and community tokens. The wallet takes on the colours of the token you use, from its public on-chain branding, and is always CoinTrunk Wallet underneath.
```

241 characters.

## Description

Paste the same text into both stores. Chrome renders it as plain text (line
breaks kept, no Markdown), so the bullets are `•` characters; AMO shows it the
same way.

```text
CoinTrunk Wallet is a browser-extension wallet for the BeeZee (BZE) network. It lives in your toolbar and keeps everyday payments simple: check your balance, send tokens, and receive them with a QR code.

WHAT YOU CAN DO
• Create a new wallet (24-word recovery phrase) or import one you already have.
• See the balance of your active token as soon as you open the wallet.
• Send BZE and BeeZee community tokens, and receive them by address or QR code.
• Copy your address in one click.
• Switch between the tokens you hold (optional, off by default).
• Get a heads-up when the token you are using cannot pay network fees.
• Lock the wallet yourself, after a period of inactivity you choose, or automatically when your computer's screen locks.

TOKEN SKINS: WHY THE WALLET CHANGES COLOUR
On BeeZee, a token's creator can publish branding for it on the chain: colours and a font choice. CoinTrunk Wallet reads that public branding and dresses itself in the colours of the token you are using, so your favourite community token feels at home. The token's name and logo come from the chain's public token metadata. BZE has its own built-in look, and tokens without branding use CoinTrunk's neutral default.

A skin is decoration only:
• The wallet is always CoinTrunk Wallet, whatever colours it wears.
• A token's branding does not mean that token's project made, endorses or runs this wallet.
• Token creators get no access to your wallet, your keys or your funds. Their branding changes how the wallet looks, never what it does.
• Anyone can create and brand a token on BeeZee. A familiar name or logo is not proof of who issued a token, so check the token before you trust it.

SECURITY
CoinTrunk Wallet is non-custodial: your recovery phrase is created on your device, encrypted with your password, and never leaves it. Transactions are signed on your device. We never see your keys and cannot move your funds. The wallet locks itself when you step away, and all of its code ships inside the extension.

PERMISSIONS
CoinTrunk Wallet asks for three permissions, none of which shows an install warning: storage (your encrypted wallet and settings), alarms (the auto-lock timer) and idle (locking when your screen locks). It has no access to the websites you visit and runs no remote code.

OPEN SOURCE
The code is public at https://github.com/bze-alphateam/cointrunk-extension-wallet, and the store package can be rebuilt byte-for-byte from it.
```

The permissions paragraph restates [`permissions.md`](permissions.md); if the
manifest's permissions change, update both.

## Promo text

Neither store has a free-text promo field: the promo copy appears on the promo
tiles (Chrome only). Tile copy, kept short as Chrome asks:

- Headline: `CoinTrunk Wallet`
- Line: `Your wallet for the BeeZee network`

Layout and sizes are in [`graphics.md`](graphics.md#promo-tiles).

## Category

- **Chrome Web Store:** primary category **Tools** (Productivity group). Wallet
  extensions are commonly listed there. The dashboard's category list changes
  from time to time, so confirm it in the dropdown.
- **Firefox AMO:** **Other** (AMO allows two; one is enough). Avoid **Privacy &
  Security**: the wallet is not a privacy or security tool, and the category
  invites reviewers and users to read it as one.

## Other listing fields

- **Language:** English.
- **Homepage URL:** `https://cointrunk.io`
- **Support URL:** `https://github.com/bze-alphateam/cointrunk-extension-wallet/issues`
  until a dedicated support page exists.
- **Privacy policy URL:**
  `https://github.com/bze-alphateam/cointrunk-extension-wallet/blob/main/docs/store/privacy-policy.md`
  (the public policy, [`privacy-policy.md`](privacy-policy.md)). The rest of the
  privacy answers are in [`privacy-declarations.md`](privacy-declarations.md).
- **Tags (AMO):** `wallet`, `beezee`, `bze`, `cosmos`, `crypto`.
- **Mature content (Chrome):** off.

## Before submitting

- Fill in the privacy sections from
  [`privacy-declarations.md`](privacy-declarations.md).
- Capture the screenshots and produce the promo tiles listed in
  [`graphics.md`](graphics.md).
- Upload everything in each store dashboard (BUS-46).
