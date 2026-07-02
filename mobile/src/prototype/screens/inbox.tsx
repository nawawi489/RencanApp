import { Text, View } from 'react-native-css/components';

import { prototypeInbox } from '@/prototype/fixtures/inbox';
import { PrototypeBottomNav } from '@/prototype/ui/shell/prototype-bottom-nav';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypeInboxScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title="Rencanaapp" kicker="Inbox" initials="RJ" />
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">Inbox</Text>
        <View className="flex-row flex-wrap gap-2">
          {prototypeInbox.filters.map((item) => (
            <Text key={item} className="rounded-full border border-[#dde3eb] bg-white px-3 py-2 text-xs font-semibold text-[#667085]">
              {item}
            </Text>
          ))}
        </View>
        {prototypeInbox.rooms.map((room) => (
          <View key={room.title} className="rounded-[20px] border border-[#dde3eb] bg-white p-4">
            <Text className="text-base font-bold text-[#172033]">{room.title}</Text>
            <Text className="mt-2 text-sm text-[#667085]">{room.preview}</Text>
          </View>
        ))}
      </View>
      <PrototypeBottomNav active="inbox" />
    </PrototypeThemeBoundary>
  );
}
