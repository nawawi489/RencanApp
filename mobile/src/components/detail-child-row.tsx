import { Text, View } from 'react-native-css/components';

import { Badge, SectionCard, type Tone } from '@/components/ui';

/**
 * Baris anak turunan di detail-screen (Goal → KPI Area, KPI Area → Strategy,
 * Strategy → Initiative, Problem Statement → Initiative, Development Area →
 * Problem Statement). Sama untuk kelimanya: nama + status badge di kanan.
 */
export function DetailChildRow({
  name,
  statusLabel,
  statusTone,
  onPress,
}: {
  name: string;
  statusLabel: string;
  statusTone: Tone;
  onPress: () => void;
}) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{name}</Text>
        <Badge label={statusLabel} tone={statusTone} />
      </View>
    </SectionCard>
  );
}
