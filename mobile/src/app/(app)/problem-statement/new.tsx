import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { useProblemStatementActions, usePerson } from '@/hooks/use-workspace';
import { DATE_HINT, periodError } from '@/lib/date';
import type { PersonRef } from '@/lib/cards';
import { getDevelopmentArea } from '@/lib/development-areas';

type Person = NonNullable<PersonRef>;

export default function NewProblemStatementScreen() {
  const { developmentAreaId } = useLocalSearchParams<{ developmentAreaId: string }>();
  const router = useRouter();
  const { create, isPending } = useProblemStatementActions(developmentAreaId);

  // Default PIC turunan: prefill PIC Development Area induk.
  const parentQ = useQuery({
    queryKey: ['development_area', developmentAreaId],
    queryFn: () => getDevelopmentArea(developmentAreaId),
    enabled: !!developmentAreaId,
  });
  const { person: inheritedPic } = usePerson(parentQ.data?.pic_id);

  const [name, setName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Problem Statement wajib diisi.');
      return;
    }
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    try {
      const created = await create({
        development_area_id: developmentAreaId,
        name: name.trim(),
        description: description.trim() || null,
        pic_id: (pic ?? inheritedPic)?.id ?? null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      router.replace(`/problem-statement/${created.id}` as Href);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Problem Statement — Masalah apa yang ingin diselesaikan?"
          body="Problem Statement (Development Goal) menjelaskan masalah/peluang spesifik di Development Area. Wajib Nama, PIC, dan Periode. Pecah menjadi Initiative untuk eksekusi konkret."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Problem Statement"
            value={name}
            onChangeText={setName}
            required
            placeholder="mis. Kurangnya monitoring stok cabang"
          />
          <UserPicker label="PIC / Owner" value={pic ?? inheritedPic} onChange={setPic} />
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
          <LabeledInput
            label="Deskripsi (opsional)"
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
