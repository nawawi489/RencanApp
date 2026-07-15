import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { useDevelopmentAreaActions } from '@/hooks/use-workspace';
import { DATE_HINT, periodError } from '@/lib/date';
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

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Development Area wajib diisi.');
      return;
    }
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    try {
      const created = await create({
        name: name.trim(),
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      router.replace(`/development-area/${created.id}` as Href);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan.');
    }
  }

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
            onChangeText={setName}
            required
            placeholder="mis. System Development"
          />
          <UserPicker label="PIC / Owner" value={pic} onChange={setPic} />
          <DateField label="Tanggal Mulai" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Tanggal Selesai" value={periodEnd} onChange={setPeriodEnd} />
          <LabeledInput
            label="Deskripsi (opsional)"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}
