import { Text, View } from 'react-native-css/components';

import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypePeopleProfileScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title="Rencanaapp" kicker="People Profile" initials="RJ" />
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">Rina Jaya</Text>
        <Text className="text-sm text-[#667085]">Staf Marketing</Text>
        <Text className="text-sm font-semibold text-[#172033]">Chat</Text>
      </View>
    </PrototypeThemeBoundary>
  );
}
