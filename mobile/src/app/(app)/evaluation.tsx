// Fase 8 — Evaluation Initiative (opsional, setelah selesai). Anti-self (PIC ≠ evaluator).
// UPSERT: pre-fill bila evaluation sudah ada. Prompt hanya saat status 'done'/'active'.
// UI-S-EV1: tambah checklist "Perlu jadi SOP?" + "Perlu rollout?" (loop balik ke Development) + catatan rollout.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, LabeledInput, SectionCard } from '@/components/ui';
import { EVALUATION_TARGET_LABEL } from '@/lib/governance-admin';
import { useEvaluation, useEvaluationActions } from '@/hooks/use-governance-admin';
import { useProfile } from '@/hooks/use-profile';
const TARGETS = ['ya', 'sebagian', 'tidak'] as const;

/** Checkbox sederhana dengan touch target ≥44px (a11y) dan state visual jelas. */
function CheckboxRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      className="min-h-[44px] flex-row items-start gap-3 rounded-xl border border-neutral-200 px-3 py-2 active:opacity-70 dark:border-neutral-800">
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded border-2 ${
          checked ? 'border-brand-dark bg-brand-dark' : 'border-neutral-400 dark:border-neutral-500'
        }`}>
        {checked ? <Text className="text-xs font-bold text-white">✓</Text> : null}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-black dark:text-white">{label}</Text>
        {description ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function LiveEvaluationScreen() {
  const { profile } = useProfile();
  const params = useLocalSearchParams<{ initiativeId?: string; picId?: string; status?: string }>();
  const initiativeId = params.initiativeId ?? '';
  const picId = params.picId ?? '';
  const status = params.status ?? '';
  const { evaluation } = useEvaluation(initiativeId);
  const { record, isPending } = useEvaluationActions();

  const [target, setTarget] = useState<(typeof TARGETS)[number] | null>(null);
  const [results, setResults] = useState('');
  const [lessons, setLessons] = useState('');
  const [shouldBecomeSop, setShouldBecomeSop] = useState(false);
  const [rolloutNeeded, setRolloutNeeded] = useState(false);
  const [rolloutNotes, setRolloutNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // pre-fill saat evaluation existing tersedia (UPSERT).
  useEffect(() => {
    if (evaluation) {
      setTarget((evaluation.target_achieved as (typeof TARGETS)[number] | null) ?? null);
      setResults(evaluation.results ?? '');
      setLessons(evaluation.lessons_learned ?? '');
      setShouldBecomeSop(evaluation.should_become_sop ?? false);
      setRolloutNeeded(evaluation.rollout_needed ?? false);
      setRolloutNotes(evaluation.rollout_notes ?? '');
    }
  }, [evaluation]);

  const isSelf = !!picId && profile?.id === picId;
  const isDone = status === 'done' || status === 'active';

  async function handleSave() {
    setError(null);
    if (isSelf) {
      setError('PIC tidak dapat mengevaluasi initiativenya sendiri.');
      return;
    }
    await record({
      initiativeId,
      targetAchieved: target,
      results: results.trim(),
      lessonsLearned: lessons.trim(),
      shouldBecomeSop,
      rolloutNeeded,
      rolloutNotes: rolloutNotes.trim(),
    });
  }

  if (!isDone) {
    return (
      <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
        <Stack.Screen options={{ title: 'Evaluasi' }} />
        <View className="gap-4 p-5">
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">Evaluasi belum tersedia</Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Evaluasi tersedia setelah Initiative berjalan atau selesai.
            </Text>
          </SectionCard>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Evaluasi' }} />
      <View className="gap-4 p-5">
        <SectionCard>
          <Text className="text-sm text-neutral-600 dark:text-neutral-300">Pencapaian Target</Text>
          <View className="flex-row flex-wrap gap-2">
            {TARGETS.map((t) => {
              const active = t === target;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Target ${EVALUATION_TARGET_LABEL[t]}`}
                  className={`min-h-[44px] justify-center rounded-xl border px-3 py-2 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
                  onPress={() => setTarget(t)}>
                  <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-black dark:text-white'}`}>
                    {EVALUATION_TARGET_LABEL[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <LabeledInput label="Hasil utama" value={results} onChangeText={setResults} multiline />
          <LabeledInput label="Lesson learned" value={lessons} onChangeText={setLessons} multiline />

          <View className="gap-2">
            <Text className="px-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Tindak lanjut</Text>
            <CheckboxRow
              label="Perlu jadi SOP?"
              description="Pengalaman ini layak dijadikan Standard Operating Procedure organisasi."
              checked={shouldBecomeSop}
              onToggle={() => setShouldBecomeSop((v) => !v)}
            />
            <CheckboxRow
              label="Perlu rollout?"
              description="Pengalaman dipakai ulang lewat Development Workspace (lesson → improvement)."
              checked={rolloutNeeded}
              onToggle={() => setRolloutNeeded((v) => !v)}
            />
            {rolloutNeeded ? (
              <LabeledInput
                label="Catatan rollout"
                value={rolloutNotes}
                onChangeText={setRolloutNotes}
                multiline
                placeholder="Ringkas siapa/dimana/kapan rollout dilakukan."
              />
            ) : null}
          </View>

          {isSelf ? (
            <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
              PIC tidak dapat mengevaluasi initiativenya sendiri.
            </Text>
          ) : null}
          {error ? (
            <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Simpan Evaluasi" onPress={handleSave} loading={isPending} disabled={isSelf} />
        </SectionCard>
      </View>
    </ScrollView>
  );
}

export default function EvaluationRoute() {
  return <LiveEvaluationScreen />;
}
