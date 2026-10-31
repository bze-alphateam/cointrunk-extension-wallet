# Store graphics

Icons, promo tiles and screenshots for the Chrome Web Store and Firefox Add-ons
(AMO). The listing text is in [`listing.md`](listing.md).

Every listing graphic shows **CoinTrunk Wallet's own brand**: the CoinTrunk
symbol, the CoinTrunk wordmark and CoinTrunk colours. A token skin may appear
only inside a screenshot of the wallet, with a caption that says it is a skin
(see [Screenshots](#screenshots)). Never put a token's logo or name on an icon or
promo tile.

## Icons

Source: the CoinTrunk symbol, `cointrunk/Symbol/248px.png` in the
[Official-BZEdge-Graphics](https://github.com/bze-alphateam/Official-BZEdge-Graphics)
repo. The extension icons in `public/icons/` were placeholders until BUS-44 and
are now drawn from the same symbol, so the toolbar icon and the store icon match.

| File                                                | Size    | Used for                                           |
| --------------------------------------------------- | ------- | -------------------------------------------------- |
| `public/icons/icon-16.png`                          | 16×16   | toolbar, favicon (manifest `icons` + `action`)     |
| `public/icons/icon-32.png`                          | 32×32   | toolbar on 2× displays                             |
| `public/icons/icon-48.png`                          | 48×48   | extensions page                                    |
| `public/icons/icon-128.png`                         | 128×128 | install dialog, Chrome Web Store (from the zip)    |
| `docs/store/assets/icons/chrome-store-icon-128.png` | 128×128 | Chrome dashboard **Store icon** upload             |
| `docs/store/assets/icons/firefox-amo-icon-128.png`  | 128×128 | AMO **Icon** upload (AMO scales it to 64 and 32)   |
| `docs/store/assets/icons/firefox-amo-icon-64.png`   | 64×64   | AMO, if the hub asks for an explicit 64 px version |
| `docs/store/assets/icons/firefox-amo-icon-32.png`   | 32×32   | AMO, if the hub asks for an explicit 32 px version |

All are PNG with a transparent background.

- **Chrome** wants a 128×128 PNG with 96×96 artwork and 16 px of transparent
  padding on every side. `icon-128.png` and `chrome-store-icon-128.png` follow
  that (they are the same image). The symbol has a black outer ring, so it reads
  on both light and dark backgrounds.
- **AMO** shows the icon at 64 and 32 px and recommends a square image without
  extra padding, so the AMO files fill the whole canvas.
- The 16/32/48 px icons fill the canvas too: at that size, padding would only
  shrink the mark.

To regenerate (Python 3 with Pillow; `SRC` is the 248 px symbol):

```python
from PIL import Image

mark = Image.open(SRC).convert('RGBA')


def full(n):
    return mark.resize((n, n), Image.LANCZOS)


def padded(n, art):
    canvas = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    canvas.alpha_composite(full(art), ((n - art) // 2, (n - art) // 2))
    return canvas


for n in (16, 32, 48):
    full(n).save(f'public/icons/icon-{n}.png', optimize=True)
padded(128, 96).save('public/icons/icon-128.png', optimize=True)
padded(128, 96).save('docs/store/assets/icons/chrome-store-icon-128.png', optimize=True)
for n in (128, 64, 32):
    full(n).save(f'docs/store/assets/icons/firefox-amo-icon-{n}.png', optimize=True)
```

## Promo tiles

Chrome only; AMO has no promo images.

| Tile    | Size     | Format     | Required?                                                                             |
| ------- | -------- | ---------- | ------------------------------------------------------------------------------------- |
| Small   | 440×280  | PNG or JPG | Optional, but listings without one are shown after listings that have one. Make it.   |
| Marquee | 1400×560 | PNG or JPG | Optional. Needed only to be featured in the store's marquee. Make it later if wanted. |

Tiles cannot be localized, so keep the text in English and minimal.

Content (both tiles):

- **Background:** a CoinTrunk colour, taken from the symbol's blue (the light
  centre to the dark edge of its gradient), or solid black. Full bleed, no border,
  no transparency.
- **Mark:** the CoinTrunk symbol, or the horizontal logo
  `cointrunk/Logo/White and Colored.svg` on a dark background
  (`Black and Colored.svg` on a light one), from Official-BZEdge-Graphics.
- **Text:** headline `CoinTrunk Wallet`, line `Your wallet for the BeeZee network`
  (from [`listing.md`](listing.md#promo-text)). Nothing else: no feature lists, no
  prices, no "#1" or "official" claims, and no token names or logos.
- **No screenshots** of the popup on the tiles. Chrome's guidance is that a tile
  should read at a glance; a shrunken screenshot does not.
- **Small tile layout:** symbol on the left at about 140 px, headline and line on
  the right. Keep everything 20 px or more from the edges, since the store may
  crop slightly.
- **Marquee layout:** the logo left of centre, headline and line beneath or
  beside it, generous empty space. Keep the logo and text inside the central
  1200×460 area.

Save the finished tiles as `docs/store/assets/promo/small-440x280.png` and
`docs/store/assets/promo/marquee-1400x560.png`.

## Screenshots

**These are captured by Stefan, not on the build VM** (the extension is never run
there). The shot list below says exactly what to capture.

### Sizes

| Store  | Size                            | Count                              | Format                                                           |
| ------ | ------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Chrome | 1280×800 (preferred) or 640×400 | 1 required, up to 5                | PNG (24-bit, no transparency) or JPG, square corners, full bleed |
| AMO    | 1280×800 (or any 1.6:1 size)    | no practical limit; use the same 5 | PNG or JPG                                                       |

Use **1280×800** for everything and upload the same five files to both stores.
On AMO, add each screenshot's caption as its description.

### How to capture

The popup is 320 px wide (CSS), too small to fill 1280×800 on its own. Frame it:

1. Load the release build (`pnpm package`, or the `cointrunk-chrome-<sha>` CI
   artifact; see the README) into a clean Chrome profile.
2. Capture the popup at **2× device pixel ratio**: on a Retina/HiDPI display,
   open the popup and take a window screenshot of it. Or open
   `chrome-extension://<id>/src/popup/index.html` in a tab, turn on DevTools'
   device toolbar at 320 px wide with DPR 2, and use **Capture screenshot**. The
   result is 640 px wide.
3. Place the capture on a 1280×800 canvas: CoinTrunk-blue or black background
   (as on the promo tiles), popup on the right, scaled so it is at most 720 px
   tall, with a soft shadow. Put the caption on the left in white, about 48 px
   bold, with the CoinTrunk symbol above it.
4. Export as PNG without an alpha channel (flatten), 1280×800 exactly.

### Data hygiene

- Use a **throwaway demo wallet** created for the screenshots. Never show a
  recovery phrase, not even the demo wallet's, and never a real account.
- Give the demo wallet a believable balance (for example 1,250 BZE) so the
  screens are not empty.
- **Branded token shots:** only use a token whose branding is ours to show (a
  token Stefan created with on-chain branding, on mainnet or testnet). Showing
  another project's token in a store screenshot would suggest that project is
  involved with the wallet, which is exactly what the listing must avoid.
- Captions describe what the screen does. No claims about security beyond what
  BUS-41's statement says.

### Shot list

| #   | Screen                                                                                                                                                 | Skin / mode                                   | Caption                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| 1   | **Home**: balance, shortened address, Send / Receive, Lock.                                                                                            | BZE skin, light mode                          | `Your BeeZee wallet, one click away`                   |
| 2   | **Home, twice, side by side**: the same demo wallet in the BZE skin (left) and in a branded token's skin (right). Frame both popups at the same scale. | BZE skin + our branded demo token, light mode | `Wears your token's colours. Always CoinTrunk Wallet.` |
| 3   | **Home with the token switcher open** (enable it in Settings first), listing BZE and the demo token, with the demo token selected.                     | branded demo token skin, light mode           | `Switch tokens, and the wallet re-skins to match`      |
| 4   | **Send**, with a recipient address and an amount filled in, before confirming.                                                                         | BZE skin, **dark mode**                       | `Send BZE and community tokens`                        |
| 5   | **Receive**: full address and QR code.                                                                                                                 | BZE skin, light mode                          | `Receive with your address or a QR code`               |

Shot 2 is the one that carries the identity message, so it must be in the set
even if the others change. The caption text is part of the image; keep it short
enough to read in the store's thumbnail.

Save the exports as `docs/store/assets/screenshots/01-home.png` …
`05-receive.png` (1280×800 PNG) so the next listing update starts from them.
