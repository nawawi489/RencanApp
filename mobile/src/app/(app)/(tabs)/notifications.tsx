import { PlaceholderCard, Screen } from '@/components/screen';

export default function NotificationsScreen() {
  return (
    <Screen title="Notifications" subtitle="Pusat alert & tindakan.">
      <PlaceholderCard
        title="Belum ada notifikasi"
        description="Review request, approval, deadline reminder, dan repeat due akan tampil di sini (Fase 3)."
      />
    </Screen>
  );
}
