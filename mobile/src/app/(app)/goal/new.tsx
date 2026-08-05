import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native-css/components';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';

import { Button, GuidanceNote, HeaderDoneButton, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { YearField } from '@/components/year-field';
import { useDirtyGuard } from '@/hooks/use-dirty-guard';
import { useGoalActions } from '@/hooks/use-workspace';
import { alertFriendlyError } from '@/lib/errors';
import { type PersonRef } from '@/lib/goals';
type Person = NonNullable<PersonRef>;

const YEAR_RE = /^\d{4}$/;
const CURRENT_YEAR = new Date().getFullYear();

export function LiveNewGoalScreen() {
  const router = useRouter();
  const { create, isPending } = useGoalActions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // PRD §17: "Periode Goal otomatis 1 Jan - 31 Des tahun aktif. Tidak ada rentang tanggal manual untuk Goal."
  const [goalYear, setGoalYear] = useState(String(CURRENT_YEAR));
  const [targetValue, setTargetValue] = useState('');
  const [pic, setPic] = useState<Person | null>(null);
  // S7-3: error inline per-field + banner form-level utk YearField (tak menerima prop `error`).
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  // S7-2: guard swipe-down / back saat form kotor.
  // goalYear default = tahun berjalan; hitung dirty relatif ke default itu.
  const [submitted, setSubmitted] = useState(false);
  const isDirty =
    !submitted &&
    (name.trim() !== '' ||
      description.trim() !== '' ||
      targetValue.trim() !== '' ||
      goalYear !== String(CURRENT_YEAR) ||
      pic != null);
  useDirtyGuard(isDirty);

  async function submit() {
    const nextErrors: typeof fieldErrors = {};
    if (!name.trim()) {
      nextErrors.name = 'Nama Goal wajib diisi.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    if (!YEAR_RE.test(goalYear)) {
      setFormError('Isi tahun Goal 4 digit (mis. 2026).');
      return;
    }
    setFormError(null);
    const periodStart = `${goalYear}-01-01`;
    const periodEnd = `${goalYear}-12-31`;
    try {
      const created = await create({
        name: name.trim(),
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        period_start: periodStart,
        period_end: periodEnd,
        target_value: targetValue.trim() || null,
      });
      setSubmitted(true);
      router.replace(`/goal/${created.id}` as Href);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan.');
    }
  }

  return (
    <KeyboardAwareScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      {/* headerRight "Selesai" (iOS modal metaphor) → memicu handler submit yang sama dgn CTA di
          konten; disabled saat submit berjalan. headerLeft "Batal" datang dari MODAL_OPTIONS. */}
      <Stack.Screen options={{ headerRight: () => <HeaderDoneButton onPress={submit} loading={isPending} /> }} />
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Goal — Sasaran strategis"
          body="Goal adalah sasaran tahunan tingkat tinggi. Periode otomatis mengikuti tahun Goal (1 Jan – 31 Des). Pecah jadi Strategi, lalu Inisiatif dan Rencana Aksi. Card disimpan sebagai Draft dulu."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Goal"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
            }}
            required
            placeholder="mis. Tumbuhkan pendapatan"
            error={fieldErrors.name}
          />
          <YearField label="Tahun Goal" value={goalYear} onChange={setGoalYear} required />
          <LabeledInput
            label="Target Tahunan"
            value={targetValue}
            onChangeText={setTargetValue}
            placeholder="mis. Rp 50 miliar / 1.000 customer baru"
          />
          <UserPicker label="PIC / Owner" value={pic} onChange={setPic} />
          <LabeledInput
            label="Keterangan / Target (opsional)"
            value={description}
            onChangeText={setDescription}
            multiline
          />
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
    </KeyboardAwareScrollView>
  );
}

export default function NewGoalRoute() {
  return <LiveNewGoalScreen />;
}
