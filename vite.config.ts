import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import { manifestFor, type BuildTarget } from './manifest.config';

// Vite + @crxjs/vite-plugin build the Manifest V3 extension, once per browser:
// `vite build` is the Chrome build into dist/chrome/, `vite build --mode
// firefox` the Firefox build into dist/firefox/ (`pnpm build` runs both).
// crxjs reads the target's manifest (manifest.config.ts), bundles the
// referenced source entry points (e.g. the background script at
// src/background/index.ts) and rewrites the manifest paths in the output.
// `pnpm dev` runs the Chrome build with HMR.
//
// The production build is reproducible (BUILD.md, checked by the "Reproducible
// build" workflow): output depends only on the source, the lockfile and the
// pinned Node/pnpm versions. Keep it that way: no timestamps, git hashes or
// machine paths injected via `define`, and no source maps in the store package.
export default defineConfig(({ mode }) => {
  const target: BuildTarget = mode === 'firefox' ? 'firefox' : 'chrome';
  return {
    plugins: [react(), crx({ manifest: manifestFor(target) as ManifestV3Export, browser: target })],
    build: {
      outDir: `dist/${target}`,
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
