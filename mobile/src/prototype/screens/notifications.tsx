import { Text, View } from 'react-native-css/components';

import { prototypeNotifications } from '@/prototype/fixtures/notifications';
import { PrototypeBottomNav } from '@/prototype/ui/shell/prototype-bottom-nav';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypeNotificationsScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title="Rencanaapp" kicker="Notifikasi" initials="RJ" />
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">Notifications</Text>
        <View className="flex-row flex-wrap gap-2">
          {prototypeNotifications.tabs.map((tab) => (
            <Text key={tab} className="rounded-full border border-[#dde3eb] bg-white px-3 py-2 text-xs font-semibold text-[#667085]">
              {tab}
            </Text>
          ))}
        </View>
        <Text className="mt-2 text-xs font-semibold uppercase text-[#667085]">Baru</Text>
        <View className="rounded-[20px] border border-[#dde3eb] bg-white p-4">
          <Text className="text-sm font-semibold text-[#172033]">{prototypeNotifications.fresh[0].title}</Text>
          <Text className="mt-3 text-sm font-semibold text-[#172033]">Review</Text>
          <Text className="mt-1 text-sm font-semibold text-[#172033]">Lihat Bukti</Text>
        </View>
        <Text className="text-xs font-semibold uppercase text-[#667085]">Sebelumnya</Text>
      </View>
      <PrototypeBottomNav active="notifications" />
    </PrototypeThemeBoundary>
  );
}
