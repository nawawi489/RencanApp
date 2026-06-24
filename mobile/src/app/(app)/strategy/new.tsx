import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { useStrategyActions, usePerson } from '@/hooks/use-workspace';
import { DATE_HINT, periodError } from '@/lib/date';
import type { PersonRef } from '@/lib/cards';
import { getKpiArea } from '@/lib/kpi-areas';

type Person = NonNullable<PersonRef>;

export default function NewStrategyScreen() {
  const { kpiAreaId } = useLocalSearchParams<{ kpiAreaId: string }>();
  const router = useRouter();
  const { create, isPending } = useStrategyActions(kpiAreaId);
  // Default PIC turunan (PRD §52): picker di-prefill PIC KPI Area induk (terlihat & bisa diubah).
  const parentQ = useQuery({ queryKey: ['kpi_area', kpiAreaId], queryFn: () => getKpiArea(kpiAreaId), enabled: !!kpiAreaId });
  const { person: inheritedPic } = usePerson(parentQ.data?.pic_id);

  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [mainRisk, setMainRisk] = useState('');
  const [alternative, setAlternative] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Strategy wajib diisi.');
      return;
    }
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    try {
      const created = await create({
        kpi_area_id: kpiAreaId,
        name: name.trim(),
        description: description.trim() || null,
        reason: reason.trim() || null,
        main_risk: mainRisk.trim() || null,
        alternative: alternative.trim() || null,
        pic_id: (pic ?? inheritedPic)?.id ?? null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      router.replace(`/strategy/${created.id}` as Href);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Strategy — Pendekatan mencapai KPI"
          body="Strategy menjelaskan cara mencapai target KPI Area. Alasan, Risiko Utama, dan Alternatif wajib lengkap saat aktivasi (gate kualitas). Card disimpan sebagai Draft dulu."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Strategy"
            value={name}
            onChangeText={setName}
            required
            placeholder="mis. Ekspansi kanal digital"
          />
          <LabeledInput
            label="Alasan"
            value={reason}
            onChangeText={setReason}
            placeholder="Mengapa strategi ini dipilih? (wajib saat aktivasi)"
            multiline
          />
          <LabeledInput
            label="Risiko Utama"
            value={mainRisk}
            onChangeText={setMainRisk}
            placeholder="Risiko terbesar yang harus diantisipasi (wajib saat aktivasi)"
            multiline
          />
          <LabeledInput
            label="Alternatif"
            value={alternative}
            onChangeText={setAlternative}
            placeholder="Opsi lain bila strategi ini gagal (wajib saat aktivasi)"
            multiline
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
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}
