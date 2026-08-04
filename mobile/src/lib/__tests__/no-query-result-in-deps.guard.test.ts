// Penjaga hasil `useQuery`/`useQueries` di dalam dependency array hook (F1, audit
// performa 2026-08).
//
// `@tanstack/react-query` `useQuery` mengembalikan Proxy BARU tiap render
// (`queryObserver.trackResult` → `new Proxy(result, …)`), jadi objek hasil query TAK
// PERNAH stabil sebagai dependency. Menaruhnya di dep array `useFocusEffect` /
// `useEffect` / `useCallback` / `useMemo` membuat body re-fire tiap render — dan
// `.refetch()` melewati `staleTime`, memicu kaskade refetch tiap fokus.
//
// Guard ini men-scan `src`, mengumpulkan identifier yang di-assign langsung dari
// `useQuery(` / `useQueries(` per file, lalu gagal bila salah satunya muncul sebagai
// elemen TELANJANG di dep array hook. Depend pada `.refetch` / `.data` (properti
// stabil) tetap boleh — yang dilarang hanya objek hasilnya utuh.
//
// Pola mengikuti `no-raw-alert-import.guard.test.ts` (scan struktural, allowlist eksplisit).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = ['app', 'components', 'lib', 'hooks', 'screens'];

// Pelanggaran yang SENGAJA ditunda — tambah HANYA dengan alasan + tiket follow-up.
const FILE_ALLOWLIST: readonly string[] = [];

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    if (name === '__tests__' || name === '__mocks__') continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, acc);
    else if (s.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) acc.push(full);
  }
  return acc;
}

// Identifier yang di-assign langsung dari useQuery(/useQueries( — mis. `const apQ = useQuery({...})`.
// `useQueryClient(` sengaja tak cocok (butuh `(` tepat setelah `useQuery`). Destrukturisasi
// (`const { data } = useQuery(...)`) tak menghasilkan objek proxy telanjang → tak dikumpulkan.
function collectQueryResultIds(source: string): Set<string> {
  const ids = new Set<string>();
  const RE = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useQuer(?:y|ies)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(source)) !== null) ids.add(m[1]);
  return ids;
}

// Dep array penutup hook: `}, [ ... ])`. Menangani array multi-baris.
function depArrays(source: string): string[] {
  const RE = /\}\s*,\s*\[([\s\S]*?)\]\s*\)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE.exec(source)) !== null) out.push(m[1]);
  return out;
}

function violationsIn(source: string): string[] {
  const ids = collectQueryResultIds(source);
  if (ids.size === 0) return [];
  const hits = new Set<string>();
  for (const arr of depArrays(source)) {
    for (const raw of arr.split(',')) {
      const dep = raw.trim();
      // Hanya objek hasil TELANJANG (mis. `apQ`). `apQ.refetch` / `apQ.data` aman.
      if (ids.has(dep)) hits.add(dep);
    }
  }
  return [...hits];
}

describe('F1 no-query-result-in-deps guard', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));

  it('tidak ada objek hasil useQuery/useQueries di dep array hook', () => {
    const hits: string[] = [];
    for (const path of files) {
      const rel = path.slice(ROOT.length + 1);
      if (FILE_ALLOWLIST.includes(rel)) continue;
      const bad = violationsIn(readFileSync(path, 'utf8'));
      if (bad.length) hits.push(`${rel} → ${bad.join(', ')}`);
    }
    if (hits.length) {
      throw new Error(
        `Objek hasil useQuery/useQueries (Proxy tak-stabil) di dep array hook — ` +
          `pakai \`}, [])\` (+ eslint-disable exhaustive-deps) atau depend pada \`.refetch\` saja:\n` +
          hits.map((h) => '  ' + h).join('\n'),
      );
    }
  });
});
