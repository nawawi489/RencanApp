// S4-2 — sunting Inisiatif. Sebelum ini `initiatives` hanya punya create /
// activate, jadi salah ketik nama atau tabel Alasan/Risiko/Alternatif yang
// jadi gate aktivasi tak bisa dikoreksi. Parent (strategy_id) DILUAR alur —
// pindah parent = archive + recreate.
//
// Field TERKUNCI pasca-aktivasi: Periode + Kontribusi Quarter (dasar
// perhitungan skor Strategi). Server MENOLAK perubahannya eksplisit.
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
  INITIATIVE_STATUS_LABEL,
  STATUS_TONE,
  getPersonRef,
  type PersonRef,
} from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';
import { getInitiative, updateInitiative } from '@/lib/initiatives';

type Person = NonNullable<PersonRef>;
const PCT_RE = /^\d{1,3}(\.\d+)?$/;

export function LiveEditInitiativeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const iQ = useQuery({ queryKey: ['initiative', id], queryFn: () => getInitiative(id) });
  const initiative = iQ.data;

  const picQ = useQuery({
    queryKey: ['person-ref', initiative?.pic_id],
    queryFn: () => getPersonRef(initiative?.pic_id),
    enabled: !!initiative,
  });

  const [nameDraft, setNameDraft] = useState<string | undefined>();
  const [descDraft, setDescDraft] = useState<string | undefined>();
  const [picDraft, setPicDraft] = useState<Person | null | undefined>();
  const [reasonDraft, setReasonDraft] = useState<string | undefined>();
  const [riskDraft, setRiskDraft] = useState<string | undefined>();
  const [altDraft, setAltDraft] = useState<string | undefined>();
  const [pctDraft, setPctDraft] = useState<string | undefined>();
  const [startDraft, setStartDraft] = useState<string | undefined>();
  const [endDraft, setEndDraft] = useState<string | undefined>();

  const locked = !!initiative && initiative.status !== 'draft';
  const name = nameDraft ?? initiative?.name ?? '';
  const description = descDraft ?? initiative?.description ?? '';
  const pic = picDraft !== undefined ? picDraft : ((picQ.data ?? null) as Person | null);
  const reason = reasonDraft ?? initiative?.reason ?? '';
  const mainRisk = riskDraft ?? initiative?.main_risk ?? '';
  const alternative = altDraft ?? initiative?.alternative ?? '';
  const contribution =
    pctDraft ?? (initiative?.contribution_pct != null ? String(initiative.contribution_pct) : '');
  const periodStart = startDraft ?? initiative?.period_start ?? '';
  const periodEnd = endDraft ?? initiative?.period_end ?? '';

  const mutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateInitiative>[1]) => updateInitiative(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['initiative', id] });
      qc.invalidateQueries({ queryKey: ['initiatives'] });
      qc.invalidateQueries({ queryKey: ['strategies'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  async function submit() {
    if (!initiative) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      alertFriendlyError('Belum lengkap', null, 'Nama Inisiatif wajib diisi.');
      return;
    }

    let start = initiative.period_start;
    let end = initiative.period_end;
    let pct: number | null = initiative.contribution_pct;

    if (!locked) {
      start = periodStart || null;
      end = periodEnd || null;
      const trimmedPct = contribution.trim();
      if (trimmedPct) {
        if (!PCT_RE.test(trimmedPct)) {
          alertFriendlyError('Kontribusi tidak valid', null, 'Isi angka 0–100.');
          return;
        }
        const n = Number(trimmedPct);
        if (n < 0 || n > 100) {
          alertFriendlyError('Kontribusi tidak valid', null, 'Rentang 0–100%.');
          return;
        }
        pct = n;
      } else {
        pct = null;
      }
    }

    try {
      await mutation.mutateAsync({
        name: trimmedName,
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        reason: reason.trim() || null,
        main_risk: mainRisk.trim() || null,
        alternative: alternative.trim() || null,
        contribution_pct: pct,
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
      <Stack.Screen options={{ title: 'Ubah Inisiatif' }} />
      <View className="gap-4 p-5">
        {iQ.isLoading ? (
          <SkeletonList count={3} />
        ) : iQ.isError ? (
          <ErrorState onRetry={() => iQ.refetch()} />
        ) : !initiative ? (
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-1">
              <Badge
                label={INITIATIVE_STATUS_LABEL[initiative.status] ?? initiative.status}
                tone={STATUS_TONE[initiative.status]}
              />
              <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">
                Ubah Inisiatif
              </Text>
            </View>

            {locked ? (
              <GuidanceNote
                title="Periode & Kontribusi terkunci"
                body="Inisiatif ini sudah aktif. Periode dan Kontribusi Quarter adalah dasar perhitungan skor Strategi, jadi keduanya tidak bisa diubah lagi — menggesernya membuat angka historis tidak konsisten. Nama, PIC, dan konteks tetap bisa diperbarui."
              />
            ) : null}

            <SectionCard>
              <LabeledInput
                label="Nama Inisiatif"
                value={name}
                onChangeText={setNameDraft}
                required
                placeholder="mis. Ekspansi kanal digital"
              />
              <LabeledInput
                label="Alasan"
                value={reason}
                onChangeText={setReasonDraft}
                placeholder="Mengapa strategi ini dipilih?"
                multiline
              />
              <LabeledInput
                label="Risiko Utama"
                value={mainRisk}
                onChangeText={setRiskDraft}
                placeholder="Risiko terbesar yang harus diantisipasi"
                multiline
              />
              <LabeledInput
                label="Alternatif"
                value={alternative}
                onChangeText={setAltDraft}
                placeholder="Opsi lain bila strategi ini gagal"
                multiline
              />
              <UserPicker label="PIC / Owner" value={pic} onChange={setPicDraft} />
              {locked ? (
                <>
                  <Field
                    label="Kontribusi Quarter (%)"
                    value={
                      initiative.contribution_pct != null
                        ? String(initiative.contribution_pct)
                        : '—'
                    }
                  />
                  <Field
                    label="Periode"
                    value={`${initiative.period_start ?? '—'} → ${initiative.period_end ?? '—'}`}
                  />
                </>
              ) : (
                <>
                  <LabeledInput
                    label="Kontribusi Quarter (%)"
                    value={contribution}
                    onChangeText={setPctDraft}
                    keyboardType="numeric"
                    placeholder="mis. 25"
                  />
                  <DateRangeField
                    startValue={periodStart}
                    endValue={periodEnd}
                    onStartChange={setStartDraft}
                    onEndChange={setEndDraft}
                  />
                </>
              )}
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

export default function EditInitiativeRoute() {
  return <LiveEditInitiativeScreen />;
}
