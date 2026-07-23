// [BL-17] Parser sumber kebenaran `activity_logs.action` — sepupu langsung
// `governance-violation-types.ts` (BL-13), dengan permukaan emisi yang lebih lebar.
//
// `activity_logs.action` adalah `text` bebas TANPA CHECK constraint (0001), jadi himpunan
// nilai yang sah hanya hidup sebagai string literal di body PL/pgSQL. Modul ini membacanya
// dari `supabase/migrations/*.sql` supaya peta label client (`ACTIVITY_LOG_ACTION_LABEL`)
// diuji terhadap sumbernya, bukan disalin manual.
//
// TIGA jalur emisi — ketiganya WAJIB diparse:
//   A. `perform public.write_activity(p_entity_type, p_entity_id, <action>, p_detail)` (0005).
//   B. `perform public.write_activity_system(p_org, p_actor, p_entity_type, p_entity_id,
//      <action>, p_detail)` (0007) — jalur cron/sistem.
//   C. `insert into public.activity_logs (…kolom…) values|select (…)` langsung — dipakai
//      badan kedua helper di atas, trigger `log_card_creation()`, dan migrasi data (0078).
//
// EKSPRESI `case` DIRESOLUSI, BUKAN DIANGGAP DINAMIS. Jalur review menulis
// `case when p_decision = 'approve' then 'review_approve' else 'review_reject' end` di
// tujuh migrasi. Memperlakukannya sebagai "tak terbaca" akan membuang empat action yang
// paling sering muncul di DB nyata (`review_approve` sendiri 72 dari 733 baris) ke dalam
// allowlist manual — tepat lubang yang gate ini ada untuk menutup. Selama SELURUH cabang
// hasilnya literal, nilainya dapat diketahui statis.
//
// Test-only: tidak pernah di-import kode aplikasi (memakai `node:fs`).
import fs from 'node:fs';
import path from 'node:path';

/** Direktori migrasi, relatif terhadap file ini (`mobile/src/test-support/`). */
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

/** Jalur emisi tempat sebuah `action` ditentukan. */
export type ActionPath = 'write_activity' | 'write_activity_system' | 'insert';

/** Satu tempat di mana `activity_logs.action` ditentukan. */
export type ActionSite = {
  file: string;
  path: ActionPath;
  /** Ekspresi SQL mentah pada posisi `action` (mis. `'create'`, `case … end`, `p_action`). */
  expression: string;
  /** Nilai yang dapat diketahui statis. `null` bila ekspresi benar-benar dinamis. */
  literals: string[] | null;
};

/**
 * Pecah daftar argumen/kolom yang dipisah koma pada level teratas, mulai tepat SETELAH
 * kurung buka. Sadar kurung bersarang (`jsonb_build_object(...)`) dan string literal
 * ber-escape gaya SQL (`''`), jadi koma di dalamnya tidak ikut memecah.
 *
 * @returns `parts` = elemen level-atas, `end` = offset kurung tutup yang menyeimbangkan.
 */
function splitTopLevel(source: string): { parts: string[]; end: number } {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      current += char;
      if (char === "'") {
        if (source[i + 1] === "'") {
          i += 1;
          current += source[i]; // '' = kutip ter-escape, masih di dalam string
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ')') {
      if (depth === 0) {
        parts.push(current);
        return { parts, end: i };
      }
      depth -= 1;
      current += char;
      continue;
    }
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  return { parts, end: -1 }; // tak seimbang — penelepon memperlakukannya sebagai gagal parse
}

/** Nilai literal dari ekspresi SQL, atau `null` bila bukan literal. */
function literalValue(expression: string): string | null {
  const match = /^'((?:[^']|'')*)'$/.exec(expression.trim());
  return match ? match[1].replace(/''/g, "'") : null;
}

/**
 * Nilai yang dapat diketahui statis dari satu ekspresi posisi `action`.
 *
 * Literal polos → satu nilai. `case … end` → nilai setiap cabang `then`/`else`, TAPI hanya
 * bila SEMUA cabang literal; satu cabang non-literal membuat seluruh ekspresi dinamis
 * (mengembalikan sebagian akan menghasilkan gate yang hijau sambil kehilangan nilai).
 * Selain itu → `null` (dinamis).
 */
function resolveLiterals(expression: string): string[] | null {
  const expr = expression.trim();

  const plain = literalValue(expr);
  if (plain !== null) return [plain];

  if (!/^case\b/i.test(expr) || !/\bend$/i.test(expr)) return null;

  const results = [...expr.matchAll(/\b(?:then|else)\s+([^\s].*?)(?=\s+(?:when|then|else|end)\b)/gis)];
  if (results.length === 0) return null;

  const values = results.map((m) => literalValue(m[1]));
  if (values.some((v) => v === null)) return null;
  return [...new Set(values as string[])];
}

/** Jalur A/B — pemanggilan helper `write_activity` / `write_activity_system`. */
function parseHelperSites(file: string, sql: string): ActionSite[] {
  const sites: ActionSite[] = [];
  // Posisi argumen `p_action` pada tanda tangan masing-masing helper.
  const helpers: { name: ActionPath; index: number }[] = [
    { name: 'write_activity', index: 2 },
    { name: 'write_activity_system', index: 4 },
  ];

  for (const helper of helpers) {
    // `(?<![a-z_])` mencegah `write_activity` ikut cocok di dalam `write_activity_system`.
    const pattern = new RegExp(`(?<![a-z_])${helper.name}\\s*\\(`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(sql)) !== null) {
      // Buang yang BUKAN pemanggilan (`create … function write_activity(`,
      // `revoke execute on function …(`): daftar argumennya berisi nama tipe, bukan nilai.
      const preceding = sql.slice(Math.max(0, match.index - 80), match.index);
      if (/\bfunction\s+(?:public\.)?$/i.test(preceding)) continue;

      const args = splitTopLevel(sql.slice(match.index + match[0].length));
      if (args.end < 0 || args.parts.length <= helper.index) continue;

      const expression = args.parts[helper.index].trim();
      if (expression === '') continue;
      sites.push({ file, path: helper.name, expression, literals: resolveLiterals(expression) });
    }
  }

  return sites;
}

/** Jalur C — `insert into … activity_logs (kolom) values (…)` atau `… select …`. */
function parseInsertSites(file: string, sql: string): ActionSite[] {
  const sites: ActionSite[] = [];
  const pattern = /insert\s+into\s+(?:public\.)?activity_logs\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    const afterColumnParen = match.index + match[0].length;
    const columns = splitTopLevel(sql.slice(afterColumnParen));
    if (columns.end < 0) continue;

    const index = columns.parts.findIndex((c) => c.trim().toLowerCase() === 'action');
    if (index < 0) continue;

    const afterColumns = sql.slice(afterColumnParen + columns.end + 1);

    const valuesKeyword = /^\s*values\s*\(/i.exec(afterColumns);
    if (valuesKeyword) {
      const values = splitTopLevel(afterColumns.slice(valuesKeyword[0].length));
      if (values.end < 0) continue;
      const expression = (values.parts[index] ?? '').trim();
      if (expression === '') continue;
      sites.push({ file, path: 'insert', expression, literals: resolveLiterals(expression) });
      continue;
    }

    // `insert … select` (migrasi data, mis. 0078). Daftar select berakhir di `from`;
    // `)` palsu di akhir memberi `splitTopLevel` terminator level-atas.
    const selectKeyword = /^\s*select\s+/i.exec(afterColumns);
    if (!selectKeyword) continue;
    const selectList = afterColumns.slice(selectKeyword[0].length).split(/\bfrom\b/i)[0];
    const values = splitTopLevel(`${selectList})`);
    const expression = (values.parts[index] ?? '').trim();
    if (expression === '') continue;
    sites.push({ file, path: 'insert', expression, literals: resolveLiterals(expression) });
  }

  return sites;
}

export type EmittedActions = {
  /** Nama file `.sql` yang dipindai. */
  files: string[];
  /** Semua tempat `action` ditentukan, ketiga jalur. */
  sites: ActionSite[];
  /** Site yang nilainya tidak dapat diketahui statis. */
  dynamicSites: ActionSite[];
  /** Himpunan action yang dapat di-emit, terurut. */
  actions: string[];
};

/** Pindai seluruh migrasi dan kumpulkan tiap `action` yang bisa di-emit. */
export function parseEmittedActions(dir: string = MIGRATIONS_DIR): EmittedActions {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const sites = files.flatMap((name) => {
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    return [...parseHelperSites(name, sql), ...parseInsertSites(name, sql)];
  });

  const actions = [...new Set(sites.flatMap((s) => s.literals ?? []))];

  return {
    files,
    sites,
    dynamicSites: sites.filter((s) => s.literals === null),
    actions: actions.sort(),
  };
}
