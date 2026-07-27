// S4-3 — sunting Development Area. Periode TERKUNCI pasca-aktivasi (dasar
// mapping AP → periode skor). Rute `development-area/edit/[id]` mengikuti
// pola `goal/edit/[id]`.
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
import { getPersonRef, type PersonRef } from '@/lib/cards';
import {
  PLANNING_STATUS_LABEL,
  STATUS_TONE,
  getDevelopmentArea,
  updateDevelopmentArea,
} from '@/lib/development-areas';
import { alertFriendlyError } from '@/lib/errors';

type Person = NonNullable<PersonRef>;

export function LiveEditDevelopmentAreaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const daQ = useQuery({
    queryKey: ['development_area', id],
    queryFn: () => getDevelopmentArea(id),
  });
  const da = daQ.data;

  const picQ = useQuery({
    queryKey: ['person-ref', da?.pic_id],
    queryFn: () => getPersonRef(da?.pic_id),
    enabled: !!da,
  });

  const [nameDraft, setNameDraft] = useState<string | undefined>();
  const [descDraft, setDescDraft] = useState<string | undefined>();
  const [picDraft, setPicDraft] = useState<Person | null | undefined>();
  const [startDraft, setStartDraft] = useState<string | undefined>();
  const [endDraft, setEndDraft] = useState<string | undefined>();

  const locked = !!da && da.status !== 'draft';
  const name = nameDraft ?? da?.name ?? '';
  const description = descDraft ?? da?.description ?? '';
  const pic = picDraft !== undefined ? picDraft : ((picQ.data ?? null) as Person | null);
  const periodStart = startDraft ?? da?.period_start ?? '';
  const periodEnd = endDraft ?? da?.period_end ?? '';

  const mutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateDevelopmentArea>[1]) =>
      updateDevelopmentArea(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['development_area', id] });
      qc.invalidateQueries({ queryKey: ['development_areas'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  async function submit() {
    if (!da) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      alertFriendlyError('Belum lengkap', null, 'Nama Development Area wajib diisi.');
      return;
    }

    let start = da.period_start;
    let end = da.period_end;
    if (!locked) {
      start = periodStart || null;
      end = periodEnd || null;
    }

    try {
      await mutation.mutateAsync({
        name: trimmedName,
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
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
      <Stack.Screen options={{ title: 'Ubah Development Area' }} />
      <View className="gap-4 p-5">
        {daQ.isLoading ? (
          <SkeletonList count={3} />
        ) : daQ.isError ? (
          <ErrorState onRetry={() => daQ.refetch()} />
        ) : !da ? (
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-1">
              <Badge
                label={PLANNING_STATUS_LABEL[da.status] ?? da.status}
                tone={STATUS_TONE[da.status]}
              />
              <Text className="text-2xl font-bold text-black dark:text-white">
                Ubah Development Area
              </Text>
            </View>

            {locked ? (
              <GuidanceNote
                title="Periode terkunci"
                body="Development Area ini sudah aktif. Periode adalah window pemetaan Action Plan development ke periode skor — menggesernya membuat angka historis tidak konsisten dengan periodenya. Nama, PIC, dan keterangan tetap bisa diperbarui."
              />
            ) : null}

            <SectionCard>
              <LabeledInput
                label="Nama Development Area"
                value={name}
                onChangeText={setNameDraft}
                required
                placeholder="mis. Peningkatan Kualitas Produk"
              />
              {locked ? (
                <Field
                  label="Periode"
                  value={`${da.period_start ?? '—'} → ${da.period_end ?? '—'}`}
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

export default function EditDevelopmentAreaRoute() {
  return <LiveEditDevelopmentAreaScreen />;
}
