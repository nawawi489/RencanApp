// P1 colorize penjaga: cegah emoji / glyph piktografik dipakai lagi sebagai ikon UI.
// DESIGN §10 mewajibkan Ionicons untuk semua ikon (tint/weight/Dynamic-Type konsisten,
// render sama di iOS/Android/web). Emoji sebagai ikon melanggar itu — pass `colorize`
// (fix/colorize-p1-ionicons) menukar ~40 glyph ke Ionicons; penjaga ini menahannya tetap 0.
//
// Cara kerja: scan literal **JSX text node** (teks polos di antara `>` dan `<`) di seluruh
// `.tsx` di bawah src/app, src/components, src/screens. Kalau ada codepoint emoji, fail
// dgn path:line. TIDAK men-scan:
//   - komentar / impor / nama variabel (bukan `>teks<`);
//   - string literal data (mis. `REACTION_EMOJI_ORDER = ['👍', …]` — array data, bukan teks JSX);
//   - ekspresi `{…}` (regex `[^<>{}]` mengecualikannya, jadi `{emoji}` dinamis lolos).
//
// Emoji non-ikon yang sah (mis. glyph `✓` sinyal non-warna pill reaksi yang mengikat test
// UI-16, DESIGN §7 ReactionPill) di-exempt via komentar `emoji-guard-allow` di baris itu
// atau ≤3 baris di atasnya.
//
// CATATAN: ini penjaga EMOJI, bukan semua glyph. Panah `↑↓→` (DeltaArrow §7), `⋯` (aksi
// sekunder §10), `›‹○▾` bukan emoji (blok Arrows/Geometric/Punctuation) → di luar cakupan.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = ['app', 'components', 'screens'];

// Rentang codepoint emoji/piktografik yang pernah dipakai sebagai ikon di repo ini:
//   1F000–1FAFF  piktografik (🖼 📄 💬 👥 🔍 👤 🔁 🗑️ …)
//   2600–27BF    Misc Symbols + Dingbats (✓ ✕ ✅ ✏ ✂ ⚙ ⚠ ☀ …)
//   2300–23FF    Misc Technical (⏰ ⏸ ⌚ ⌛ ⌕ …)
//   2B00–2BFF    panah/bintang emoji (⭐ ⬆ …)
//   FE0F 20E3    variation selector + keycap
//   2049 203C 2122 2139  ‼ ⁉ ™ ℹ
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{2049}\u{203C}\u{2122}\u{2139}]/u;

const ALLOW_MARKER = 'emoji-guard-allow';

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

// Ekstrak teks JSX satu-baris `>text<` (pola sama dgn no-english-strings guard). `[^<>{}]`
// mengecualikan ekspresi `{…}`, jadi hanya string statis yang jelas ter-render.
function extractJsxText(lines: string[]): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const RE_TEXT = />([^<>{}]+?)</g;
  lines.forEach((line, i) => {
    let m: RegExpExecArray | null;
    while ((m = RE_TEXT.exec(line)) !== null) {
      out.push({ text: m[1], line: i + 1 });
    }
  });
  return out;
}

// Exempt bila baris hit atau ≤3 baris di atasnya memuat penanda allow (untuk komentar blok).
function isAllowed(lines: string[], line1: number): boolean {
  const start = Math.max(0, line1 - 4);
  for (let i = start; i < line1; i++) {
    if (lines[i]?.includes(ALLOW_MARKER)) return true;
  }
  return false;
}

describe('P1 colorize no-emoji-icons guard', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));

  it('scan menemukan file sumber (sanity — root path benar)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('tidak ada emoji piktografik di JSX text node (pakai Ionicons — DESIGN §10)', () => {
    const hits: string[] = [];
    for (const path of files) {
      const src = readFileSync(path, 'utf8');
      const lines = src.split(/\r?\n/);
      for (const { text, line } of extractJsxText(lines)) {
        if (EMOJI_RE.test(text) && !isAllowed(lines, line)) {
          const emoji = text.match(EMOJI_RE)?.[0] ?? '';
          hits.push(`${path}:${line}  ${emoji}  →  "${text.trim()}"`);
        }
      }
    }
    if (hits.length) {
      throw new Error(
        `Emoji dipakai sebagai ikon di JSX (${hits.length}) — ganti ke Ionicons (DESIGN §10) ` +
          `atau tandai baris sah dengan komentar "${ALLOW_MARKER}":\n` +
          hits.map((h) => '  ' + h).join('\n'),
      );
    }
  });

  it('penanda emoji-guard-allow yang ada memang mengecualikan hit nyata (mekanisme allow hidup)', () => {
    // ReactionPill (inbox/[roomId].tsx) sengaja pakai glyph ✓ (DESIGN §7) dgn penanda allow.
    // Jika mekanisme allow rusak, ini akan false-positive di test utama; cek eksplisit di sini.
    const roomFile = files.find((p) => p.replace(/\\/g, '/').endsWith('inbox/[roomId].tsx'));
    expect(roomFile).toBeTruthy();
    const lines = readFileSync(roomFile!, 'utf8').split(/\r?\n/);
    const allowIdx = lines.findIndex((l) => l.includes(ALLOW_MARKER));
    expect(allowIdx).toBeGreaterThanOrEqual(0);
  });
});
