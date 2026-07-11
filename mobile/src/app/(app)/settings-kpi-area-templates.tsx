// UI-S-KT1 — Layar mandiri Strategy Template, grouping per Goal Template (proxy divisi).
// Read-only V1; edit/tambah baris dilakukan di Goal Template Library (settings-goal-templates)
// karena baris template anak dimiliki goal template parent. Tombol "Edit di Template"
// melempar ke parent Goal Template.
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, EmptyState, SectionCard, SkeletonList, usePlaceholderColor } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { listAllStrategyTemplates, type StrategyTemplateWithParent } from '@/lib/goals';

export default function SettingsStrategyTemplatesScreen() {
  const router = useRouter();
  const { can } = useProfile();
  const allowed = can('manage_strategy_templates') || can('manage_goal_templates');
  const placeholderColor = usePlaceholderColor();
  const [q, setQ] = useState('');

  const tplQ = useQuery({
    queryKey: ['strategy_templates', 'all'],
    queryFn: listAllStrategyTemplates,
    enabled: allowed,
  });

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (tplQ.data ?? []).filter((r) => {
      if (!needle) return true;
      const hay = `${r.name ?? ''} ${r.goal_templates?.name ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
    const map = new Map<string, { parent: { id: string; name: string } | null; rows: StrategyTemplateWithParent[] }>();
    for (const r of filtered) {
      const key = r.goal_template_id ?? 'orphan';
      const slot = map.get(key) ?? { parent: r.goal_templates, rows: [] };
      slot.rows.push(r);
      map.set(key, slot);
    }
    return Array.from(map.entries());
  }, [tplQ.data, q]);

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Strategy Template' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Strategy Template</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Library Strategy siap pakai, dikelompokkan per Goal Template.
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Pengelolaan Strategy Template memerlukan izin Goal/Strategy Template." />
        ) : tplQ.isLoading ? (
          <SkeletonList count={5} />
        ) : (
          <>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Strategy Template di-grup per Goal Template parent. Edit baris dilakukan di Goal Template Library.
            </Text>
            <TextInput
              accessibilityLabel="Cari Strategy Template"
              placeholder="Cari nama Strategy atau Goal Template…"
              placeholderTextColor={placeholderColor}
              value={q}
              onChangeText={setQ}
              className="min-h-[44px] rounded-xl border border-neutral-300 px-4 text-base text-black dark:border-neutral-700 dark:text-white"
            />
            {grouped.length === 0 ? (
              <EmptyState
                title="Belum ada Strategy Template"
                description="Buat Goal Template + Strategy Template di Goal Template Library."
                action={{
                  label: 'Buka Goal Template Library',
                  onPress: () => router.push('/settings-goal-templates' as Href),
                }}
              />
            ) : (
              grouped.map(([key, slot]) => (
                <View key={key} className="gap-2">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                      Goal Template · {slot.parent?.name ?? 'Tanpa parent'}
                    </Text>
                    {slot.parent ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Buka Goal Template ${slot.parent.name}`}
                        className="active:opacity-70"
                        onPress={() => router.push('/settings-goal-templates' as Href)}>
                        <Text className="text-xs font-semibold text-brand-dark">Edit di Template ›</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {slot.rows.map((r) => (
                    <SectionCard key={r.id}>
                      <Text className="text-base font-semibold text-black dark:text-white">{r.name}</Text>
                      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                        Divisi: {r.division_label || r.division}
                      </Text>
                    </SectionCard>
                  ))}
                </View>
              ))
            )}
            <Button
              label="Buka Goal Template Library"
              variant="secondary"
              onPress={() => router.push('/settings-goal-templates' as Href)}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}
