// PRD §31 — Menu > Pengaturan > Repeat Setting. Inventory read-only seluruh repeat-rule
// yang user boleh lihat (difilter RLS). Tiap row tappable → buka Tugas induk untuk
// mengedit jadwal/missed rule. Edit jadwal tetap per-AP (PRD §23: "Repeat Setting adalah
// setting pada Tugas"), layar ini hanya navigasi.
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';

import { ScrollView, Text, View } from 'react-native-css/components';

import { Badge, EmptyState, ErrorState, SectionCard, SkeletonList } from '@/components/ui';
import { ACTION_PLAN_STATUS_LABEL, STATUS_TONE } from '@/lib/cards';
import { FREQUENCY_LABEL, listAllRepeatRules } from '@/lib/repeat';

export default function SettingsRepeatRulesScreen() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['repeat-rules', 'all'], queryFn: listAllRepeatRules });

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Pengaturan Pengulangan' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Pengaturan Pengulangan</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Daftar Tugas dengan jadwal berulang.
          </Text>
        </View>
        <SectionCard>
          <Text className="text-sm font-bold text-black dark:text-white">Tentang Pengaturan Pengulangan</Text>
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            Daftar Tugas dengan jadwal berulang. Ketuk salah satu untuk buka Tugas induk;
            di sana ada tombol Ubah Jadwal Repeat. Jadwal bisa diubah selama instance
            pertama belum ter-generate — setelah itu jadwal terkunci untuk menjaga
            konsistensi angka compliance historis.
          </Text>
        </SectionCard>

        {q.isLoading ? (
          <SkeletonList count={3} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data || q.data.length === 0 ? (
          <EmptyState
            title="Belum ada Tugas repeat"
            description="Buat Tugas dengan mode Repeat dari Rencana Aksi untuk menjadwalkan pekerjaan berulang."
          />
        ) : (
          q.data.map((r) => {
            const ap = r.task;
            const apName = ap?.name ?? '—';
            const apStatus = ap?.status ?? 'draft';
            const time = (r.time_of_day ?? '').slice(0, 5);
            const freq = FREQUENCY_LABEL[r.frequency] ?? r.frequency;
            return (
              <SectionCard
                key={r.id}
                onPress={ap ? () => router.push(`/task/${ap.id}` as Href) : undefined}>
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="flex-1 text-base font-semibold text-black dark:text-white">
                    {apName}
                  </Text>
                  <Badge
                    label={ACTION_PLAN_STATUS_LABEL[apStatus] ?? apStatus}
                    tone={STATUS_TONE[apStatus] ?? 'neutral'}
                  />
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    {freq}
                    {time ? ` · ${time}` : ''}
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Berlaku {r.repeat_start_date} → {r.repeat_end_date}
                  </Text>
                </View>
              </SectionCard>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
