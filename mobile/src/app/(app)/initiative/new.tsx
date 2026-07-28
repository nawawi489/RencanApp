import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateRangeField } from '@/components/date-range-field';
import { UserPicker } from '@/components/user-picker';
import { useDirtyGuard } from '@/hooks/use-dirty-guard';
import { useInitiativeActions, usePerson } from '@/hooks/use-workspace';
import { periodError } from '@/lib/date';
import type { PersonRef } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';
import { getStrategy } from '@/lib/strategies';

type Person = NonNullable<PersonRef>;

export function LiveNewInitiativeScreen() {
  const { strategyId } = useLocalSearchParams<{ strategyId: string }>();
  const router = useRouter();
  const { create, isPending } = useInitiativeActions(strategyId);
  // Default PIC turunan (PRD §52): picker di-prefill PIC Strategi induk (terlihat & bisa diubah).
  const parentQ = useQuery({ queryKey: ['strategy', strategyId], queryFn: () => getStrategy(strategyId), enabled: !!strategyId });
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
  // S7-3: error inline per-field + banner form-level utk periode via DateRangeField.
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    contributionPct?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);

  // S7-2: guard swipe-down / back saat form kotor.
  const [submitted, setSubmitted] = useState(false);
  const isDirty =
    !submitted &&
    (name.trim() !== '' ||
      reason.trim() !== '' ||
      mainRisk.trim() !== '' ||
      alternative.trim() !== '' ||
      description.trim() !== '' ||
      contributionPct.trim() !== '' ||
      periodStart !== '' ||
      periodEnd !== '' ||
      pic != null);
  useDirtyGuard(isDirty);

  async function submit() {
    const nextErrors: typeof fieldErrors = {};
    if (!name.trim()) {
      nextErrors.name = 'Nama Inisiatif wajib diisi.';
    }
    let contribution: number | null = null;
    if (contributionPct.trim()) {
      const parsed = Number(contributionPct.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        nextErrors.contributionPct = 'Isi 0–100 (persen, mis. 25 atau 12.5).';
      } else {
        contribution = Math.round(parsed * 1000) / 1000; // selaras numeric(6,3)
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      setFormError(dateErr);
      return;
    }
    setFormError(null);
    try {
      const created = await create({
        strategy_id: strategyId,
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
      setSubmitted(true);
      router.replace(`/initiative/${created.id}` as Href);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Inisiatif — Pendekatan mencapai KPI"
          body="Inisiatif menjelaskan cara mencapai target Strategi. Alasan, Risiko Utama, dan Alternatif wajib lengkap saat aktivasi (gate kualitas). Card disimpan sebagai Draft dulu."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Inisiatif"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
            }}
            required
            placeholder="mis. Ekspansi kanal digital"
            error={fieldErrors.name}
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
            onChangeText={(t) => {
              setContributionPct(t);
              if (fieldErrors.contributionPct)
                setFieldErrors((e) => ({ ...e, contributionPct: undefined }));
            }}
            keyboardType="numeric"
            placeholder="mis. 25 (Σ siblings = 100%, divalidasi saat aktivasi)"
            error={fieldErrors.contributionPct}
          />
          <DateRangeField
            startValue={periodStart}
            endValue={periodEnd}
            onStartChange={setPeriodStart}
            onEndChange={setPeriodEnd}
          />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        {formError ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="text-sm font-semibold text-red-700 dark:text-red-400">
            {formError}
          </Text>
        ) : null}
        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}

export default function NewInitiativeRoute() {
  return <LiveNewInitiativeScreen />;
}
