import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { usePerson } from '@/hooks/use-workspace';
import { createInitiative, type PersonRef } from '@/lib/cards';
import { DATE_HINT, periodError } from '@/lib/date';
import { getStrategy } from '@/lib/strategies';

type Person = NonNullable<PersonRef>;

export default function NewInitiativeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  // Fase 4: bila dibuka dari detail Strategy (/initiative/new?strategyId=...), Initiative ditautkan
  // ke Strategy induk. Tanpa param → Initiative datar (strategy_id null), backward-compat Fase 1.
  const { strategyId } = useLocalSearchParams<{ strategyId?: string }>();
  // Default PIC turunan (PRD §52): di bawah Strategy, bila PIC tak diisi ikut PIC Strategy induk.
  const parentQ = useQuery({
    queryKey: ['strategy', strategyId],
    queryFn: () => getStrategy(strategyId!),
    enabled: !!strategyId,
  });
  const { person: inheritedPic } = usePerson(parentQ.data?.pic_id);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  const mutation = useMutation({
    mutationFn: createInitiative,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['initiatives'] });
      router.replace(`/initiative/${created.id}` as Href);
    },
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.'),
  });

  function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Initiative wajib diisi.');
      return;
    }
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    mutation.mutate({
      name: name.trim(),
      target_result: target.trim() || null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      description: description.trim() || null,
      pic_id: (pic ?? inheritedPic)?.id ?? null,
      strategy_id: strategyId ?? null,
    });
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Initiative — Program eksekusi"
          body="Initiative adalah program konkret untuk menjalankan strategi. Isi Target Hasil, lalu pecah jadi Action Plan. Card disimpan sebagai Draft dulu; aktifkan setelah kelengkapan terpenuhi."
        />

        <SectionCard>
          <LabeledInput label="Nama Initiative" value={name} onChangeText={setName} required placeholder="mis. Kampanye Konten Q3" />
          <LabeledInput
            label="Target Hasil"
            value={target}
            onChangeText={setTarget}
            placeholder="mis. 20 konten tayang & 500 leads"
            multiline
          />
          <UserPicker label="PIC / Owner" value={pic ?? inheritedPic} onChange={setPic} />
          <LabeledInput label="Tanggal Mulai" value={periodStart} onChangeText={setPeriodStart} placeholder={DATE_HINT} keyboardType="numeric" />
          <LabeledInput label="Tanggal Selesai" value={periodEnd} onChangeText={setPeriodEnd} placeholder={DATE_HINT} keyboardType="numeric" />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={mutation.isPending} />
      </View>
    </ScrollView>
  );
}
