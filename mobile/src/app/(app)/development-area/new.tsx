import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateRangeField } from '@/components/date-range-field';
import { UserPicker } from '@/components/user-picker';
import { useDirtyGuard } from '@/hooks/use-dirty-guard';
import { useDevelopmentAreaActions } from '@/hooks/use-workspace';
import { periodError } from '@/lib/date';
import { alertFriendlyError } from '@/lib/errors';
import type { PersonRef } from '@/lib/cards';

type Person = NonNullable<PersonRef>;

export default function NewDevelopmentAreaScreen() {
  const router = useRouter();
  const { create, isPending } = useDevelopmentAreaActions();

  const [name, setName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);
  // S7-3: error inline per-field + banner form-level utk error yang tidak terikat LabeledInput
  // tunggal (mis. periode tanggal via DateRangeField).
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  // S7-2: guard swipe-down / back saat form kotor.
  const [submitted, setSubmitted] = useState(false);
  const isDirty =
    !submitted &&
    (name.trim() !== '' ||
      description.trim() !== '' ||
      periodStart !== '' ||
      periodEnd !== '' ||
      pic != null);
  useDirtyGuard(isDirty);

  async function submit() {
    const nextErrors: typeof fieldErrors = {};
    if (!name.trim()) {
      nextErrors.name = 'Nama Development Area wajib diisi.';
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
        name: name.trim(),
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      setSubmitted(true);
      router.replace(`/development-area/${created.id}` as Href);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan.');
    }
  }

  // S7-3: banner form-level (ditaruh di atas tombol Simpan). Terpisah dari fieldErrors supaya
  // semantiknya tidak tumpang tindih; screen reader mengumumkan lewat live region.
  const formErrorBanner = formError ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="text-sm font-semibold text-red-700 dark:text-red-400">
      {formError}
    </Text>
  ) : null;

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Development Area — Area pengembangan apa yang sedang dibangun?"
          body="Development Area adalah area pembangunan mesin perusahaan (sistem, SDM, organisasi, teknologi, infrastruktur, brand, governance). Wajib Nama, PIC, dan Periode. Pecah menjadi Problem Statement / Development Goal."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Development Area"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
            }}
            required
            placeholder="mis. System Development"
            error={fieldErrors.name}
          />
          <UserPicker label="PIC / Owner" value={pic} onChange={setPic} />
          <DateRangeField
            startValue={periodStart}
            endValue={periodEnd}
            onStartChange={setPeriodStart}
            onEndChange={setPeriodEnd}
          />
          <LabeledInput
            label="Deskripsi (opsional)"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </SectionCard>

        {formErrorBanner}
        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}
