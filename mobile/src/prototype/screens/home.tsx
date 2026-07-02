import { ScrollView, Text, View } from 'react-native-css/components';

import { prototypeHome } from '@/prototype/fixtures/home';
import { HeroCard } from '@/prototype/ui/cards/hero-card';
import { PriorityRail } from '@/prototype/ui/cards/priority-rail';
import { SnapshotTeamCard } from '@/prototype/ui/cards/snapshot-team-card';
import { TodayCard } from '@/prototype/ui/cards/today-card';
import { PrototypeBottomNav } from '@/prototype/ui/shell/prototype-bottom-nav';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypeHomeScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title={prototypeHome.title} kicker={prototypeHome.kicker} initials="RJ" />
      <ScrollView className="flex-1" contentContainerClassName="gap-5 p-5">
        <HeroCard
          dateLabel={prototypeHome.dateLabel}
          greeting={prototypeHome.greeting}
          body={prototypeHome.heroBody}
        />
        <View className="gap-3">
          <Text className="text-[20px] font-bold text-[#172033]">Prioritas</Text>
          <PriorityRail items={prototypeHome.priorities} />
        </View>
        <TodayCard title="Fokus Hari Ini" items={prototypeHome.focusItems} />
        <SnapshotTeamCard items={prototypeHome.snapshotItems} />
      </ScrollView>
      <PrototypeBottomNav active="home" />
    </PrototypeThemeBoundary>
  );
}
