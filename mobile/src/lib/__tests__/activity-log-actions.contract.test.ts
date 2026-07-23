// [BL-17] Gate sinkronisasi `activity_logs.action`: migrasi DB ↔ peta label client.
//
// Perluasan sadar dari gate BL-13 (`governance-violation-types.contract.test.ts`) ke kolom
// kedua yang punya cacat identik. Alasan memperluasnya — bukan menyalin polanya lalu
// berhenti — ada di baris BL-17 wiki; ringkasnya: `action` punya LEBIH banyak penulis dan
// bertambah LEBIH sering daripada `violation_type`, sehingga argumen "penulisnya banyak"
// adalah alasan untuk memasang gate, bukan alasan untuk melewatkannya. Bukti empirisnya
// langsung muncul: peta warisan di `settings-activity-log.tsx` sudah kehilangan LIMA action
// yang benar-benar di-emit migrasi, dan menyimpan satu label yatim (`instance_missed`,
// sebenarnya tipe notifikasi) — drift yang sudah terjadi tanpa ada yang tahu.
//
// Menambah action baru di migrasi → tambahkan satu entri di ACTIVITY_LOG_ACTION_LABEL.

// `activity-governance` menarik klien Supabase (butuh env). Test ini murni statis.
jest.mock('../supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first
import { ACTIVITY_LOG_ACTION_LABEL } from '../activity-governance';
// eslint-disable-next-line import/first
import { MIGRATIONS_DIR, parseEmittedActions } from '@/test-support/activity-log-actions';

const parsed = parseEmittedActions();

/** Ekspresi non-literal yang memang tidak bisa diketahui statis, per site yang sudah ditinjau. */
const ALLOWED_DYNAMIC_EXPRESSIONS = [
  // Badan helper `write_activity()` (0005) dan `write_activity_system()` (0007) meneruskan
  // parameternya ke `insert`. Nilai sebenarnya datang dari pemanggil, yang sudah diparse
  // lewat jalur `write_activity` / `write_activity_system`.
  'p_action',
];

describe('[BL-17] sumber kebenaran activity_logs.action', () => {
  it('[BL17-1] membaca direktori migrasi yang sebenarnya', () => {
    // Kalau path salah, seluruh assertion di bawah lolos secara vacuous.
    expect(MIGRATIONS_DIR).toMatch(/supabase[\\/]migrations$/);
    expect(parsed.files.length).toBeGreaterThanOrEqual(70);
  });

  it('[BL17-2] menemukan KETIGA jalur emisi, bukan sebagian', () => {
    // Parser yang hanya menangkap satu jalur akan hijau sambil buta sebagian permukaan.
    const resolved = parsed.sites.filter((s) => s.literals !== null);
    expect(resolved.filter((s) => s.path === 'write_activity').length).toBeGreaterThanOrEqual(80);
    expect(
      resolved.filter((s) => s.path === 'write_activity_system').length,
    ).toBeGreaterThanOrEqual(3);
    expect(resolved.filter((s) => s.path === 'insert').length).toBeGreaterThanOrEqual(2);
  });

  it('[BL17-3] meresolusi `case … end` alih-alih membuangnya sebagai dinamis', () => {
    // Empat action jalur review HANYA ada di dalam ekspresi `case`. Kalau resolusi cabang
    // regresi, keempatnya hilang dari sumber kebenaran tanpa satu pun assertion memerah.
    for (const action of [
      'review_approve',
      'review_reject',
      'review_instance_approve',
      'review_instance_reject',
    ]) {
      expect(parsed.actions).toContain(action);
    }
  });

  it('[BL17-4] menemukan minimal 11 action yang teramati di DB nyata', () => {
    // Lantai dari audit BL-17: 733 baris `activity_logs` produksi memuat 11 action unik.
    // Turun di bawahnya = parser regresi, bukan action hilang.
    for (const action of [
      'create',
      'review_approve',
      'review_reject',
      'submit',
      'scores_calculated',
      'update',
      'period_closed',
      'score_override_applied',
      'instance_marked_overdue',
      'score_formula_draft_created',
      'start',
    ]) {
      expect(parsed.actions).toContain(action);
    }
  });

  it('[BL17-5] setiap action yang di-emit migrasi punya label di client', () => {
    const missing = parsed.actions.filter((a) => ACTIVITY_LOG_ACTION_LABEL[a] === undefined);
    expect({ missing, sourceOfTruth: parsed.actions }).toEqual({
      missing: [],
      sourceOfTruth: parsed.actions,
    });
  });

  it('[BL17-6] tidak ada label yatim di client', () => {
    // Kebalikan dari BL17-5: label untuk action yang tak pernah ditulis siapa pun menumpuk
    // diam-diam. Inilah assertion yang menangkap `instance_missed` (tipe notifikasi, bukan
    // action) di peta warisan.
    const emitted = new Set(parsed.actions);
    const orphans = Object.keys(ACTIVITY_LOG_ACTION_LABEL)
      .filter((a) => !emitted.has(a))
      .sort();
    expect(orphans).toEqual([]);
  });

  it('[BL17-7] setiap site non-literal sudah ditinjau', () => {
    // Emitter dinamis harus MEMERAHKAN test supaya ditinjau manusia — bukan lewat begitu
    // saja dan menjadi lubang di gate.
    const unreviewed = parsed.dynamicSites
      .filter((s) => !ALLOWED_DYNAMIC_EXPRESSIONS.includes(s.expression))
      .map((s) => `${s.file}: ${s.expression}`);
    expect(unreviewed).toEqual([]);
  });
});
