// Goal Wizard (Fase 4, PRD 49) — satu layar dengan langkah berurutan internal:
// (1) pilih Goal Template → (2) periode + PIC → (3) Generate Goal via applyGoalTemplate.
// Meniru pola initiative/new.tsx: mutation onSuccess → router.replace, onError → Alert,
// validasi tanggal DATE_RE. Card hasil instansiasi mengikuti default RPC (draft).
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import type { PersonRef } from '@/lib/goals';
import { useGoalActions, useGoalTemplates } from '@/hooks/use-workspace';

type Person = NonNullable<PersonRef>;

const DATE_HINT = 'Format: YYYY-MM-DD (mis. 2026-07-01)';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function GoalWizardScreen() {
  const router = useRouter();
  const { templates } = useGoalTemplates();
  const { applyTemplate, isPending } = useGoalActions();

  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  const datesValid = DATE_RE.test(periodStart) && DATE_RE.test(periodEnd);

  function next() {
    if (step === 0 && !templateId) {
      Alert.alert('Belum lengkap', 'Pilih Goal Template terlebih dulu.');
      return;
    }
    setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function generate() {
    if (!templateId) {
      Alert.alert('Belum lengkap', 'Pilih Goal Template terlebih dulu.');
      return;
    }
    if (!pic) {
      // PIC wajib (PRD §49 langkah 6): KPI Area template ikut mewarisi PIC ini; tanpa PIC,
      // KPI Area hasil template tak bisa diaktifkan (gate kelengkapan KPI Area).
      Alert.alert('Belum lengkap', 'Tentukan PIC / Owner Goal terlebih dulu.');
      return;
    }
    if (!datesValid) {
      Alert.alert('Tanggal tidak valid', DATE_HINT);
      return;
    }
    if (periodEnd < periodStart) {
      // Bandingkan string YYYY-MM-DD (leksikografis = kronologis). Cegah CHECK *_period_order gagal di server.
      Alert.alert('Tanggal tidak valid', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }
    try {
      const goalId = await applyTemplate({
        goalTemplateId: templateId,
        picId: pic.id,
        periodStart,
        periodEnd,
      });
      router.replace(`/goal/${goalId}` as Href);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Goal Wizard — Instansiasi dari template"
          body="Pilih template Goal, tentukan periode & PIC, lalu Generate. KPI Area bawaan template ikut terbentuk sebagai Draft; aktifkan setelah ditinjau."
        />

        {step === 0 ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">
              Langkah 1 — Pilih Goal Template
            </Text>
            {templates.map((t) => (
              <Button
                key={t.id}
                label={t.name}
                variant={t.id === templateId ? 'primary' : 'secondary'}
                onPress={() => setTemplateId(t.id)}
              />
            ))}
            <Button label="Lanjut" onPress={next} />
          </SectionCard>
        ) : null}

        {step === 1 ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">
              Langkah 2 — Periode & PIC
            </Text>
            <LabeledInput
              label="Tanggal Mulai"
              value={periodStart}
              onChangeText={setPeriodStart}
              placeholder={DATE_HINT}
              keyboardType="numeric"
              required
            />
            <LabeledInput
              label="Tanggal Selesai"
              value={periodEnd}
              onChangeText={setPeriodEnd}
              placeholder={DATE_HINT}
              keyboardType="numeric"
              required
            />
            <UserPicker label="PIC / Owner" value={pic} onChange={setPic} />
            <View className="flex-row gap-3">
              <Button label="Kembali" variant="secondary" onPress={back} />
              <Button label="Lanjut" onPress={next} />
            </View>
          </SectionCard>
        ) : null}

        {step === 2 ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">
              Langkah 3 — Tinjau & Generate
            </Text>
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">
              Periode {periodStart || '—'} s/d {periodEnd || '—'}.
            </Text>
            <View className="flex-row gap-3">
              <Button label="Kembali" variant="secondary" onPress={back} />
              <Button label="Generate Goal" onPress={generate} loading={isPending} />
            </View>
          </SectionCard>
        ) : null}
      </View>
    </ScrollView>
  );
}
