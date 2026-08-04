// Komponen bersama Fase 5 — indikator Kelengkapan Perencanaan + gating aktivasi (popup ramah).
// Dipakai di Strategi / Inisiatif / Rencana Aksi detail. Server (RPC activate_*) tetap penegak akhir;
// gating klien hanya pre-flight untuk mode 'blokir_aktivasi' agar UX jelas sebelum network call.
import { Text, View } from 'react-native-css/components';

import { Badge } from './ui';
import { showAlert } from '@/lib/alert';
import { ENFORCEMENT_MODE_TONE, complianceLabel, type MbrCompliance } from '@/lib/settings-mbr';

/** Kartu indikator rasio turunan vs minimum. Tidak render bila compliance belum tersedia atau nonaktif. */
export function MbrCompletionIndicator({ compliance }: { compliance: MbrCompliance | undefined }) {
  if (!compliance || compliance.enforcement_mode === 'nonaktif') return null;
  return (
    <View
      accessibilityLabel="Kelengkapan Perencanaan"
      className="flex-row items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <Text className="text-sm font-semibold text-black dark:text-white">Kelengkapan Perencanaan</Text>
      <Badge
        label={complianceLabel(compliance.child_count, compliance.min_count)}
        tone={compliance.is_compliant ? 'success' : ENFORCEMENT_MODE_TONE[compliance.enforcement_mode]}
      />
    </View>
  );
}

/**
 * Gating aktivasi mode 'blokir_aktivasi'. Mengembalikan true bila TERBLOKIR (popup ditampilkan,
 * pemanggil harus berhenti); false bila boleh lanjut. Fail-open saat compliance belum ada.
 */
export function guardMbrActivation(
  compliance: MbrCompliance | undefined,
  opts: { childLabel: string; onAddChild: () => void },
): boolean {
  if (
    compliance &&
    compliance.enforcement_mode === 'blokir_aktivasi' &&
    !compliance.is_compliant
  ) {
    const need = compliance.min_count - compliance.child_count;
    showAlert(
      'Tidak Dapat Melanjutkan',
      `Baru ada ${compliance.child_count} dari ${compliance.min_count} ${opts.childLabel}. ` +
        `Tambahkan ${need} ${opts.childLabel} lagi agar bisa diaktifkan.`,
      [
        { text: 'Tutup', style: 'cancel' },
        { text: `+ Tambah ${opts.childLabel}`, onPress: opts.onAddChild },
      ],
    );
    return true;
  }
  return false;
}
