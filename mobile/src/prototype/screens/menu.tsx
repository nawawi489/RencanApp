import { Text, View } from 'react-native-css/components';

import { prototypeMenu } from '@/prototype/fixtures/menu';
import { PrototypeBottomNav } from '@/prototype/ui/shell/prototype-bottom-nav';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypeMenuScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title="Rencanaapp" kicker="Menu" initials="RJ" />
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">Menu</Text>
        {prototypeMenu.sections.map((item) => (
          <View key={item} className="rounded-[20px] border border-[#dde3eb] bg-white p-4">
            <Text className="text-base font-semibold text-[#172033]">{item}</Text>
          </View>
        ))}
      </View>
      <PrototypeBottomNav active="menu" />
    </PrototypeThemeBoundary>
  );
}
