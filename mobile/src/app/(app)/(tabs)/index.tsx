import { PlaceholderCard, Screen } from '@/components/screen';

export default function HomeScreen() {
  return (
    <Screen title="Home" subtitle="Today Command Center — fokus kerja Anda hari ini.">
      <PlaceholderCard
        title="Action Plan hari ini"
        description="Daftar pekerjaan yang jatuh tempo hari ini akan muncul di sini (Fase 1–3)."
      />
      <PlaceholderCard
        title="Butuh review"
        description="Card yang menunggu Anda review. Aktif setelah loop eksekusi dibangun."
      />
      <PlaceholderCard
        title="Terlewat & deadline mendekat"
        description="Pengingat keterlambatan dan tenggat yang sudah dekat."
      />
    </Screen>
  );
}
