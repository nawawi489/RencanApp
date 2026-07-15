// Goal Wizard (Fase 4, PRD §49) — satu layar berurutan: (1) pilih Goal Template (atau Goal kosong),
// (2) periode + PIC + Target tiap Strategi, (3) Generate via applyGoalTemplate (atomik di server).
// Meniru pola action_plan/new.tsx: onError → Alert, validasi tanggal DATE_RE.
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { DateRangeField } from '@/components/date-range-field';
import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { useGoalActions, useGoalTemplates, useStrategyTemplates } from '@/hooks/use-workspace';
import { periodError } from '@/lib/date';
import { alertFriendlyError } from '@/lib/errors';
import type { PersonRef } from '@/lib/goals';

type Person = NonNullable<PersonRef>;

export default function GoalWizardScreen() {
  const router = useRouter();
  const { templates } = useGoalTemplates();
  const { applyTemplate, isPending } = useGoalActions();

  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [pic, setPic] = useState<Person | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});

  const { items: kpiTemplates } = useStrategyTemplates(templateId ?? '');

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
      // PIC wajib (PRD §49 langkah 6): Strategi template mewarisi PIC ini; tanpa PIC tak bisa diaktifkan.
      Alert.alert('Belum lengkap', 'Tentukan PIC / Owner Goal terlebih dulu.');
      return;
    }
    // Kedua tanggal wajib (requireBoth) + urutan benar; cegah CHECK *_period_order gagal di server.
    const dateErr = periodError(periodStart, periodEnd, true);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    try {
      const goalId = await applyTemplate({
        goalTemplateId: templateId,
        picId: pic.id,
        periodStart,
        periodEnd,
        targets,
      });
      router.replace(`/goal/${goalId}` as Href);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Goal Wizard — Instansiasi dari template"
          body="Pilih template Goal, tentukan periode, PIC, dan Target tiap Strategi, lalu Generate. Strategi terbentuk sebagai Draft; aktifkan setelah ditinjau."
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
            <Text className="text-center text-xs text-neutral-500 dark:text-neutral-400">atau</Text>
            <Button
              label="Buat Goal Kosong"
              variant="secondary"
              onPress={() => router.replace('/goal/new' as Href)}
            />
          </SectionCard>
        ) : null}

        {step === 1 ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">
              Langkah 2 — Periode, PIC & Target
            </Text>
            <DateRangeField
              startValue={periodStart}
              endValue={periodEnd}
              onStartChange={setPeriodStart}
              onEndChange={setPeriodEnd}
              required
            />
            <UserPicker label="PIC / Owner" value={pic} onChange={setPic} required />

            {kpiTemplates.length > 0 ? (
              <View className="gap-2">
                <Text className="text-sm font-bold text-black dark:text-white">
                  Target Strategi (opsional — bisa dilengkapi nanti)
                </Text>
                {kpiTemplates.map((kt) => (
                  <LabeledInput
                    key={kt.id}
                    label={`${kt.division_label} · ${kt.name}`}
                    value={targets[kt.id] ?? ''}
                    onChangeText={(v) => setTargets((prev) => ({ ...prev, [kt.id]: v }))}
                    placeholder="mis. Naik 20% YoY"
                  />
                ))}
              </View>
            ) : (
              // V1.83 §19: Strategy Template kosong secara default — Goal Template ini
              // belum punya Strategy Template custom. Generate tetap membuat Goal, tapi
              // tanpa Strategy turunan; jangan biarkan itu jadi kejutan diam-diam.
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Belum ada Strategy Template untuk Goal Template ini. Goal akan dibuat tanpa
                Strategy — tambahkan Strategy secara manual setelah Generate.
              </Text>
            )}

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
