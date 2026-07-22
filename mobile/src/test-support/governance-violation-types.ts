// BL-13 — parser sumber kebenaran `governance_violations.violation_type`.
//
// Kolom `violation_type` adalah `text` bebas tanpa CHECK constraint (0005:174), jadi himpunan
// nilai yang sah hanya hidup sebagai string literal di body PL/pgSQL. Modul ini membaca
// `supabase/migrations/*.sql` dan mengekstrak himpunan itu supaya peta label client
// (`GOVERNANCE_VIOLATION_TYPE_LABEL`) bisa diuji terhadap sumbernya, bukan disalin manual.
//
// Dua jalur emisi — keduanya WAJIB diparse; menangkap satu saja menghasilkan gate yang
// hijau tapi buta separuh permukaan:
//   A. `insert into public.governance_violations (…kolom…) values (…)` langsung di body fungsi.
//   B. `perform public.log_governance_violation(p_user_id, <violation_type>, …)` (helper 0019).
//
// Test-only: tidak pernah di-import kode aplikasi (memakai `node:fs`).
import fs from 'node:fs';
import path from 'node:path';

/** Direktori migrasi, relatif terhadap file ini (`mobile/src/test-support/`). */
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

/** Satu tempat di mana `violation_type` ditentukan. */
export type ViolationTypeSite = {
  file: string;
  /** `insert` = jalur A, `rpc` = jalur B. */
  path: 'insert' | 'rpc';
  /** Ekspresi SQL mentah pada posisi `violation_type` (mis. `'submit_non_pic'` atau `p_violation_type`). */
  expression: string;
  /** Nilai literal bila ekspresi berupa string literal; `null` bila dinamis. */
  literal: string | null;
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

/** Nilai literal dari ekspresi SQL, atau `null` bila bukan literal (variabel/parameter/fungsi). */
function literalValue(expression: string): string | null {
  const match = /^'((?:[^']|'')*)'$/.exec(expression.trim());
  return match ? match[1].replace(/''/g, "'") : null;
}

/** Jalur A — `insert into … governance_violations (kolom) values (nilai)`. */
function parseInsertSites(file: string, sql: string): ViolationTypeSite[] {
  const sites: ViolationTypeSite[] = [];
  const pattern = /insert\s+into\s+(?:public\.)?governance_violations\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    const afterColumnParen = match.index + match[0].length;
    const columns = splitTopLevel(sql.slice(afterColumnParen));
    if (columns.end < 0) continue;

    const index = columns.parts.findIndex((c) => c.trim().toLowerCase() === 'violation_type');
    if (index < 0) continue;

    const afterColumns = sql.slice(afterColumnParen + columns.end + 1);
    const valuesKeyword = /^\s*values\s*\(/i.exec(afterColumns);
    if (!valuesKeyword) continue;

    const values = splitTopLevel(afterColumns.slice(valuesKeyword[0].length));
    if (values.end < 0) continue;

    const expression = (values.parts[index] ?? '').trim();
    if (expression === '') continue;
    sites.push({ file, path: 'insert', expression, literal: literalValue(expression) });
  }

  return sites;
}

/**
 * Jalur B — pemanggilan `log_governance_violation(p_user_id, <violation_type>, …)`.
 *
 * Kemunculan yang BUKAN pemanggilan (`create … function log_governance_violation(`,
 * `revoke execute on function …(`) dibuang: daftar argumennya berisi nama tipe
 * (`uuid, text, …`), bukan nilai, sehingga akan tampil sebagai site dinamis palsu.
 */
function parseRpcCallSites(file: string, sql: string): ViolationTypeSite[] {
  const sites: ViolationTypeSite[] = [];
  const pattern = /log_governance_violation\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    const preceding = sql.slice(Math.max(0, match.index - 60), match.index);
    if (/\bfunction\s+(?:public\.)?$/i.test(preceding)) continue;

    const args = splitTopLevel(sql.slice(match.index + match[0].length));
    if (args.end < 0 || args.parts.length < 2) continue;

    const expression = args.parts[1].trim();
    if (expression === '') continue;
    sites.push({ file, path: 'rpc', expression, literal: literalValue(expression) });
  }

  return sites;
}

export type EmittedViolationTypes = {
  /** Nama file `.sql` yang dipindai. */
  files: string[];
  /** Semua tempat `violation_type` ditentukan, kedua jalur. */
  sites: ViolationTypeSite[];
  /** Site dengan ekspresi non-literal — tidak bisa diketahui nilainya secara statis. */
  dynamicSites: ViolationTypeSite[];
  /** Himpunan tipe literal, terurut. */
  types: string[];
};

/** Pindai seluruh migrasi dan kumpulkan tiap `violation_type` yang bisa di-emit. */
export function parseEmittedViolationTypes(dir: string = MIGRATIONS_DIR): EmittedViolationTypes {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const sites = files.flatMap((name) => {
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    return [...parseInsertSites(name, sql), ...parseRpcCallSites(name, sql)];
  });

  const types = [...new Set(sites.map((s) => s.literal).filter((v): v is string => v !== null))];

  return {
    files,
    sites,
    dynamicSites: sites.filter((s) => s.literal === null),
    types: types.sort(),
  };
}
