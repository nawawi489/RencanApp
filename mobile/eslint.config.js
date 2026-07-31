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
    // Guard against a web-only styling bug class (regression fixed in PR #232).
    //
    // Under NativeWind v5 preview (react-native-css), `className` is ONLY
    // processed by the wrapped components exported from
    // 'react-native-css/components'. If a styling-capable component is imported
    // from plain 'react-native' instead, its `className` is silently dropped on
    // web — the element renders with default styles and nothing errors. The
    // jest-expo preset renders the native tree (no className->CSS pass), so this
    // bug is invisible to the test suite; only a static guard catches it.
    //
    // We restrict ONLY the className-heavy primitives. Components that don't take
    // className, or that are legitimately consumed as react-native primitives
    // (ActivityIndicator, FlatList, SectionList, Modal, KeyboardAvoidingView,
    // Platform, Dimensions, StyleSheet, Animated, ...), are intentionally left
    // out to avoid false positives. If one of the restricted components is
    // genuinely needed without className, use an inline
    // `// eslint-disable-next-line no-restricted-imports` with a reason.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: [
                'View',
                'Text',
                'TextInput',
                'Pressable',
                'ScrollView',
                'Image',
                'ImageBackground',
              ],
              message:
                "Impor komponen ber-className dari 'react-native-css/components' (NativeWind v5: className di-drop diam-diam di web bila diimpor dari 'react-native'). Lihat PR #232.",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests never render to web, so the className-drop bug above cannot occur in
    // them; test files freely import react-native primitives for rendering and
    // mocking. Turn the guard off here (mirrors the no-console test override).
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
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
