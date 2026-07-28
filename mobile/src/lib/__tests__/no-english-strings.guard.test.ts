// S8-1 penjaga string EN: cegah label Inggris user-facing bocor kembali ke UI.
// Menggantikan sisa PR #204 yang belum tuntas (audit produksi 2026-07-26).
//
// Cara kerja: scan seluruh file *.tsx di bawah `mobile/src/app` dan `mobile/src/components`
// untuk **literal JSX text** (teks polos di antara `>` dan `<` dalam elemen). Cocokkan
// terhadap daftar frasa Inggris yang PERNAH bocor + patch pengecualian sengaja (mis. RN
// primitive props, ikon, akronim). Kalau match, fail dgn path:line.
//
// Ini tes struktural bukan semantik — teksnya tak divalidasi terjemahannya, hanya
// mencegah frasa spesifik muncul kembali. Rasio false-positive dijaga rendah dgn:
//   - hanya scan konten JSX teks (bukan komentar/impor/nama variabel);
//   - allowlist eksplisit per file bila memang perlu istilah asing (mis. label brand);
//   - list frasa fokus pada yang audit sebut, bukan setiap kata Inggris.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = ['app', 'components', 'screens'];

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
    else if (s.isFile() && full.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

// Frasa Inggris yang pernah bocor (audit 2026-07-26) — TIDAK boleh muncul lagi di UI.
const BANNED_PHRASES: readonly string[] = [
  'Score Formula',
  'Repeat Compliance',
  'On-Time Rate',
  'Review Pass Rate',
  'Development Contribution',
  'Governance Discipline',
  'Achievement Score',
  'Breakdown Metrik',
  'Detail People',
  'Task Hari Ini',
  'Update Terbaru',
  'Governance Violation',
  'Tugas Completion',
];

// File yang secara sengaja MASIH memuat istilah tersebut (mis. copy admin lama yang
// diplanning untuk sprint selanjutnya). Tambah dgn hati-hati; setiap entri adalah utang.
const FILE_ALLOWLIST: readonly string[] = [
  // Admin templates masih memuat "Goal Template" / "Strategi Template" di judul —
  // dijadwal follow-up (bukan bagian S8-1 minimum surface). Ini juga bukan frasa
  // di daftar BANNED_PHRASES, jadi baris ini hanyalah pengingat.
];

function extractJsxText(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  // Naif tapi cukup: cocokkan `>text<` di dalam elemen JSX satu baris, dan `>{'text'}<`
  // literal. Interpolasi kompleks (nested exprs) tak ditangkap — konservatif, hanya
  // string statis yang jelas ter-render sebagai teks.
  const lines = source.split(/\r?\n/);
  const RE_TEXT = />([^<>{}]+?)</g;
  const RE_STR_EXPR = />\{'([^']+)'\}</g;
  lines.forEach((line, i) => {
    let m: RegExpExecArray | null;
    while ((m = RE_TEXT.exec(line)) !== null) {
      const t = m[1].trim();
      if (t.length >= 3) out.push({ text: t, line: i + 1 });
    }
    while ((m = RE_STR_EXPR.exec(line)) !== null) {
      out.push({ text: m[1], line: i + 1 });
    }
  });
  return out;
}

describe('S8-1 no-english-strings guard', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r))).filter(
    (p) => !FILE_ALLOWLIST.some((allow) => p.endsWith(allow)),
  );

  it('setiap frasa Inggris terlarang tidak muncul di JSX text', () => {
    const hits: string[] = [];
    for (const path of files) {
      const src = readFileSync(path, 'utf8');
      const texts = extractJsxText(src);
      for (const { text, line } of texts) {
        for (const banned of BANNED_PHRASES) {
          if (text.includes(banned)) {
            hits.push(`${path}:${line}  ${banned}  →  "${text}"`);
          }
        }
      }
    }
    if (hits.length) {
      // Format hits multi-baris supaya diagnostiknya jelas di CI.
      throw new Error(
        `Frasa Inggris terlarang di JSX (${hits.length}):\n` + hits.map((h) => '  ' + h).join('\n'),
      );
    }
  });
});
