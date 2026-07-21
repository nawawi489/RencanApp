// BL-04 — pemetaan cascade MBR: aturan mana menjaga tombol tambah yang mana.
//
// SEMANTIK (keputusan owner 2026-07-20, PR #139): MBR memakai CASCADE SATU TINGKAT, bukan guard
// per-level. Aturan `X → Y` yang belum patuh menahan pembuatan `Z` di bawah `Y`; ia TIDAK menahan
// pembuatan `Y` itu sendiri. Jadi tombol yang dijaga selalu milik kartu ANAK dari induk yang
// diperiksa kepatuhannya — bukan milik induk itu.
//
//   compliance dibaca pada X  →  tombol yang dijaga menempel di kartu Y  →  tombol itu membuat Z
//
// PENAMAAN. Semua nilai di file ini adalah penamaan SEKARANG (pasca rename tabel 0045 + penulisan
// ulang RPC 0046/0065), yaitu penamaan yang sama dengan yang diterima
// `check_minimum_breakdown_compliance`: strategy = Strategi, initiative = Inisiatif,
// action_plan = Rencana Aksi, task = Tugas.
//
// Alias legacy `kpi_area` TIDAK dipakai di sini. Baris aturan yang masih memakainya sudah
// dipindahkan oleh migrasi 0080; komentar lama di `settings-mbr.ts` yang menyamakan `kpi_area`
// dengan level Strategi menggambarkan keadaan SEBELUM 0046 dan tidak berlaku untuk pemetaan ini.
// Karena itu pemetaan ditulis eksplisit di bawah dan dikunci tes — bukan dicocokkan dari string.
import type { CardType, MbrCompliance } from './settings-mbr';

/** Satu tombol tambah di tree Workspace yang tunduk pada cascade MBR. */
export type MbrCascadeTarget = {
  /** Jenis kartu yang kepatuhannya dibaca — argumen pertama `check_minimum_breakdown_compliance`. */
  complianceParentType: CardType;
  /** Jenis kartu yang MEMILIKI tombol tambah tsb (anak dari `complianceParentType`). */
  guardedCardType: CardType;
  /** Jenis kartu yang DIBUAT tombol itu (cucu dari `complianceParentType`). */
  createdCardType: CardType;
  /** Teks tombol yang terlihat user, tanpa "+" — dipakai di kalimat guard. */
  buttonLabel: string;
};

/**
 * Keenam aturan `minimum_breakdown_rules` dan tombol yang masing-masing jaga.
 *
 * `action_plan → task` sengaja TIDAK punya entri: cucunya adalah turunan Tugas, sedangkan Tugas
 * adalah level terbawah tree (spec §6.8/§7.5 — tanpa tombol tambah). Aturan itu tetap menegakkan
 * mode `blokir_aktivasi` lewat gerbang aktivasi Rencana Aksi; hanya cascade-nya yang nihil sasaran.
 */
export const MBR_CASCADE_TARGETS: MbrCascadeTarget[] = [
  // Performance: Goal → Strategi → Inisiatif → Rencana Aksi → Tugas.
  {
    complianceParentType: 'goal',
    guardedCardType: 'strategy',
    createdCardType: 'initiative',
    buttonLabel: 'Inisiatif',
  },
  {
    complianceParentType: 'strategy',
    guardedCardType: 'initiative',
    createdCardType: 'action_plan',
    buttonLabel: 'Rencana Aksi',
  },
  {
    complianceParentType: 'initiative',
    guardedCardType: 'action_plan',
    createdCardType: 'task',
    buttonLabel: 'Plan',
  },
  // Development: Development Area → Problem Statement → Rencana Aksi → Tugas.
  {
    complianceParentType: 'development_area',
    guardedCardType: 'problem_statement',
    createdCardType: 'action_plan',
    buttonLabel: 'Rencana Aksi',
  },
  {
    complianceParentType: 'problem_statement',
    guardedCardType: 'action_plan',
    createdCardType: 'task',
    buttonLabel: 'Plan',
  },
];

/**
 * Apakah tombol tambah turunan harus ditahan.
 *
 * HANYA mode `blokir_akses_turunan` yang menahan tombol — itu satu-satunya mode yang menjanjikan
 * penguncian turunan (lihat `ENFORCEMENT_MODE_DESC`). `blokir_aktivasi` mengurus gerbang aktivasi
 * di layar detail, `hanya_peringatan` cuma menampilkan indikator, `nonaktif` tidak melakukan apa pun
 * — ketiganya TIDAK boleh menyentuh tombol tambah.
 *
 * Fail-open saat `compliance` belum ter-fetch (undefined): jangan pernah menahan tombol karena data
 * yang belum sampai.
 */
export function isMbrCascadeBlocked(compliance: MbrCompliance | undefined): boolean {
  return (
    !!compliance &&
    compliance.enforcement_mode === 'blokir_akses_turunan' &&
    !compliance.is_compliant
  );
}
