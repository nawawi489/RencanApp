import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { useGoalActions } from '@/hooks/use-workspace';
import { type PersonRef } from '@/lib/goals';

type Person = NonNullable<PersonRef>;

const DATE_HINT = 'Format: YYYY-MM-DD (mis. 2026-07-01)';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function NewGoalScreen() {
  const router = useRouter();
  const { create, isPending } = useGoalActions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Goal wajib diisi.');
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
        name: name.trim(),
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      router.replace(`/goal/${created.id}` as Href);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Goal — Sasaran strategis"
          body="Goal adalah sasaran tingkat tinggi untuk satu periode. Pecah jadi KPI Area, lalu Strategy dan Initiative. Card disimpan sebagai Draft dulu; aktifkan setelah minimal satu KPI Area dibuat."
        />

        <SectionCard>
          <LabeledInput label="Nama Goal" value={name} onChangeText={setName} required placeholder="mis. Tumbuhkan pendapatan 2026" />
          <UserPicker label="PIC / Owner" value={pic} onChange={setPic} />
          <DateField label="Tanggal Mulai" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Tanggal Selesai" value={periodEnd} onChange={setPeriodEnd} />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}
