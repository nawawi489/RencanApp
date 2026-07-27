// S3-7 — Push route resolver tests.
//
// Tes lama menyematkan literal rute + membangun input dari
// ENTITY_ROUTE_SEGMENT itu sendiri, sehingga resolver yang rusak (4 dari 7
// tipe entity live me-resolve ke null) tetap hijau. Tes ini:
//
//   1. Mem-parse literal `emit_notification(..., '<entity_type>', ...)` dari
//      supabase/migrations/ — sumber otoritatif tipe entity yang PERNAH
//      dipancarkan ke `notifications`. Sunset: nama tipe legacy dicantumkan
//      di LEGACY_ONLY untuk dikecualikan bila memang sudah diganti nama.
//   2. Memastikan setiap entity_type live me-resolve ke rute non-null.
//   3. Verifikasi file layar Expo Router yang ditunjuk resolver benar-benar
//      ada di disk — mencegah drift saat rute di-rename.

import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';

import { ENTITY_ROUTE_SEGMENT } from '../entity-routes';
import { NOTIFICATIONS_FALLBACK_ROUTE, resolveNotificationRoute } from '../push-route-resolver';

const MIGRATIONS_DIR = resolve(__dirname, '../../../..', 'supabase', 'migrations');
// Expo Router path `/(app)/...` = folder `src/app/(app)/...` on disk. The route
// group name is a literal directory. Individual groups (tabs, auth) are nested
// under `(app)` in this repo.
const APP_DIR = resolve(__dirname, '../..', 'app');

// Entity_type yang dulu dipancarkan tapi sudah diganti nama pasca-0084.
// Contoh: 0008 memancarkan 'action_plan_instance' — 0084 rename → 'task_instance'.
// Bila nanti ada lagi, tambah di sini + PR notes kenapa dikecualikan.
const LEGACY_ONLY = new Set<string>([
  'action_plan_instance', // 0008 legacy; superseded by task_instance in 0084
]);

function listEmitEntityTypes(): Set<string> {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const found = new Set<string>();
  // Multi-line regex: `emit_notification(<any>, <notif_type>, <entity_type>, ...)`
  // Argumen ke-4 (notif type) dan ke-5 (entity_type) diapit tanda kutip; keduanya
  // bisa dipisah newline. Cocokkan konservatif: kutip → koma → kutip → koma.
  const re = /emit_notification\s*\([^)]*?'[a-z_]+'\s*,\s*'([a-z_]+)'\s*,/g;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    for (const m of sql.matchAll(re)) {
      const type = m[1];
      if (!LEGACY_ONLY.has(type)) found.add(type);
    }
  }
  return found;
}

function screenExistsFor(route: string): boolean {
  // Route Expo Router bentuk `/(app)/{...segments}[/{id}]?` → cek layar di disk.
  // Semua group folder (parenthesized) adalah folder literal di file system,
  // jadi `(app)` dan `(tabs)` di path harus DIPERTAHANKAN, bukan dibuang.
  const m = route.match(/^\/(.+?)(\/[^/]+)?$/);
  if (!m) return false;
  const path = m[1];
  const dynamicId = m[2];
  // Layar mungkin folder (dgn `_layout.tsx` atau `index.tsx`) atau file tunggal
  // (`{name}.tsx`). Rute dinamis pakai `[id].tsx`.
  const candidates = [
    join(APP_DIR, `${path}.tsx`),
    join(APP_DIR, path, 'index.tsx'),
    join(APP_DIR, path, '_layout.tsx'),
  ];
  if (dynamicId) {
    candidates.push(join(APP_DIR, path, '[id].tsx'));
    // task_instance memakai nested folder: /task/instance/[id].tsx
    const idBase = dynamicId.slice(1); // strip leading '/'
    if (idBase !== '[id]') {
      candidates.push(join(APP_DIR, path, idBase, '[id].tsx'));
      candidates.push(join(APP_DIR, path, idBase, 'index.tsx'));
    }
  }
  return candidates.some(existsSync);
}

describe('resolveNotificationRoute', () => {
  it('[PN-ROUTE-1] semua CardEntityType punya rute + file layar ada di disk', () => {
    for (const t of Object.keys(ENTITY_ROUTE_SEGMENT)) {
      const route = resolveNotificationRoute(t, 'x');
      expect(route).not.toBeNull();
      expect(route).toContain('x');
      // Buang id agar cek layar tidak tergantung uuid.
      const base = route!.replace(/\/x$/, '/[id]');
      expect(screenExistsFor(base)).toBe(true);
    }
  });

  it('[PN-ROUTE-2] task_instance → /(app)/task/instance/{id} + file ada', () => {
    const r = resolveNotificationRoute('task_instance', 'inst-1');
    expect(r).toBe('/(app)/task/instance/inst-1');
    expect(screenExistsFor('/(app)/task/instance/[id]')).toBe(true);
  });

  it('[PN-ROUTE-3] chat_message → inbox tab (id tidak diappend; entity_id=message ≠ room)', () => {
    expect(resolveNotificationRoute('chat_message', 'msg-1')).toBe('/(app)/(tabs)/inbox');
    expect(screenExistsFor('/(app)/(tabs)/inbox')).toBe(true);
  });

  it('[PN-ROUTE-4] period_snapshot → tab notifikasi (tak ada layar per-snapshot)', () => {
    expect(resolveNotificationRoute('period_snapshot', 'p-1')).toBe(
      '/(app)/(tabs)/notifications',
    );
  });

  it('[PN-ROUTE-5] user_permission → settings-profile + file ada', () => {
    expect(resolveNotificationRoute('user_permission', 'u-1')).toBe(
      '/(app)/settings-profile',
    );
    expect(screenExistsFor('/(app)/settings-profile')).toBe(true);
  });

  it('[PN-ROUTE-6] null/undefined/unknown → null (caller pakai fallback)', () => {
    expect(resolveNotificationRoute(null, 'x')).toBeNull();
    expect(resolveNotificationRoute(undefined, 'x')).toBeNull();
    expect(resolveNotificationRoute('unknown_entity', 'x')).toBeNull();
    expect(resolveNotificationRoute('task', '')).toBeNull();
  });

  it('[PN-ROUTE-7] SEMUA entity_type live di supabase/migrations/ punya rute', () => {
    // Menutup celah audit: dulu tes mem-build input dari peta impl → tak mungkin
    // gagal saat resolver miss. Sekarang input berasal dari migrations (source of truth).
    const emitted = listEmitEntityTypes();
    expect(emitted.size).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const t of emitted) {
      if (resolveNotificationRoute(t, 'x') === null) missing.push(t);
    }
    expect(missing).toEqual([]);
  });

  it('[PN-ROUTE-8] NOTIFICATIONS_FALLBACK_ROUTE menunjuk ke tab Notifikasi (M3)', () => {
    expect(NOTIFICATIONS_FALLBACK_ROUTE).toBe('/(app)/(tabs)/notifications');
  });
});
