import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

// Vite + @crxjs/vite-plugin build the Manifest V3 extension into dist/.
// crxjs reads manifest.json, bundles the referenced source entry points
// (e.g. the background service worker at src/background/index.ts) and rewrites
// the manifest paths in the output. `pnpm dev` runs it with HMR; `pnpm build`
// produces the loadable dist/.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
