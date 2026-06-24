import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { useKpiAreaActions } from '@/hooks/use-workspace';
import { getGoal } from '@/lib/goals';
import type { PersonRef } from '@/lib/kpi-areas';

type Person = NonNullable<PersonRef>;

const DATE_HINT = 'Format: YYYY-MM-DD (mis. 2026-07-01)';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function NewKpiAreaScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const router = useRouter();
  const { create, isPending } = useKpiAreaActions(goalId);
  // Default PIC turunan (PRD §52): bila PIC tak diisi, ikut PIC Goal induk.
  const parentQ = useQuery({ queryKey: ['goal', goalId], queryFn: () => getGoal(goalId), enabled: !!goalId });

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama KPI Area wajib diisi.');
      return;
    }
    if (!target.trim()) {
      Alert.alert('Belum lengkap', 'Target KPI Area wajib diisi.');
      return;
    }
    if ((periodStart && !DATE_RE.test(periodStart)) || (periodEnd && !DATE_RE.test(periodEnd))) {
      Alert.alert('Tanggal tidak valid', DATE_HINT);
      return;
    }
    if (periodStart && periodEnd && periodEnd < periodStart) {
      Alert.alert('Tanggal tidak valid', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }
    try {
      const created = await create({
        goal_id: goalId,
        name: name.trim(),
        description: description.trim() || null,
        target: target.trim(),
        pic_id: pic?.id ?? parentQ.data?.pic_id ?? null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      router.replace(`/kpi-area/${created.id}` as Href);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="KPI Area — Area pengukuran"
          body="KPI Area mendefinisikan indikator keberhasilan sebuah Goal. Tetapkan Target yang terukur, lalu turunkan jadi Strategy. Card disimpan sebagai Draft dulu; aktifkan setelah kelengkapan terpenuhi."
        />

        <SectionCard>
          <LabeledInput
            label="Nama KPI Area"
            value={name}
            onChangeText={setName}
            required
            placeholder="mis. Pertumbuhan Pendapatan"
          />
          <LabeledInput
            label="Target"
            value={target}
            onChangeText={setTarget}
            required
            placeholder="mis. Naik 20% YoY"
            multiline
          />
          <UserPicker label="PIC / Owner" value={pic} onChange={setPic} />
          {parentQ.data?.pic_id ? (
            <Text className="-mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Kosongkan untuk mengikuti PIC Goal induk.
            </Text>
          ) : null}
          <LabeledInput
            label="Tanggal Mulai"
            value={periodStart}
            onChangeText={setPeriodStart}
            placeholder={DATE_HINT}
            keyboardType="numeric"
          />
          <LabeledInput
            label="Tanggal Selesai"
            value={periodEnd}
            onChangeText={setPeriodEnd}
            placeholder={DATE_HINT}
            keyboardType="numeric"
          />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}
