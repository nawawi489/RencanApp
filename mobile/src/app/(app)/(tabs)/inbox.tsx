import { Text } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/ui';

export default function InboxScreen() {
  return (
    <Screen title="Inbox" subtitle="Khusus chat Initiative.">
      <EmptyState
        icon={<Text className="text-2xl">💬</Text>}
        title="Belum ada percakapan"
        description="Setiap Initiative otomatis punya chat room. Aktif pada Fase 3."
      />
    </Screen>
  );
}
