import { PlaceholderCard, Screen } from '@/components/screen';

export default function InboxScreen() {
  return (
    <Screen title="Inbox" subtitle="Chat per Initiative.">
      <PlaceholderCard
        title="Belum ada percakapan"
        description="Setiap Initiative otomatis punya chat room. Aktif pada Fase 3."
      />
    </Screen>
  );
}
