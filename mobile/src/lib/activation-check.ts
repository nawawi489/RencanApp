// Completeness popups (PRD V1.8.2 §7.4 + §7.5).
//
// Pre-flight validator klien — wajib field per tipe kartu sesuai server RPC activate_*
// (sumber kebenaran: 0010_fase4_performance_workspace.sql + 0012_fase6_development_workspace.sql
// + 0005_fase1_card_engine.sql). Server tetap penegak akhir; klien hanya UX shortcut.
//
// Alert injectable (`alertImpl`) supaya unit test pure tanpa react-native Alert.
import { Alert } from 'react-native';

import { CARD_TYPE_LABEL, type MbrCompliance } from './settings-mbr';

export type ActivatableCardType =
  | 'goal'
  | 'kpi_area'
  | 'strategy'
  | 'initiative'
  | 'development_area'
  | 'problem_statement';

const CARD_LABEL: Record<ActivatableCardType, string> = {
  goal: 'Goal',
  kpi_area: 'KPI Area',
  strategy: 'Strategy',
  initiative: 'Initiative',
  development_area: 'Development Area',
  problem_statement: 'Problem Statement',
};

/** Shape minimum yang dibutuhkan helper — caller cukup spread row tabel apa pun. */
export type CardForCheck = {
  name?: string | null;
  pic_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  target?: string | null;
  target_result?: string | null;
  reason?: string | null;
  main_risk?: string | null;
  alternative?: string | null;
};

type AlertFn = (
  title: string,
  message: string,
  buttons?: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }>,
) => void;

function trimEmpty(v: string | null | undefined): boolean {
  return !v || v.trim() === '';
}

/**
 * Daftar label field yang KOSONG menurut aturan server activate_<type>.
 * Kembalikan [] bila semua lengkap. Caller pakai untuk popup §7.4.
 */
export function missingRequiredFor(cardType: ActivatableCardType, card: CardForCheck): string[] {
  const missing: string[] = [];
  if (trimEmpty(card.name)) missing.push('Nama');
  if (!card.pic_id) missing.push('PIC');
  if (!card.period_start) missing.push('Periode mulai');
  if (!card.period_end) missing.push('Periode selesai');

  switch (cardType) {
    case 'kpi_area':
      if (trimEmpty(card.target)) missing.push('Target');
      break;
    case 'strategy':
      if (trimEmpty(card.reason)) missing.push('Alasan');
      if (trimEmpty(card.main_risk)) missing.push('Risiko Utama');
      if (trimEmpty(card.alternative)) missing.push('Alternatif');
      break;
    case 'initiative':
      if (trimEmpty(card.target_result)) missing.push('Target Hasil');
      break;
    case 'goal':
    case 'development_area':
    case 'problem_statement':
      break;
  }
  return missing;
}

/**
 * §7.4 — Pre-flight popup Aktifkan. Return `true` bila TERBLOKIR (caller harus berhenti
 * dan TIDAK panggil activate_*). Tampilkan satu popup berisi daftar field yang kosong.
 */
export function guardActivationFields(
  cardType: ActivatableCardType,
  card: CardForCheck,
  alertImpl?: AlertFn,
): boolean {
  const missing = missingRequiredFor(cardType, card);
  if (missing.length === 0) return false;
  const title = 'Lengkapi data wajib';
  const msg = `${CARD_LABEL[cardType]} ini belum bisa diaktifkan. Lengkapi: ${missing.join(', ')}.`;
  (alertImpl ?? (Alert.alert as AlertFn))(title, msg);
  return true;
}

/**
 * §7.5 / §12.3 — Guard Minimum Breakdown Rule saat klik "+ Tambah X".
 *
 * WSA-04: guard fail-CLOSED dan TIDAK membuka form.
 * - Compliant → `onProceed()` langsung tanpa popup.
 * - Belum compliant → popup kalimat spec §12.3 dengan SATU tombol "Tutup"; `onProceed`
 *   tidak pernah dipanggil (klik tidak membuka form; server tetap penegak akhir).
 * - Data compliance belum ada (undefined) → fail-closed: popup "tunggu", `onProceed`
 *   tidak dipanggil (dulu fail-open — memungkinkan bypass guard).
 */
export function confirmAddDescendantIfIncomplete(opts: {
  compliance: MbrCompliance | undefined;
  parentLabel: string;
  childLabel: string;
  onProceed: () => void;
  alertImpl?: AlertFn;
}): void {
  const { compliance, parentLabel, childLabel, onProceed, alertImpl } = opts;
  const alert = alertImpl ?? (Alert.alert as AlertFn);
  if (compliance?.is_compliant) {
    onProceed();
    return;
  }
  if (!compliance) {
    // Fail-closed: belum tahu kepatuhan → jangan buka form.
    alert('Mengecek kelengkapan', 'Data kelengkapan belum siap. Coba lagi sebentar.', [
      { text: 'Tutup', style: 'cancel' },
    ]);
    return;
  }
  alert(mbrIncompleteMessage(parentLabel, childLabel, compliance).title,
    mbrIncompleteMessage(parentLabel, childLabel, compliance).message, [
      { text: 'Tutup', style: 'cancel' },
    ]);
}

/**
 * Kalimat guard MBR §12.3 untuk tombol "+ <next>" di tree (terkunci spec §6.6/§12.3):
 * "<ParentType> ini baru punya <n> dari <min> <Child>. Tambahkan <sisa> <Child> lagi dulu,
 *  baru tombol + <NextButton> aktif."
 * `parentTypeLabel` = label TIPE parent (mis. "KPI Area"); `nextButtonLabel` = turunan yang
 * tombolnya di-guard (mis. "Initiative"); jenis child yang dihitung diambil dari compliance.
 */
export function mbrBreakdownGuardMessage(
  parentTypeLabel: string,
  compliance: MbrCompliance,
  nextButtonLabel: string,
): { title: string; message: string } {
  const childLabel = compliance.child_card_type
    ? CARD_TYPE_LABEL[compliance.child_card_type]
    : 'turunan';
  const remaining = Math.max(compliance.min_count - compliance.child_count, 0);
  return {
    title: 'Kelengkapan Perencanaan',
    message:
      `${parentTypeLabel} ini baru punya ${compliance.child_count} dari ${compliance.min_count} ${childLabel}. ` +
      `Tambahkan ${remaining} ${childLabel} lagi dulu, baru tombol + ${nextButtonLabel} aktif.`,
  };
}

/**
 * Kalimat guard MBR §12.3 (terkunci spec). `childLabel` = jenis turunan yang dihitung
 * (mis. "Strategy"); pesan mengikuti pola:
 * "<Parent> ini baru punya <n> dari <min> <Child>. Tambahkan <sisa> <Child> lagi dulu, …".
 */
export function mbrIncompleteMessage(
  parentLabel: string,
  childLabel: string,
  compliance: MbrCompliance,
): { title: string; message: string } {
  const remaining = Math.max(compliance.min_count - compliance.child_count, 0);
  return {
    title: 'Kelengkapan Perencanaan',
    message:
      `${parentLabel} ini baru punya ${compliance.child_count} dari ${compliance.min_count} ${childLabel}. ` +
      `Tambahkan ${remaining} ${childLabel} lagi dulu, baru turunan berikutnya bisa dibuat.`,
  };
}
