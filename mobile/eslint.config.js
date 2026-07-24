// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'expo-env.d.ts'],
  },
  {
    // eslint-plugin-import's module-resolution rules pull in the native
    // `unrs-resolver` binding (via eslint-import-resolver-typescript). That
    // binding fails to load on machines without the MSVC runtime and adds
    // little value on top of TypeScript's own checks, so we disable the
    // resolution-dependent rules to keep lint deterministic across platforms.
    rules: {
      'import/namespace': 'off',
      'import/no-unresolved': 'off',
      'import/default': 'off',
      'import/export': 'off',
      'import/no-duplicates': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',

      // Enforce the global logging rule (CLAUDE.md "Log Management"): no raw
      // console anywhere. Telemetry must route through the logger seam
      // (src/lib/logger.ts), which emits structured JSON to stdout.
      'no-console': 'error',
    },
  },
  {
    // The logger seam is the ONE legitimate console choke point: its
    // consoleTransport writes the structured-JSON sink to stdout (the sink the
    // global rule mandates). Test files spy on / assert against console to
    // verify transport behavior.
    files: ['src/lib/logger.ts', '**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
]);
