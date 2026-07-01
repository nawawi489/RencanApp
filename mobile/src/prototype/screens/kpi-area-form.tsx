import { Text, View } from 'react-native-css/components';

import { prototypeForms } from '@/prototype/fixtures/forms';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';

export default function PrototypeKpiAreaFormScreen() {
  return (
    <PrototypeThemeBoundary>
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">KPI Area Baru</Text>
        <Text className="text-base font-semibold text-[#172033]">{prototypeForms.kpiArea[0]}</Text>
        <Text className="text-base font-semibold text-[#172033]">{prototypeForms.kpiArea[1]}</Text>
      </View>
    </PrototypeThemeBoundary>
  );
}
