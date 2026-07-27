// Jest setup: mock modul native yang tidak tersedia di Node test runner.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo dipakai `installOnlineManager` (dijalankan saat root _layout dimuat). Mock resmi
// menghindari akses native module di runner + memberi `addEventListener` no-op yang aman.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

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
