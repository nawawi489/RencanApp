// [BL-13] Gate sinkronisasi `violation_type`: migrasi DB ↔ peta label client.
//
// Konteks. `governance_violations.violation_type` adalah kolom `text` tanpa CHECK constraint
// (0005:174). Himpunan nilai yang sah tidak didefinisikan di mana pun — ia hanya tersebar
// sebagai string literal di body PL/pgSQL, dan `GOVERNANCE_VIOLATION_TYPE_LABEL` adalah
// salinan manual dari himpunan itu (dibuat untuk BL-12).
//
// Tanpa gate ini, migrasi yang menambah tipe baru — atau salah ketik tipe yang sudah ada —
// lolos SEMUA gate: kolom text menerima apa saja, DB contract test tidak mengenumerasi tipe,
// dan jest tidak pernah melihat migrasi. Fallback BL-12 membuat halaman tetap terbaca
// (tipe tak dikenal render mentah), jadi kegagalannya DIAM-DIAM. Test inilah yang
// menyuarakannya: ia mem-parse migrasi dan menuntut tiap tipe punya label.
//
// Menambah tipe baru → tambahkan satu entri di GOVERNANCE_VIOLATION_TYPE_LABEL. Itu saja.
// Daftar tipe sengaja TIDAK ditulis ulang di sini: satu-satunya salinan manual yang tersisa
// adalah peta label, dan test ini yang menjaganya.

// `activity-governance` menarik klien Supabase (butuh env). Test ini murni statis.
jest.mock('../supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first
import { GOVERNANCE_VIOLATION_TYPE_LABEL } from '../activity-governance';
// eslint-disable-next-line import/first
import {
  MIGRATIONS_DIR,
  parseEmittedViolationTypes,
} from '@/test-support/governance-violation-types';

const parsed = parseEmittedViolationTypes();

/** Tipe yang dipetakan tapi tidak ditulis fungsi mana pun. Bukan drift — lihat komentar. */
const KNOWN_UNEMITTED = [
  // Hanya muncul di `supabase/tests/fase5_minimum_breakdown_rules_contract.wip.sql`.
  // Migrasi 0011 hanya `RAISE` pada gate-block tanpa menulis baris governance (konsisten
  // dengan aturan "penolakan hanya RAISE"). Dipertahankan di peta sebagai pertahanan untuk
  // baris lama bila tipe ini pernah tertulis di masa lalu.
  'minimum_breakdown_not_met',
];

/** Ekspresi non-literal yang memang tidak bisa diketahui statis, per site yang sudah ditinjau. */
const ALLOWED_DYNAMIC_EXPRESSIONS = [
  // Body helper `log_governance_violation()` (0019) meneruskan parameternya. Nilai
  // sebenarnya datang dari pemanggil, yang sudah diparse lewat jalur `rpc`.
  'p_violation_type',
];

describe('[BL-13] sumber kebenaran violation_type', () => {
  it('[BL13-1] membaca direktori migrasi yang sebenarnya', () => {
    // Kalau path salah, seluruh assertion di bawah lolos secara vacuous.
    expect(MIGRATIONS_DIR).toMatch(/supabase[\\/]migrations$/);
    expect(parsed.files.length).toBeGreaterThanOrEqual(70);
  });

  it('[BL13-2] menemukan KEDUA jalur emisi, bukan hanya satu', () => {
    // Parser yang hanya menangkap satu jalur akan hijau sambil buta separuh permukaan.
    const literal = parsed.sites.filter((s) => s.literal !== null);
    expect(literal.filter((s) => s.path === 'insert').length).toBeGreaterThanOrEqual(15);
    expect(literal.filter((s) => s.path === 'rpc').length).toBeGreaterThanOrEqual(10);
  });

  it('[BL13-3] menemukan minimal 11 tipe yang diketahui', () => {
    // Angka referensi dari audit BL-12. Turun di bawahnya = parser regresi, bukan tipe hilang.
    expect(parsed.types.length).toBeGreaterThanOrEqual(11);
  });

  it('[BL13-4] setiap tipe yang di-emit migrasi punya label di client', () => {
    const missing = parsed.types.filter((t) => GOVERNANCE_VIOLATION_TYPE_LABEL[t] === undefined);
    expect({ missing, sourceOfTruth: parsed.types }).toEqual({
      missing: [],
      sourceOfTruth: parsed.types,
    });
  });

  it('[BL13-5] tidak ada label yatim di client', () => {
    // Kebalikan dari BL13-4: label untuk tipe yang tak pernah ditulis siapa pun menumpuk diam-diam.
    const emitted = new Set(parsed.types);
    const orphans = Object.keys(GOVERNANCE_VIOLATION_TYPE_LABEL)
      .filter((t) => !emitted.has(t) && !KNOWN_UNEMITTED.includes(t))
      .sort();
    expect(orphans).toEqual([]);
  });

  it('[BL13-6] setiap site non-literal sudah ditinjau', () => {
    // Emitter dinamis (`v_type`, `case … end`) tak bisa diparse. Ia harus MEMERAHKAN test
    // supaya ditinjau manusia — bukan lewat begitu saja dan menjadi lubang di gate.
    const unreviewed = parsed.dynamicSites
      .filter((s) => !ALLOWED_DYNAMIC_EXPRESSIONS.includes(s.expression))
      .map((s) => `${s.file}: ${s.expression}`);
    expect(unreviewed).toEqual([]);
  });
});
