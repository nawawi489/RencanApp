// Penjaga import `Alert` mentah (P0-2, audit web-native 2026-08).
//
// `react-native`  (dan re-export `react-native-css/components`) meng-implement
// `Alert.alert` sebagai fungsi KOSONG di `react-native-web`:
//
//   class Alert { static alert() {} }
//
// Akibatnya di web: dialog info tak pernah tampil DAN tombol konfirmasi destruktif
// jadi tombol mati (callback tak pernah jalan). Jest memakai preset native, jadi
// suite hijau BUTA terhadap bug ini. Seam `@/lib/alert` (`showAlert`) merutekan ke
// `window.confirm` / banner in-app supaya callback tetap terpanggil di web.
//
// Guard ini men-scan seluruh `src` dan gagal bila ada file selain seam sendiri yang
// meng-impor named `Alert` dari `react-native` / `react-native-css/components`. Ini
// mencegah REGRESI (callsite baru yang mati diam-diam di web).
//
// Pola guard mengikuti `no-english-strings.guard.test.ts`:
//   - scan struktural (impor), bukan semantik;
//   - `FILE_ALLOWLIST` eksplisit untuk pelanggaran yang SENGAJA ditunda — masing-masing
//     adalah utang berdokumentasi, bukan izin permanen.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = ['app', 'components', 'lib', 'hooks', 'screens'];

// Modul yang mengekspor `Alert` no-op-di-web.
const BANNED_SOURCES = ['react-native', 'react-native-css/components'] as const;

// Seam itu sendiri WAJIB meng-impor `Alert` (native pass-through). Path relatif ke ROOT.
const SEAM = join('lib', 'alert.ts');

// File yang MASIH meng-impor `Alert` mentah dan sengaja ditunda migrasinya (info-only,
// non-destruktif; di luar cakupan P0-2 pass ini). Tambah HANYA dengan alasan + tiket
// follow-up. Setiap entri = utang yang harus dilunasi (migrasi ke `showAlert`).
//   - goal/[id].tsx          → alert sukses "Pulihkan dari template" (info)
//   - card-help-trigger.tsx  → popup bantuan (info)
//   - manual-score-override  → alert sukses "Berhasil" (info)
const FILE_ALLOWLIST: readonly string[] = [
  join('app', '(app)', 'goal', '[id].tsx'),
  join('components', 'card-help-trigger.tsx'),
  join('app', '(app)', 'manual-score-override.tsx'),
];

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

// Impor named `Alert` dari salah satu BANNED_SOURCES. Menangani impor multi-baris dan
// `Alert as X`. Tidak menangani `import * as RN` (namespace) — tak dipakai di repo ini.
function importsRawAlert(source: string): boolean {
  const RE = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(source)) !== null) {
    const [, specifiers, from] = m;
    if (!BANNED_SOURCES.includes(from as (typeof BANNED_SOURCES)[number])) continue;
    const named = specifiers.split(',').map((s) => s.trim());
    if (named.some((n) => n === 'Alert' || n.startsWith('Alert '))) return true;
  }
  return false;
}

describe('P0-2 no-raw-alert-import guard', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));

  it('tidak ada file (selain seam + allowlist) yang meng-impor `Alert` mentah', () => {
    const hits: string[] = [];
    for (const path of files) {
      const rel = path.slice(ROOT.length + 1);
      if (rel === SEAM) continue;
      if (FILE_ALLOWLIST.includes(rel)) continue;
      const src = readFileSync(path, 'utf8');
      if (importsRawAlert(src)) hits.push(rel);
    }
    if (hits.length) {
      throw new Error(
        `Impor \`Alert\` mentah (no-op di web) di ${hits.length} file — pakai \`showAlert\` dari @/lib/alert:\n` +
          hits.map((h) => '  ' + h).join('\n'),
      );
    }
  });
});
