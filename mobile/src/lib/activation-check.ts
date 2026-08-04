// Completeness popups (PRD V1.8.2/V1.8.3 §7.4 + §7.5).
//
// Pre-flight validator klien — wajib field per tipe kartu = HARDCODED_CORE
// (locked base sesuai server RPC activate_*) + admin extras dari
// public.card_completion_rules (via getCompletionRule). Server tetap penegak
// akhir; klien hanya UX shortcut.
//
// Popup copy PRD §7.4 GENERIC — tidak menyebut nama field spesifik.
// missingRequiredFor tetap kembalikan label untuk telemetry/log saja.
import { getCompletionRule, type CardTypeGated } from './card-rules';
import { createLogger } from './logger';
import { CARD_TYPE_LABEL, type MbrCompliance } from './settings-mbr';

const log = createLogger('ActivationCheck');

export type ActivatableCardType = CardTypeGated;

/** Shape minimum untuk pengecekan — caller cukup spread row tabel apa pun. */
export type CardForCheck = {
  name?: string | null;
  pic_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  target?: string | null;
  target_value?: string | null;
  target_result?: string | null;
  expected_outcome?: string | null;
  reason?: string | null;
  main_risk?: string | null;
  alternative?: string | null;
  impact?: string | null;
  team_id?: string | null;
};

type AlertFn = (
  title: string,
  message: string,
  buttons?: { text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }[],
) => void;

const FIELD_LABEL: Record<string, string> = {
  name: 'Nama',
  pic_id: 'PIC',
  period_start: 'Periode mulai',
  period_end: 'Periode selesai',
  target: 'Target',
  target_value: 'Target Tahunan',
  target_result: 'Target Hasil',
  expected_outcome: 'Ekspektasi Hasil',
  reason: 'Alasan',
  main_risk: 'Risiko Utama',
  alternative: 'Alternatif',
  impact: 'Dampak',
  team_id: 'Tim',
};

// F1 (critic): HARDCODED_CORE per cardType eksplisit — mirror locked base RPC
// activate_* di server (migration 0078). Fall-through kosong DILARANG.
export const HARDCODED_CORE: Record<ActivatableCardType, string[]> = {
  goal:              ['name', 'pic_id', 'period_start', 'period_end', 'target_value'],
  strategy:          ['name', 'pic_id', 'period_start', 'period_end', 'target', 'expected_outcome'],
  initiative:        ['name', 'pic_id', 'period_start', 'period_end', 'reason', 'main_risk', 'alternative'],
  action_plan:       ['name', 'pic_id', 'period_start', 'period_end', 'target_result', 'team_id'],
  development_area:  ['name', 'pic_id', 'period_start', 'period_end'],
  problem_statement: ['name', 'pic_id', 'period_start', 'period_end', 'impact'],
};

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * Kembalikan array label field wajib yang KOSONG (merge HARDCODED_CORE +
 * admin extras). Caller pakai untuk logger/telemetry — POPUP jangan menyebut
 * daftar (PRD §7.4).
 */
export async function missingRequiredFor(
  orgId: string,
  cardType: ActivatableCardType,
  card: CardForCheck,
): Promise<string[]> {
  let extras: string[] = [];
  try {
    const rule = await getCompletionRule(orgId, cardType);
    extras = rule.requiredFields;
  } catch (err) {
    log.warn({ event: 'card_rule_offline_fallback', cardType, err });
  }
  const requiredSet = new Set<string>([...HARDCODED_CORE[cardType], ...extras]);
  const missing: string[] = [];
  for (const field of requiredSet) {
    if (isEmpty((card as Record<string, unknown>)[field])) {
      missing.push(FIELD_LABEL[field] ?? field);
    }
  }
  return missing;
}

/**
 * §7.4 — Pre-flight popup Aktifkan. Return `true` bila TERBLOKIR (caller stop,
 * TIDAK panggil activate_*). Popup GENERIC — tak menyebut field spesifik.
 */
export async function guardActivationFields(
  orgId: string,
  cardType: ActivatableCardType,
  card: CardForCheck,
  alertImpl?: AlertFn,
): Promise<boolean> {
  const missing = await missingRequiredFor(orgId, cardType, card);
  if (missing.length === 0) return false;
  const title = 'Aktifkan Card';
  const msg = 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.';
  // detail.missing di log untuk telemetry (bukan ke user)
  log.info({ event: 'activation_blocked', cardType, missing });
  if (alertImpl) {
    alertImpl(title, msg);
    return true;
  }
  // Lazy import default seam lintas-platform. JANGAN `react-native` `Alert.alert`
  // langsung: no-op di web → popup guard aktivasi tak pernah tampil di 6 layar.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { showAlert } = require('./alert') as { showAlert: AlertFn };
  showAlert(title, msg);
  return true;
}

/**
 * Kalimat guard MBR §12.3 untuk tombol "+ <next>" di tree (spec §6.6/§12.3).
 * Tetap sync — sumber `MbrCompliance` sudah pre-fetched via useMbr hook lain.
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
