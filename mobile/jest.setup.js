// Jest setup: mock modul native yang tidak tersedia di Node test runner.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo dipakai `installOnlineManager` (dijalankan saat root _layout dimuat). Mock resmi
// menghindari akses native module di runner + memberi `addEventListener` no-op yang aman.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

// Safe-area (P0-1): banyak surface memakai `useSafeAreaInsets` (Screen, AppHeader,
// BottomSheet, picker sheets, komposer chat). Hook resmi MELEMPAR bila tak ada
// `SafeAreaProvider` di tree — test kolokasi me-render komponen tanpa provider. Mock
// global memberi insets nol + provider/consumer passthrough (pola sama async-storage/
// netinfo). Test yang butuh nilai inset spesifik dapat override per-file.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    __esModule: true,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: ({ children }) => children(inset),
    SafeAreaView: ({ children }) => children,
    SafeAreaInsetsContext: React.createContext(inset),
    SafeAreaFrameContext: React.createContext(frame),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  };
});

// S7-2: `useDirtyGuard` memakai `usePreventRemove` + `useNavigation` dari re-export
// `expo-router/react-navigation`. Kedua hook resmi butuh NavigationContainer di parent
// tree; test kolokasi kita me-render layar tanpa Stack Navigator (mocking `expo-router`
// per-file). Tanpa mock global, tiap layar form (12 modal S7-2) melempar
// "Couldn't find a navigation object..." saat render — memblokir ~50 test yang mencoba
// smoke-render form baru. Test yang perlu menguji perilaku guard sesungguhnya dapat
// meng-override mock ini secara per-file.
jest.mock('expo-router/react-navigation', () => ({
  __esModule: true,
  useNavigation: () => ({ dispatch: jest.fn() }),
  usePreventRemove: () => {},
}));

// env.ts throws at import time if EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are
// not set. Historically most tests mocked `@/lib/supabase` so env was never
// loaded transitively. Sprint 2 wired `@/lib/env` into auth-provider directly
// (S2-6/S2-7 need the Supabase URL for iss verification + the App Link host),
// which turned every test that transitively imports auth-provider red. Set
// safe placeholder values so `env.ts` succeeds; individual tests can still
// `jest.mock('@/lib/env', …)` when they need bespoke shapes.
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
