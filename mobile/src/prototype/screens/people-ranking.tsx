import { Text, View } from 'react-native-css/components';

import { prototypePeople } from '@/prototype/fixtures/people';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypePeopleRankingScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title="Rencanaapp" kicker="People Ranking" initials="RJ" />
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">Ranking</Text>
        {prototypePeople.roster.map((person, index) => (
          <View key={person.name} className="rounded-[20px] border border-[#dde3eb] bg-white p-4">
            <Text className="text-sm font-semibold text-[#667085]">#{index + 1}</Text>
            <Text className="mt-2 text-base font-bold text-[#172033]">{person.name}</Text>
            <Text className="mt-1 text-sm text-[#667085]">{person.subhead}</Text>
          </View>
        ))}
      </View>
    </PrototypeThemeBoundary>
  );
}
