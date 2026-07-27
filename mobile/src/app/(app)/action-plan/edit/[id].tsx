// S4-2 — sunting Rencana Aksi. Sebelum ini `action_plans` hanya punya create /
// activate, jadi salah ketik Nama atau Target Hasil permanen. Team dan
// `initiative_id` / `problem_statement_id` (parent) DILUAR alur sunting ini —
// pindah parent = archive + recreate.
//
// Field TERKUNCI pasca-aktivasi: Periode + Target Hasil (dasar perhitungan
// skor). Server MENOLAK perubahannya eksplisit; UI menampilkannya read-only
// supaya user tahu nilai yang mengikat perhitungan.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

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
import {
  ACTION_PLAN_STATUS_LABEL,
  STATUS_TONE,
  getActionPlan,
  getPersonRef,
  updateActionPlan,
  type PersonRef,
} from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';

type Person = NonNullable<PersonRef>;

export function LiveEditActionPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const apQ = useQuery({ queryKey: ['action-plan', id], queryFn: () => getActionPlan(id) });
  const ap = apQ.data;

  const picQ = useQuery({
    queryKey: ['person-ref', ap?.pic_id],
    queryFn: () => getPersonRef(ap?.pic_id),
    enabled: !!ap,
  });

  const [nameDraft, setNameDraft] = useState<string | undefined>();
  const [descDraft, setDescDraft] = useState<string | undefined>();
  const [picDraft, setPicDraft] = useState<Person | null | undefined>();
  const [targetDraft, setTargetDraft] = useState<string | undefined>();
  const [startDraft, setStartDraft] = useState<string | undefined>();
  const [endDraft, setEndDraft] = useState<string | undefined>();

  const locked = !!ap && ap.status !== 'draft';
  const name = nameDraft ?? ap?.name ?? '';
  const description = descDraft ?? ap?.description ?? '';
  const pic = picDraft !== undefined ? picDraft : ((picQ.data ?? null) as Person | null);
  const target = targetDraft ?? ap?.target_result ?? '';
  const periodStart = startDraft ?? ap?.period_start ?? '';
  const periodEnd = endDraft ?? ap?.period_end ?? '';

  const mutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateActionPlan>[1]) => updateActionPlan(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', id] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  async function submit() {
    if (!ap) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      alertFriendlyError('Belum lengkap', null, 'Nama Rencana Aksi wajib diisi.');
      return;
    }

    // Kirim nilai AP apa adanya untuk field terkunci — termasuk null.
    let start = ap.period_start;
    let end = ap.period_end;
    let targetValue = ap.target_result;

    if (!locked) {
      start = periodStart || null;
      end = periodEnd || null;
      targetValue = target.trim() || null;
    }

    try {
      await mutation.mutateAsync({
        name: trimmedName,
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        target_result: targetValue,
        period_start: start,
        period_end: end,
      });
      router.back();
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Perubahan tidak tersimpan. Coba lagi.');
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-black"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Ubah Rencana Aksi' }} />
      <View className="gap-4 p-5">
        {apQ.isLoading ? (
          <SkeletonList count={3} />
        ) : apQ.isError ? (
          <ErrorState onRetry={() => apQ.refetch()} />
        ) : !ap ? (
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-1">
              <Badge
                label={ACTION_PLAN_STATUS_LABEL[ap.status] ?? ap.status}
                tone={STATUS_TONE[ap.status]}
              />
              <Text className="text-2xl font-bold text-black dark:text-white">
                Ubah Rencana Aksi
              </Text>
            </View>

            {locked ? (
              <GuidanceNote
                title="Periode & Target Hasil terkunci"
                body="Rencana Aksi ini sudah aktif. Periode dan Target Hasil adalah dasar perhitungan skor, jadi keduanya tidak bisa diubah lagi — menggesernya membuat angka historis tidak konsisten. Nama, PIC, dan keterangan tetap bisa diperbarui."
              />
            ) : null}

            <SectionCard>
              <LabeledInput
                label="Nama Rencana Aksi"
                value={name}
                onChangeText={setNameDraft}
                required
                placeholder="mis. Kampanye Konten Q3"
              />
              {locked ? (
                <>
                  <Field label="Target Hasil" value={ap.target_result ?? '—'} />
                  <Field
                    label="Periode"
                    value={`${ap.period_start ?? '—'} → ${ap.period_end ?? '—'}`}
                  />
                </>
              ) : (
                <>
                  <LabeledInput
                    label="Target Hasil"
                    value={target}
                    onChangeText={setTargetDraft}
                    placeholder="mis. 20 konten tayang & 500 leads"
                    multiline
                  />
                  <DateRangeField
                    startValue={periodStart}
                    endValue={periodEnd}
                    onStartChange={setStartDraft}
                    onEndChange={setEndDraft}
                  />
                </>
              )}
              <UserPicker label="PIC / Owner" value={pic} onChange={setPicDraft} />
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
    </ScrollView>
  );
}

export default function EditActionPlanRoute() {
  return <LiveEditActionPlanScreen />;
}
