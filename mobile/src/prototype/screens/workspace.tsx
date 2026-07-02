import { Text, View } from 'react-native-css/components';

import { prototypeWorkspace } from '@/prototype/fixtures/workspace';
import { PrototypeBottomNav } from '@/prototype/ui/shell/prototype-bottom-nav';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypeWorkspaceScreen() {
  return (
    <PrototypeThemeBoundary>
      <PrototypeTopbar title="Rencanaapp" kicker="Workspace" initials="RJ" />
      <View className="flex-1 gap-4 p-5">
        <Text className="text-2xl font-bold text-[#172033]">Workspace</Text>
        {prototypeWorkspace.hubs.map((item) => (
          <View key={item.title} className="rounded-[20px] border border-[#dde3eb] bg-white p-4">
            <Text className="text-xl font-bold text-[#172033]">{item.title}</Text>
            <Text className="mt-2 text-sm text-[#667085]">{item.body}</Text>
            <Text className="mt-3 text-sm font-semibold text-[#1877f2]">{item.cta}</Text>
          </View>
        ))}
      </View>
      <PrototypeBottomNav active="workspace" />
    </PrototypeThemeBoundary>
  );
}
