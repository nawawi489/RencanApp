// PPL-06 sub-sections — dipisah dari `app/(app)/people-profile/[id].tsx` (Fase E refactor).
// Test PPL-06-Q1..Q4 + PPL-06-K1..K3 mengunci behavior via layar; komponen ini murni presentasional.
import { Text, View } from 'react-native-css/components';

import { GuidanceNote, ScoreSparkline, SectionCard } from '@/components/ui';

/**
 * Tren sparkline. Render null bila `points` kosong (RLS-deny history atau belum ada histori).
 * Konsumen memutuskan kapan Tren muncul (self vs cross-user visibility).
 */
export function TrendSection({ points }: { points: number[] }) {
  if (!points.length) return null;
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
        Tren
      </Text>
      <ScoreSparkline points={points} />
    </View>
  );
}

export type ContributionSectionProps = {
  /**
   * OQ-6 sub-2 diputuskan 2026-07-05: untuk profil orang lain, sembunyikan seksi bila count=0
   * (menghindari ambiguitas 0-nyata vs RLS-hidden). Konsumen menghitung `show = isSelf || count>0`.
   */
  show: boolean;
  isLoading: boolean;
  count: number;
};

/**
 * Seksi "Kontribusi bulan ini" (PPL-06 / OQ-6). 3 branch:
 * loading → text "Memuat kontribusi…"; count>0 → "N tugas selesai bulan ini";
 * count=0 (dan `show=true`, biasanya isSelf) → GuidanceNote.
 */
export function ContributionSection({ show, isLoading, count }: ContributionSectionProps) {
  if (!show) return null;
  return (
    <SectionCard>
      <Text className="text-base font-semibold text-black dark:text-white">
        Kontribusi bulan ini
      </Text>
      {isLoading ? (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">Memuat kontribusi…</Text>
      ) : count > 0 ? (
        <Text className="text-sm text-black dark:text-white">
          {count} tugas selesai bulan ini
        </Text>
      ) : (
        <GuidanceNote
          title="Skor menyusul"
          body="Belum ada AP selesai bulan ini pada periode aktif."
        />
      )}
    </SectionCard>
  );
}
