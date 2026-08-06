import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Node, not the browser: the Cloud Functions codebase (ESM, Node 20) and
    // the local dev proxy use process/console/etc. Without this they report
    // no-undef on every one of those, which is why `npm run lint` has always
    // been noisy here and is marked continue-on-error in CI. Flat config's
    // default sourceType ("module") already parses both import/export and
    // any lingering require()/module.exports, so no sourceType override is
    // needed here.
    files: ['functions/**/*.js', 'server.js', 'vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // The service workers in public/ run in a ServiceWorkerGlobalScope, not a
    // window: importScripts, clients and skipWaiting are all globals there, and
    // `firebase` is injected by the compat script the FCM worker importScripts.
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, firebase: 'readonly' },
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['public/**/*.js'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
