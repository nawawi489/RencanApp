// resolveSupabaseUrl adalah helper murni (no env read, no side-effect) yang menormalkan
// host Supabase per Platform.OS agar dev preview di web (localhost:8081) tidak nge-abort
// request ke 127.0.0.1:54321 (cross-origin), sekaligus mempertahankan host valid untuk
// simulator iOS (localhost/127.0.0.1) dan emulator Android (10.0.2.2).
//
// Ref: docs/spec-ui-testfix-2026-07-05.md AC-CFG01-1..2
//      docs/tdd-plan-ui-testfix-batch1-2026-07-05.md Fase B (RED-B1 + edge case dari critic)

import { resolveSupabaseUrl } from '../supabase-url';

describe('resolveSupabaseUrl (AC-CFG01-1..2)', () => {
  describe('local alias rewrite per platform', () => {
    it('[1] web: 127.0.0.1 → localhost (reachable dari browser origin)', () => {
      expect(resolveSupabaseUrl('web', 'http://127.0.0.1:54321')).toBe('http://localhost:54321');
    });

    it('[2] ios: 127.0.0.1 dipertahankan (simulator iOS OK)', () => {
      expect(resolveSupabaseUrl('ios', 'http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    });

    it('[3] ios: localhost dinormalkan ke 127.0.0.1 (canonical simulator host)', () => {
      expect(resolveSupabaseUrl('ios', 'http://localhost:54321')).toBe('http://127.0.0.1:54321');
    });

    it('[4] android: localhost → 10.0.2.2 (emulator ke host machine)', () => {
      expect(resolveSupabaseUrl('android', 'http://localhost:54321')).toBe('http://10.0.2.2:54321');
    });

    it('[5] android: 127.0.0.1 → 10.0.2.2 (emulator loopback)', () => {
      expect(resolveSupabaseUrl('android', 'http://127.0.0.1:54321')).toBe('http://10.0.2.2:54321');
    });
  });

  describe('non-local host TIDAK dimutasi (safety)', () => {
    it('[6] web: staging remote unchanged', () => {
      expect(resolveSupabaseUrl('web', 'https://staging.supabase.co')).toBe(
        'https://staging.supabase.co',
      );
    });

    it('[7] android: host non-local unchanged (physical device pointing LAN IP OK)', () => {
      expect(resolveSupabaseUrl('android', 'http://192.168.1.10:54321')).toBe(
        'http://192.168.1.10:54321',
      );
    });

    it('[8] web: docker internal host unchanged (dev container safety)', () => {
      expect(resolveSupabaseUrl('web', 'http://host.docker.internal:54321')).toBe(
        'http://host.docker.internal:54321',
      );
    });
  });

  describe('idempotency + edge cases (critic missing-case coverage)', () => {
    it('[9] web: idempotent — sudah localhost, output tetap localhost', () => {
      expect(resolveSupabaseUrl('web', 'http://localhost:54321')).toBe('http://localhost:54321');
    });

    it('[10] web: input trailing slash → output tanpa trailing slash (kanonik Supabase)', () => {
      // Kontrak: normalize ke bentuk tanpa "/" di akhir, konsisten dengan
      // konvensi createClient() Supabase; tidak memunculkan double-slash di path.
      expect(resolveSupabaseUrl('web', 'http://127.0.0.1:54321/')).toBe(
        'http://localhost:54321',
      );
    });

    it('[11] raw URL invalid → dikembalikan apa adanya (fallback aman, tidak throw)', () => {
      expect(resolveSupabaseUrl('web', 'not-a-url')).toBe('not-a-url');
    });

    it('[12] platform unknown ("windows"/"") → tidak dimutasi (safe default)', () => {
      expect(resolveSupabaseUrl('windows', 'http://127.0.0.1:54321')).toBe(
        'http://127.0.0.1:54321',
      );
      expect(resolveSupabaseUrl('', 'http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    });

    it('[13] scheme & port dipertahankan (https + custom port)', () => {
      expect(resolveSupabaseUrl('web', 'https://127.0.0.1:8443')).toBe(
        'https://localhost:8443',
      );
    });
  });
});
