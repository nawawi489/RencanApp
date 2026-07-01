import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { useStrategyActions, usePerson } from '@/hooks/use-workspace';
import { DATE_HINT, periodError } from '@/lib/date';
import type { PersonRef } from '@/lib/cards';
import { getKpiArea } from '@/lib/kpi-areas';
import { StackScreenAdapter } from '@/prototype/adapters/stack-screen-adapter';
import PrototypeStrategyFormScreen from '@/prototype/screens/strategy-form';

type Person = NonNullable<PersonRef>;

export function LiveNewStrategyScreen() {
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
  // UI-S-S01 — Kontribusi Q% (PRD §20). Free decimal, 0–100; NULL diizinkan saat Draft.
  const [contributionPct, setContributionPct] = useState('');

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
    let contribution: number | null = null;
    if (contributionPct.trim()) {
      const parsed = Number(contributionPct.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        Alert.alert('Kontribusi tidak valid', 'Isi 0–100 (persen, mis. 25 atau 12.5).');
        return;
      }
      contribution = Math.round(parsed * 1000) / 1000; // selaras numeric(6,3)
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
        contribution_pct: contribution,
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
            label="Kontribusi Quarter (%)"
            value={contributionPct}
            onChangeText={setContributionPct}
            keyboardType="numeric"
            placeholder="mis. 25 (Σ siblings = 100%, divalidasi saat aktivasi)"
          />
          <DateField label="Tanggal Mulai" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Tanggal Selesai" value={periodEnd} onChange={setPeriodEnd} />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}

export default function NewStrategyRoute() {
  return <StackScreenAdapter live={LiveNewStrategyScreen} prototype={PrototypeStrategyFormScreen} />;
}
