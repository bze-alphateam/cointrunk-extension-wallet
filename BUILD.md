# Building CoinTrunk Wallet from source

These are the step-by-step instructions to rebuild the exact extension package
submitted to the browser stores (Mozilla Add-ons, Chrome Web Store) from this
source code. The build is reproducible: the same source gives a byte-identical
`cointrunk-wallet-<version>.zip`, so the result can be checked with a single
SHA-256 comparison.

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

5. **Build** the extension into `dist/`:

   ```bash
   pnpm build
   ```

6. **Package** `dist/` into the store zip:

   ```bash
   pnpm package
   ```

   This writes `release/cointrunk-wallet-<version>.zip` and prints its SHA-256
   (also saved in `release/cointrunk-wallet-<version>.zip.sha256`).

## Verifying against the submitted package

Compare the SHA-256 printed in step 6 with the hash of the submitted file:

```bash
sha256sum cointrunk-wallet-<version>.zip   # macOS: shasum -a 256 <file>
```

The two hashes are identical. To compare the contents instead of the archive,
unzip the submitted package and diff it against `dist/`:

```bash
mkdir submitted && unzip -q cointrunk-wallet-<version>.zip -d submitted
diff -r submitted dist && echo "identical"
```

`pnpm package` writes the zip itself rather than calling a zip tool, so the
archive does not depend on the machine: entries are sorted, every timestamp is
fixed to 1980-01-01, no file permissions are stored and files are stored
uncompressed. See `scripts/package-extension.mjs`.

## Where the shipped code comes from

| Packaged file                                                    | Source                                            |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `manifest.json`                                                  | `manifest.json`, entry paths rewritten by crxjs   |
| `service-worker-loader.js`, `assets/index.ts-*.js`               | background service worker, `src/background/`      |
| `src/popup/index.html`, `assets/index.html-*.js`, `assets/*.css` | popup UI, `src/popup/` and the modules it imports |
| other `assets/*.js`                                              | modules shared by both entry points (`src/`)      |
| `icons/*`                                                        | copied unchanged from `public/icons/`             |

The build configuration is `vite.config.ts`. Source maps are not shipped.

## How reproducibility is checked

Every pull request and push runs the **Reproducible build** workflow
(`.github/workflows/reproducible.yml`). It builds and packages the checkout,
then creates the source package with `pnpm package:source`, unpacks it in a
different directory and follows the steps above from scratch. The workflow
fails unless both zips have the same SHA-256.

## Creating the release packages (maintainers)

From a clean checkout of the release commit:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm package          # release/cointrunk-wallet-<version>.zip (+ .sha256)
pnpm package:source   # release/cointrunk-wallet-<version>-source.zip
```

`pnpm package:source` is `git archive` of `HEAD`: it contains exactly the
committed files (this guide included) and nothing local, so commit first.
Upload the extension zip to the store and the source zip as the "source code"
of the submission.
