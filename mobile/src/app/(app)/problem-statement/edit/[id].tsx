// S4-3 — sunting Problem Statement. Periode + Impact TERKUNCI pasca-aktivasi
// (dasar skor + severity weighting governance).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';

import { DateRangeField } from '@/components/date-range-field';
import { UserPicker } from '@/components/user-picker';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  GuidanceNote,
  LabeledInput,
  SectionCard,
  SkeletonList,
} from '@/components/ui';
import { useSafeBack } from '@/hooks/use-safe-back';
import { getPersonRef, type PersonRef } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';
import {
  PLANNING_STATUS_LABEL,
  STATUS_TONE,
  getProblemStatement,
  updateProblemStatement,
} from '@/lib/problem-statements';

type Person = NonNullable<PersonRef>;
type Impact = 'high' | 'medium' | 'low';
const IMPACTS: { value: Impact; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function ImpactChip({
  value,
  onChange,
  locked,
}: {
  value: Impact | null;
  onChange: (v: Impact | null) => void;
  locked: boolean;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">Dampak</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {IMPACTS.map((i) => {
          const active = value === i.value;
          return (
            <Pressable
              key={i.value}
              accessibilityRole="radio"
              accessibilityLabel={`Dampak ${i.label}`}
              accessibilityState={{ selected: active, disabled: locked }}
              disabled={locked}
              onPress={() => !locked && onChange(active ? null : i.value)}
              className={`min-h-[44px] items-center justify-center rounded-full border px-4 py-2 ${
                active
                  ? 'border-brand-dark bg-brand-dark'
                  : 'border-neutral-300 dark:border-neutral-700'
              } ${locked ? 'opacity-40' : 'active:opacity-70'}`}>
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

export function LiveEditProblemStatementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const qc = useQueryClient();

  const psQ = useQuery({
    queryKey: ['problem_statement', id],
    queryFn: () => getProblemStatement(id),
  });
  const ps = psQ.data;

  const picQ = useQuery({
    queryKey: ['person-ref', ps?.pic_id],
    queryFn: () => getPersonRef(ps?.pic_id),
    enabled: !!ps,
  });

  const [nameDraft, setNameDraft] = useState<string | undefined>();
  const [descDraft, setDescDraft] = useState<string | undefined>();
  const [picDraft, setPicDraft] = useState<Person | null | undefined>();
  const [impactDraft, setImpactDraft] = useState<Impact | null | undefined>();
  const [evidenceDraft, setEvidenceDraft] = useState<string | undefined>();
  const [startDraft, setStartDraft] = useState<string | undefined>();
  const [endDraft, setEndDraft] = useState<string | undefined>();

  const locked = !!ps && ps.status !== 'draft';
  const name = nameDraft ?? ps?.name ?? '';
  const description = descDraft ?? ps?.description ?? '';
  const pic = picDraft !== undefined ? picDraft : ((picQ.data ?? null) as Person | null);
  const impact = impactDraft !== undefined ? impactDraft : ((ps?.impact ?? null) as Impact | null);
  const evidence = evidenceDraft ?? ps?.initial_evidence ?? '';
  const periodStart = startDraft ?? ps?.period_start ?? '';
  const periodEnd = endDraft ?? ps?.period_end ?? '';

  const mutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateProblemStatement>[1]) =>
      updateProblemStatement(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['problem_statement', id] });
      qc.invalidateQueries({ queryKey: ['problem_statements'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  async function submit() {
    if (!ps) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      alertFriendlyError('Belum lengkap', null, 'Nama Problem Statement wajib diisi.');
      return;
    }

    let start = ps.period_start;
    let end = ps.period_end;
    let impactValue: string | null = ps.impact;
    if (!locked) {
      start = periodStart || null;
      end = periodEnd || null;
      impactValue = impact;
    }

    try {
      await mutation.mutateAsync({
        name: trimmedName,
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        impact: impactValue,
        initial_evidence: evidence.trim() || null,
        period_start: start,
        period_end: end,
      });
      safeBack();
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Perubahan tidak tersimpan. Coba lagi.');
    }
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-neutral-50 dark:bg-black"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Ubah Problem Statement' }} />
      <View className="gap-4 p-5">
        {psQ.isLoading ? (
          <SkeletonList count={3} />
        ) : psQ.isError ? (
          <ErrorState onRetry={() => psQ.refetch()} />
        ) : !ps ? (
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-1">
              <Badge
                label={PLANNING_STATUS_LABEL[ps.status] ?? ps.status}
                tone={STATUS_TONE[ps.status]}
              />
              <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">
                Ubah Problem Statement
              </Text>
            </View>

            {locked ? (
              <GuidanceNote
                title="Periode & Impact terkunci"
                body="Problem Statement ini sudah aktif. Periode adalah dasar perhitungan skor dan Impact adalah dasar severity weighting governance — keduanya tidak bisa diubah lagi karena mengubahnya membuat ranking pelanggaran historis tidak konsisten. Nama, PIC, dan bukti awal tetap bisa diperbarui."
              />
            ) : null}

            <SectionCard>
              <LabeledInput
                label="Nama Problem Statement"
                value={name}
                onChangeText={setNameDraft}
                required
                placeholder="mis. Response time API produk lambat"
              />
              <ImpactChip value={impact} onChange={setImpactDraft} locked={locked} />
              {locked ? (
                <Field
                  label="Periode"
                  value={`${ps.period_start ?? '—'} → ${ps.period_end ?? '—'}`}
                />
              ) : (
                <DateRangeField
                  startValue={periodStart}
                  endValue={periodEnd}
                  onStartChange={setStartDraft}
                  onEndChange={setEndDraft}
                />
              )}
              <UserPicker label="PIC / Owner" value={pic} onChange={setPicDraft} />
              <LabeledInput
                label="Bukti Awal (opsional)"
                value={evidence}
                onChangeText={setEvidenceDraft}
                placeholder="Deskripsi/link bukti problem ini nyata"
                multiline
              />
              <LabeledInput
                label="Deskripsi (opsional)"
                value={description}
                onChangeText={setDescDraft}
                multiline
              />
            </SectionCard>

            <Button
              label="Simpan perubahan"
              onPress={submit}
              loading={mutation.isPending}
            />
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

export default function EditProblemStatementRoute() {
  return <LiveEditProblemStatementScreen />;
}
