// Fase 8 — Evaluation Initiative (opsional, setelah selesai). Anti-self (PIC ≠ evaluator).
// UPSERT: pre-fill bila evaluation sudah ada. Prompt hanya saat status 'done'/'active'.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, LabeledInput, SectionCard } from '@/components/ui';
import { EVALUATION_TARGET_LABEL } from '@/lib/governance-admin';
import { useEvaluation, useEvaluationActions } from '@/hooks/use-governance-admin';
import { useProfile } from '@/hooks/use-profile';

const TARGETS = ['ya', 'sebagian', 'tidak'] as const;

export default function EvaluationScreen() {
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
  const [error, setError] = useState<string | null>(null);

  // pre-fill saat evaluation existing tersedia (UPSERT).
  useEffect(() => {
    if (evaluation) {
      setTarget((evaluation.target_achieved as (typeof TARGETS)[number] | null) ?? null);
      setResults(evaluation.results ?? '');
      setLessons(evaluation.lessons_learned ?? '');
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
          {isSelf ? (
            <Text className="text-sm text-red-600" accessibilityRole="alert">
              PIC tidak dapat mengevaluasi initiativenya sendiri.
            </Text>
          ) : null}
          {error ? (
            <Text className="text-sm text-red-600" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Simpan Evaluasi" onPress={handleSave} loading={isPending} disabled={isSelf} />
        </SectionCard>
      </View>
    </ScrollView>
  );
}
