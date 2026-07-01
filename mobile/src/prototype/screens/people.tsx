import { Text, View } from 'react-native-css/components';

import { prototypePeople } from '@/prototype/fixtures/people';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypePeopleScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title="Rencanaapp" kicker="People" initials="RJ" />
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">People</Text>
        <View className="flex-row flex-wrap gap-2">
          {prototypePeople.tabs.map((tab) => (
            <Text key={tab} className="rounded-full border border-[#dde3eb] bg-white px-3 py-2 text-xs font-semibold text-[#667085]">
              {tab}
            </Text>
          ))}
        </View>
      </View>
    </PrototypeThemeBoundary>
  );
}
