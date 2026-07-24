import { defineConfig } from 'vitest/config';

// Standalone Vitest config: tests run in plain Node and never go through the
// extension build pipeline, so the crxjs/react plugins from vite.config.ts are
// deliberately not loaded here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
