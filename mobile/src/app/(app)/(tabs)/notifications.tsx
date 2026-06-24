import { Text } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/ui';

export default function NotificationsScreen() {
  return (
    <Screen title="Notifications" subtitle="Notifikasi resmi dan respons.">
      <EmptyState
        icon={<Text className="text-2xl">🔔</Text>}
        title="Belum ada notifikasi"
        description="Review request, approval, deadline reminder, dan repeat due akan tampil di sini (Fase 3)."
      />
    </Screen>
  );
}
