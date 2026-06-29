import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { useKpiAreaActions, usePerson } from '@/hooks/use-workspace';
import { DATE_HINT, periodError } from '@/lib/date';
import { getGoal } from '@/lib/goals';
import type { PersonRef } from '@/lib/kpi-areas';

type Person = NonNullable<PersonRef>;

export default function NewKpiAreaScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const router = useRouter();
  const { create, isPending } = useKpiAreaActions(goalId);
  // Default PIC turunan (PRD §52): picker di-prefill PIC Goal induk (terlihat & bisa diubah/dikosongkan).
  const parentQ = useQuery({ queryKey: ['goal', goalId], queryFn: () => getGoal(goalId), enabled: !!goalId });
  const { person: inheritedPic } = usePerson(parentQ.data?.pic_id);

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
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    try {
      const created = await create({
        goal_id: goalId,
        name: name.trim(),
        description: description.trim() || null,
        target: target.trim(),
        pic_id: (pic ?? inheritedPic)?.id ?? null,
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
          <UserPicker label="PIC / Owner" value={pic ?? inheritedPic} onChange={setPic} />
          <DateField label="Tanggal Mulai" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Tanggal Selesai" value={periodEnd} onChange={setPeriodEnd} />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}
