import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { useProblemStatementActions, usePerson } from '@/hooks/use-workspace';
import { periodError } from '@/lib/date';
import type { PersonRef } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';
import { getDevelopmentArea } from '@/lib/development-areas';

type Person = NonNullable<PersonRef>;
type Impact = 'high' | 'medium' | 'low';
const IMPACTS: { value: Impact; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function ImpactSelector({
  value,
  onChange,
}: {
  value: Impact | null;
  onChange: (v: Impact | null) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">
        Dampak<Text className="text-red-500"> *</Text>
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {IMPACTS.map((i) => {
          const active = value === i.value;
          return (
            <Pressable
              key={i.value}
              accessibilityRole="button"
              accessibilityLabel={`Dampak ${i.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(active ? null : i.value)}
              style={{ minHeight: 44 }}
              className={`min-h-[44px] items-center justify-center rounded-full border px-4 py-2 active:opacity-70 ${
                active
                  ? 'border-brand-dark bg-brand-dark'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}>
              <Text
                className={`text-sm font-semibold ${
                  active ? 'text-white' : 'text-black dark:text-white'
                }`}>
                {i.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
  // UI-S-PR1
  const [impact, setImpact] = useState<Impact | null>(null);
  const [initialEvidence, setInitialEvidence] = useState('');

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Problem Statement wajib diisi.');
      return;
    }
    if (!impact) {
      Alert.alert('Belum lengkap', 'Dampak wajib dipilih (High/Medium/Low).');
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
        impact,
        initial_evidence: initialEvidence.trim() || null,
      });
      router.replace(`/problem-statement/${created.id}` as Href);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        {parentQ.data ? (
          <View
            accessible
            accessibilityLabel={`Problem Statement di bawah Development Area ${parentQ.data.name}`}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="text-[11px] font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              Development Area induk
            </Text>
            <Text className="text-sm font-semibold text-black dark:text-white">
              {parentQ.data.name}
            </Text>
          </View>
        ) : null}

        <GuidanceNote
          title="Problem Statement — Masalah apa yang ingin diselesaikan?"
          body="Problem Statement (Development Goal) menjelaskan masalah/peluang spesifik di Development Area. Tetapkan Dampak (High/Medium/Low) supaya prioritas jelas; sertakan bukti awal agar problem ini dapat divalidasi."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Problem Statement"
            value={name}
            onChangeText={setName}
            required
            placeholder="mis. Kurangnya monitoring stok cabang"
          />
          <ImpactSelector value={impact} onChange={setImpact} />
          <LabeledInput
            label="Bukti Awal"
            value={initialEvidence}
            onChangeText={setInitialEvidence}
            multiline
            placeholder="mis. screenshot dashboard, link laporan, atau ringkasan observasi"
          />
          <UserPicker label="PIC / Owner" value={pic ?? inheritedPic} onChange={setPic} />
          <DateField label="Tanggal Mulai" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Tanggal Selesai" value={periodEnd} onChange={setPeriodEnd} />
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
