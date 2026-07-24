import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// Flat config (ESLint 9+). Prettier owns formatting; ESLint owns correctness.
export default tseslint.config(
  // Never lint build output or deps.
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Extension source runs in the browser / service-worker context.
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.webextensions,
      },
    },
  },

  // Build/tooling config files run in Node.
  {
    files: ['*.config.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Keep ESLint out of Prettier's way — must stay last.
  prettier,
);
