import { PlaceholderCard, Screen } from '@/components/screen';

export default function PeopleScreen() {
  return (
    <Screen title="People" subtitle="Performa user berbasis data eksekusi.">
      <PlaceholderCard
        title="Belum ada data performa"
        description="Achievement Score, Completion, Compliance, dan Ranking muncul setelah ada data eksekusi (Fase 7)."
      />
    </Screen>
  );
}
