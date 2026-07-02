// UI-N-002 Stage 2 — Hub-card lobby di tab Workspace. 2 instance (Performance + Development).
// Komposisi: orb % + 3-stat row + "Masuk →" button. Tap card area ATAU button → onEnter().
import { Pressable, Text, View } from 'react-native-css/components';

import { ProgressOrb } from '@/components/ui';
import type { HubStats } from '@/lib/workspace-hub-stats';

export function WorkspaceHubCard({
  kicker,
  title,
  meta,
  stats,
  enterLabel,
  parentStatLabel,
  childStatLabel,
  activeStatLabel,
  onEnter,
}: {
  kicker: string;
  title: string;
  meta: string;
  stats: HubStats;
  enterLabel: string;
  parentStatLabel: string;
  childStatLabel: string;
  activeStatLabel: string;
  onEnter: () => void;
}) {
  // Orb null (belum ada data) → tampilkan "—" tanpa angka misleading.
  // orbPercent sudah 0–100 (workspace-hub-stats), ProgressOrb juga 0–100 — jangan dibagi lagi.
  const orbValue = stats.orbPercent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${enterLabel}: ${stats.parentCount} ${parentStatLabel}, ${stats.childCount} ${childStatLabel}`}
      onPress={onEnter}
      className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-950">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold uppercase text-neutral-400">{kicker}</Text>
          <Text className="text-xl font-bold text-black dark:text-white">{title}</Text>
          <Text className="text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={2}>
            {meta}
          </Text>
        </View>
        {orbValue == null ? (
          <View className="h-[72px] w-[72px] items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-800">
            <Text className="text-sm font-semibold text-neutral-400">—</Text>
          </View>
        ) : (
          <ProgressOrb size={72} value={orbValue} sublabel="aktif" />
        )}
      </View>

      <View className="flex-row gap-2">
        <HubStat label={parentStatLabel} value={String(stats.parentCount)} />
        <HubStat label={childStatLabel} value={String(stats.childCount)} />
        <HubStat label={activeStatLabel} value={String(stats.activeCount)} />
      </View>

      <View className="flex-row items-center justify-end gap-1">
        <Text className="text-sm font-semibold text-brand-dark dark:text-brand">{enterLabel}</Text>
        <Text className="text-sm text-brand-dark dark:text-brand">›</Text>
      </View>
    </Pressable>
  );
}

function HubStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">{label}</Text>
      <Text className="text-base font-bold text-black dark:text-white">{value}</Text>
    </View>
  );
}
