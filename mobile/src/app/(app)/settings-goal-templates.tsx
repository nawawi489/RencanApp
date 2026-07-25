// UI — Goal Template Library (mockup 37) + Strategi Template (mockup 38, nested).
// Browse read-only template blueprint Fase 4 (data layer sudah ada: goal_templates / strategy_templates).
// CTA "Buat Goal dari Template" → goal-wizard (yang menjalankan apply_goal_template). Hanya tampil
// bila create_goal. Lazy: Strategi template di-fetch saat baris template di-expand.
import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

import { Badge, Button, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { useGoalTemplates, useStrategyTemplates } from '@/hooks/use-workspace';
import { useProfile } from '@/hooks/use-profile';
import type { GoalTemplate } from '@/lib/goals';

const LIST_CONTENT_STYLE = { gap: 12, padding: 20 };

function TemplateRow({ template, canCreate, onUse }: { template: GoalTemplate; canCreate: boolean; onUse: () => void }) {
  const [expanded, setExpanded] = useState(false);
  // Lazy: id kosong saat collapsed → hook disabled (enabled: !!goalTemplateId).
  const { items, isLoading } = useStrategyTemplates(expanded ? template.id : '');

  return (
    <View className="gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <View className="gap-1">
        <Text className="text-base font-bold text-black dark:text-white">{template.name}</Text>
        {template.description ? (
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">{template.description}</Text>
        ) : null}
      </View>

      <Pressable
        className="min-h-[44px] flex-row items-center justify-between active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Tutup Strategi' : 'Lihat Strategi template'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}>
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">Blueprint Strategi</Text>
        <Text className="text-sm font-semibold text-brand-dark">
          {expanded ? 'Tutup' : 'Lihat Strategi'}
        </Text>
      </Pressable>

      {expanded ? (
        isLoading ? (
          <Text className="text-sm text-neutral-400">Memuat Strategi…</Text>
        ) : items.length ? (
          <View className="gap-2">
            {items.map((k) => (
              <View
                key={k.id}
                className="gap-1.5 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="flex-1 text-sm font-medium text-black dark:text-white">{k.name}</Text>
                  <Badge label={k.division_label} tone="info" />
                </View>
                {/* PRD §18 step 5 prefill — tampil bila admin sudah isi hint (kolom 0027). */}
                {k.target_hint ? (
                  <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Target awal: {k.target_hint}
                  </Text>
                ) : null}
                {k.expected_outcome_hint ? (
                  <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Ekspektasi Hasil: {k.expected_outcome_hint}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-neutral-400">Template ini belum punya Strategi.</Text>
        )
      ) : null}

      {canCreate ? <Button label="Buat Goal dari Template" variant="secondary" onPress={onUse} /> : null}
    </View>
  );
}

export default function SettingsGoalTemplatesScreen() {
  const router = useRouter();
  const { can } = useProfile();
  const { templates, isLoading, isError } = useGoalTemplates();
  const canCreate = can('create_goal');

  if (isLoading) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Goal Template' }} />
        <SkeletonList count={4} />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Goal Template' }} />
        <ErrorState title="Gagal memuat template" description="Tidak bisa mengambil daftar template." />
      </View>
    );
  }

  const header = (
    <View className="gap-1 pb-3">
      <Text className="text-2xl font-bold text-black dark:text-white">Goal Template Library</Text>
      <Text className="text-base text-neutral-500 dark:text-neutral-400">
        Blueprint Goal + Strategi siap pakai. {canCreate ? 'Pilih untuk membuat Goal lewat wizard.' : 'Hanya untuk referensi.'}
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ title: 'Goal Template' }} />
      <FlatList<GoalTemplate>
        contentContainerStyle={LIST_CONTENT_STYLE}
        data={templates}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon={<Text className="text-2xl">📋</Text>}
            title="Belum ada template"
            description="Template Goal akan muncul di sini saat tersedia untuk organisasi Anda."
          />
        }
        renderItem={({ item }) => (
          <TemplateRow
            template={item}
            canCreate={canCreate}
            onUse={() => router.push('/goal-wizard' as Href)}
          />
        )}
      />
    </View>
  );
}
