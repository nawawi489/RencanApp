import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { useGoalActions } from '@/hooks/use-workspace';
import { type PersonRef } from '@/lib/goals';

type Person = NonNullable<PersonRef>;

const YEAR_RE = /^\d{4}$/;
const CURRENT_YEAR = new Date().getFullYear();

export default function NewGoalScreen() {
  const router = useRouter();
  const { create, isPending } = useGoalActions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // PRD §17: "Periode Goal otomatis 1 Jan - 31 Des tahun aktif. Tidak ada rentang tanggal manual untuk Goal."
  const [goalYear, setGoalYear] = useState(String(CURRENT_YEAR));
  const [targetValue, setTargetValue] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Goal wajib diisi.');
      return;
    }
    if (!YEAR_RE.test(goalYear)) {
      Alert.alert('Tahun tidak valid', 'Isi tahun Goal 4 digit (mis. 2026).');
      return;
    }
    const periodStart = `${goalYear}-01-01`;
    const periodEnd = `${goalYear}-12-31`;
    try {
      const created = await create({
        name: name.trim(),
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        period_start: periodStart,
        period_end: periodEnd,
        target_value: targetValue.trim() || null,
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
          body="Goal adalah sasaran tahunan tingkat tinggi. Periode otomatis mengikuti tahun Goal (1 Jan – 31 Des). Pecah jadi KPI Area, lalu Strategy dan Initiative. Card disimpan sebagai Draft dulu."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Goal"
            value={name}
            onChangeText={setName}
            required
            placeholder="mis. Tumbuhkan pendapatan"
          />
          <LabeledInput
            label="Tahun Goal"
            value={goalYear}
            onChangeText={setGoalYear}
            required
            keyboardType="numeric"
            placeholder={String(CURRENT_YEAR)}
          />
          <LabeledInput
            label="Target Tahunan"
            value={targetValue}
            onChangeText={setTargetValue}
            placeholder="mis. Rp 50 miliar / 1.000 customer baru"
          />
          <UserPicker label="PIC / Owner" value={pic} onChange={setPic} />
          <LabeledInput
            label="Keterangan / Target (opsional)"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}
