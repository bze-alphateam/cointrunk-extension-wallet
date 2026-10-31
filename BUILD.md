# Building CoinTrunk Wallet from source

These are the step-by-step instructions to rebuild the exact extension package
submitted to the browser stores (Mozilla Add-ons, Chrome Web Store) from this
source code. The build is reproducible: the same source gives byte-identical
packages, one per browser, so each can be checked with a single SHA-256
comparison:

| Store            | Package                                  |
| ---------------- | ---------------------------------------- |
| Mozilla Add-ons  | `cointrunk-wallet-<version>-firefox.zip` |
| Chrome Web Store | `cointrunk-wallet-<version>-chrome.zip`  |

The extension code is TypeScript + React, bundled and minified by
[Vite](https://vite.dev/) with
[`@crxjs/vite-plugin`](https://crxjs.dev/). Everything the build needs is in
this archive. All third-party code comes from the public npm registry at the
exact versions pinned in `pnpm-lock.yaml`.

## Build environment

| Tool    | Version                   | Where it is pinned                       |
| ------- | ------------------------- | ---------------------------------------- |
| OS      | Linux, macOS or Windows   | Reference builds run on Ubuntu 24.04 x64 |
| Node.js | **24.18.0**               | `.nvmrc`                                 |
| pnpm    | **11.6.0** (via corepack) | `packageManager` in `package.json`       |

No other tools, no network services and no environment variables are needed.
The build reads no `.env` file and embeds no secrets.

## Steps

1. **Install Node.js 24.18.0** from <https://nodejs.org/en/download> (or with a
   version manager, e.g. `nvm install 24.18.0 && nvm use 24.18.0`). Check it:

   ```bash
   node --version   # v24.18.0
   ```

2. **Enable pnpm** at the pinned version. Corepack ships with Node.js and reads
   the version from `package.json`:

   ```bash
   corepack enable
   pnpm --version   # 11.6.0
   ```

3. **Unpack the source** and enter it:

   ```bash
   unzip cointrunk-wallet-<version>-source.zip
   cd cointrunk-wallet-<version>-source
   ```

4. **Install the dependencies** exactly as locked:

   ```bash
   pnpm install --frozen-lockfile
   ```

5. **Build** the extension for both browsers, into `dist/firefox/` and
   `dist/chrome/`:

   ```bash
   pnpm build
   ```

6. **Package** each build into its store zip:

   ```bash
   pnpm package
   ```

   This writes `release/cointrunk-wallet-<version>-firefox.zip` and
   `release/cointrunk-wallet-<version>-chrome.zip` and prints the SHA-256 of
   each (also saved next to it, in `<zip>.sha256`).

## Verifying against the submitted package

Compare the SHA-256 printed in step 6 with the hash of the submitted file
(the Firefox package for Mozilla Add-ons):

```bash
sha256sum cointrunk-wallet-<version>-firefox.zip   # macOS: shasum -a 256 <file>
```

The two hashes are identical. To compare the contents instead of the archive,
unzip the submitted package and diff it against the matching build directory:

```bash
mkdir submitted && unzip -q cointrunk-wallet-<version>-firefox.zip -d submitted
diff -r submitted dist/firefox && echo "identical"
```

`pnpm package` writes the zip itself rather than calling a zip tool, so the
archive does not depend on the machine: entries are sorted, every timestamp is
fixed to 1980-01-01, no file permissions are stored and files are stored
uncompressed. See `scripts/package-extension.mjs`.

## Where the shipped code comes from

Both packages hold the same files and the same bundled code; only
`manifest.json` differs between them (see below).

| Packaged file                                                    | Source                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `manifest.json`                                                  | `manifest.json` via `manifest.config.ts`, entry paths rewritten by crxjs |
| `service-worker-loader.js`, `assets/index.ts-*.js`               | background script, `src/background/`                                     |
| `src/popup/index.html`, `assets/index.html-*.js`, `assets/*.css` | popup UI, `src/popup/` and the modules it imports                        |
| other `assets/*.js`                                              | modules shared by both entry points (`src/`)                             |
| `icons/*`                                                        | copied unchanged from `public/icons/`                                    |
| `assets/*-latin-*-normal-*.woff2`                                | brand fonts, from the pinned `@fontsource/*` deps                        |
| `licenses/FONTS.txt`                                             | copied unchanged from `public/licenses/`                                 |

The build configuration is `vite.config.ts`: `pnpm build` runs it once per
browser (`vite build` for Chrome, `vite build --mode firefox` for Firefox).
Source maps are not shipped.

The Firefox `manifest.json` is the Chrome one with two changes, made in
`manifest.config.ts`: the background module is listed under
`background.scripts` (Firefox runs it as an event page) instead of
`background.service_worker`, and `browser_specific_settings` adds the add-on id
and the data collection declaration (`required: ["none"]`: the extension
collects no data).

## How reproducibility is checked

Every pull request and push runs the **Reproducible build** workflow
(`.github/workflows/reproducible.yml`). It builds and packages the checkout,
then creates the source package with `pnpm package:source`, unpacks it in a
different directory and follows the steps above from scratch. The workflow
fails unless each browser's zip has the same SHA-256 in both builds.

## Creating the release packages (maintainers)

From a clean checkout of the release commit:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm package          # release/cointrunk-wallet-<version>-{chrome,firefox}.zip (+ .sha256)
pnpm package:source   # release/cointrunk-wallet-<version>-source.zip
```

`pnpm package:source` is `git archive` of `HEAD`: it contains exactly the
committed files (this guide included) and nothing local, so commit first.
Upload the `-firefox.zip` to Mozilla Add-ons with the source zip as the
"source code" of the submission, and the `-chrome.zip` to the Chrome Web
Store.
