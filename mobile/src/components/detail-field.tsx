import { Text } from 'react-native-css/components';

import { SectionCard } from '@/components/ui';

/**
 * Field teks label + value dibungkus SectionCard, pola dipakai di detail-screen
 * (Strategy, Problem Statement, Development Area) untuk Deskripsi/Alasan/Risiko/dll.
 */
export function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <SectionCard>
      <Text className="text-sm font-bold text-black dark:text-white">{label}</Text>
      <Text className="text-base text-black dark:text-white">{value}</Text>
    </SectionCard>
  );
}
