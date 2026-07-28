// BL-19c — UI-S-G02: sunting Goal yang sudah ada. Sebelum ini `goals` hanya punya
// create / activate / applyTemplate, jadi salah ketik nama Goal permanen sampai admin
// menyentuh DB.
//
// Periode & Target TERKUNCI setelah aktivasi (keputusan owner 2026-07-23) karena keduanya
// dasar perhitungan skor. Keduanya tetap DITAMPILKAN sebagai konteks read-only, bukan
// disembunyikan: field yang hilang begitu Card aktif terbaca sebagai bug, dan user tidak
// punya cara tahu nilai yang sedang mengikat perhitungannya.
//
// Rute `goal/edit/[id]` — bukan `goal/[id]/edit` — supaya `goal/[id].tsx` tidak perlu
// dipecah jadi direktori demi satu layar tambahan.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { UserPicker } from '@/components/user-picker';
import { YearField } from '@/components/year-field';
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
import { useGoal, useGoalActions } from '@/hooks/use-workspace';
import { getPersonRef, type PersonRef } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';
import { PLANNING_STATUS_LABEL, STATUS_TONE } from '@/lib/goals';

type Person = NonNullable<PersonRef>;

const YEAR_RE = /^\d{4}$/;

/** Tahun dari `period_start`; kosong bila Goal belum punya periode. */
function yearOf(periodStart: string | null | undefined): string {
  return periodStart?.slice(0, 4) ?? '';
}

export function LiveEditGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goalQ = useGoal(id);
  const { update, updatePending } = useGoalActions();
  const goal = goalQ.goal;

  // PIC tersimpan sebagai UUID telanjang; picker butuh identitas orangnya.
  const picQ = useQuery({
    queryKey: ['person-ref', goal?.pic_id],
    queryFn: () => getPersonRef(goal?.pic_id),
    enabled: !!goal,
  });

  // `undefined` = field belum disentuh → ikut nilai server. Prefill lewat useEffect
  // dilarang di repo ini (react-hooks/set-state-in-effect = ERROR di CI), dan pola turunan
  // ini juga menghindari form tertimpa ulang setiap kali query menyegarkan.
  const [nameDraft, setNameDraft] = useState<string | undefined>();
  const [descDraft, setDescDraft] = useState<string | undefined>();
  const [yearDraft, setYearDraft] = useState<string | undefined>();
  const [targetDraft, setTargetDraft] = useState<string | undefined>();
  const [picDraft, setPicDraft] = useState<Person | null | undefined>();

  const locked = !!goal && goal.status !== 'draft';
  const name = nameDraft ?? goal?.name ?? '';
  const description = descDraft ?? goal?.description ?? '';
  const year = yearDraft ?? yearOf(goal?.period_start);
  const target = targetDraft ?? goal?.target_value ?? '';
  const pic = picDraft !== undefined ? picDraft : ((picQ.data ?? null) as Person | null);

  async function submit() {
    if (!goal) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Belum lengkap', 'Nama Goal wajib diisi.');
      return;
    }

    // Saat terkunci, kirim nilai Goal APA ADANYA — termasuk null. Mengirim string kosong
    // untuk target yang memang null akan terbaca server sebagai perubahan dan panggilan
    // yang cuma mengganti nama ikut tertolak "Target Goal terkunci".
    let periodStart = goal.period_start;
    let periodEnd = goal.period_end;
    let targetValue = goal.target_value;

    if (!locked) {
      if (year && !YEAR_RE.test(year)) {
        Alert.alert('Tahun tidak valid', 'Isi tahun Goal 4 digit (mis. 2026).');
        return;
      }
      periodStart = year ? `${year}-01-01` : null;
      periodEnd = year ? `${year}-12-31` : null;
      targetValue = target.trim() || null;
    }

    try {
      await update(goal.id, {
        name: trimmedName,
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        period_start: periodStart,
        period_end: periodEnd,
        target_value: targetValue,
      });
      router.back();
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Perubahan tidak tersimpan. Coba lagi.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Ubah Goal' }} />
      <View className="gap-4 p-5">
        {goalQ.isLoading ? (
          <SkeletonList count={3} />
        ) : goalQ.isError ? (
          <ErrorState onRetry={() => goalQ.refetch()} />
        ) : !goal ? (
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-1">
              <Badge
                label={PLANNING_STATUS_LABEL[goal.status] ?? goal.status}
                tone={STATUS_TONE[goal.status]}
              />
              <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Ubah Goal</Text>
            </View>

            {locked ? (
              <GuidanceNote
                title="Periode & Target terkunci"
                body="Goal ini sudah aktif. Periode dan Target Tahunan adalah dasar perhitungan skor, jadi keduanya tidak bisa diubah lagi — menggesernya membuat skor yang sudah dihitung tidak konsisten dengan periodenya. Nama, PIC, dan keterangan tetap bisa diperbarui."
              />
            ) : null}

            <SectionCard>
              <LabeledInput
                label="Nama Goal"
                value={name}
                onChangeText={setNameDraft}
                required
                placeholder="mis. Tumbuhkan pendapatan"
              />

              {locked ? (
                <>
                  <Field
                    label="Periode"
                    value={`${goal.period_start ?? '—'} → ${goal.period_end ?? '—'}`}
                  />
                  <Field label="Target Tahunan" value={goal.target_value ?? '—'} />
                </>
              ) : (
                <>
                  <YearField label="Tahun Goal" value={year} onChange={setYearDraft} required />
                  <LabeledInput
                    label="Target Tahunan"
                    value={target}
                    onChangeText={setTargetDraft}
                    placeholder="mis. Rp 50 miliar / 1.000 customer baru"
                  />
                </>
              )}

              <UserPicker label="PIC / Owner" value={pic} onChange={setPicDraft} />
              <LabeledInput
                label="Keterangan (opsional)"
                value={description}
                onChangeText={setDescDraft}
                multiline
              />
            </SectionCard>

            <Button label="Simpan perubahan" onPress={submit} loading={updatePending} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function EditGoalRoute() {
  return <LiveEditGoalScreen />;
}
