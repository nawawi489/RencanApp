import { PlaceholderCard, Screen } from '@/components/screen';

export default function WorkspaceScreen() {
  return (
    <Screen title="Workspace" subtitle="Performance & Development — struktur card eksekusi.">
      <PlaceholderCard
        title="Performance Workspace"
        description="Goal → KPI Area → Strategy → Initiative → Action Plan (Fase 1 & 4)."
      />
      <PlaceholderCard
        title="Development Workspace"
        description="Development Area → Problem Statement → Initiative → Action Plan (Fase 6)."
      />
    </Screen>
  );
}
