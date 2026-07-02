import { Text, View } from 'react-native-css/components';

import { prototypeDetails } from '@/prototype/fixtures/details';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';

export default function PrototypeActionPlanDetailScreen() {
  return (
    <PrototypeThemeBoundary>
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">{prototypeDetails.actionPlan.title}</Text>
        <Text className="text-base font-semibold text-[#172033]">{prototypeDetails.actionPlan.sections[0]}</Text>
        <Text className="text-base font-semibold text-[#172033]">{prototypeDetails.actionPlan.sections[1]}</Text>
      </View>
    </PrototypeThemeBoundary>
  );
}
