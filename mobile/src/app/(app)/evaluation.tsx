// Fase 8 — Evaluation Rencana Aksi (opsional, setelah selesai). Anti-self (PIC ≠ evaluator).
// UPSERT: pre-fill bila evaluation sudah ada. Prompt hanya saat status 'done'/'active'.
// UI-S-EV1: tambah checklist "Perlu jadi SOP?" + "Perlu rollout?" (loop balik ke Development) + catatan rollout.
// BL-05: "Faktor berhasil" + "Faktor gagal" (PRD §26 field 3-4) — text[] diisi satu faktor per baris.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, HeaderDoneButton, LabeledInput, SectionCard } from '@/components/ui';
import { useThemedIcon } from '@/providers/theme-provider';
import { EVALUATION_TARGET_LABEL } from '@/lib/governance-admin';
import { useDirtyGuard } from '@/hooks/use-dirty-guard';
import { useEvaluation, useEvaluationActions } from '@/hooks/use-governance-admin';
import { useProfile } from '@/hooks/use-profile';
const TARGETS = ['ya', 'sebagian', 'tidak'] as const;

/**
 * `success_factors`/`failure_factors` bertipe `text[]` di DB. UI mengumpulkannya sebagai satu
 * textarea "satu faktor per baris" — tiap baris non-kosong jadi satu elemen array, bukan satu blok
 * teks yang dibungkus jadi array satu elemen. Jadi struktur list-nya benar-benar tersimpan.
 */
function toFactorList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function fromFactorList(list: string[] | null | undefined): string {
  return (list ?? []).join('\n');
}

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
  const checkIcon = useThemedIcon('#1564b3', '#93c5fd');
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      className="min-h-[44px] flex-row items-start gap-3 rounded-xl border border-neutral-200 px-3 py-2 active:opacity-70 dark:border-neutral-800">
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={checkIcon}
        style={{ marginTop: 2 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
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
  const params = useLocalSearchParams<{ actionPlanId?: string; picId?: string; status?: string }>();
  const actionPlanId = params.actionPlanId ?? '';
  const picId = params.picId ?? '';
  const status = params.status ?? '';
  const { evaluation } = useEvaluation(actionPlanId);
  const { record, isPending } = useEvaluationActions();

  // pre-fill saat evaluation existing tersedia (UPSERT). Initial value dari evaluation (bila sudah cache),
  // dan pola "adjusting state on prop change" (react.dev) untuk sinkronisasi jika evaluation berubah setelahnya.
  const [target, setTarget] = useState<(typeof TARGETS)[number] | null>(
    () => (evaluation?.target_achieved as (typeof TARGETS)[number] | null) ?? null,
  );
  const [results, setResults] = useState(() => evaluation?.results ?? '');
  const [successFactors, setSuccessFactors] = useState(() => fromFactorList(evaluation?.success_factors));
  const [failureFactors, setFailureFactors] = useState(() => fromFactorList(evaluation?.failure_factors));
  const [lessons, setLessons] = useState(() => evaluation?.lessons_learned ?? '');
  const [shouldBecomeSop, setShouldBecomeSop] = useState(() => evaluation?.should_become_sop ?? false);
  const [rolloutNeeded, setRolloutNeeded] = useState(() => evaluation?.rollout_needed ?? false);
  const [rolloutNotes, setRolloutNotes] = useState(() => evaluation?.rollout_notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const [prevEvaluation, setPrevEvaluation] = useState(evaluation);
  if (evaluation !== prevEvaluation) {
    setPrevEvaluation(evaluation);
    if (evaluation) {
      setTarget((evaluation.target_achieved as (typeof TARGETS)[number] | null) ?? null);
      setResults(evaluation.results ?? '');
      setSuccessFactors(fromFactorList(evaluation.success_factors));
      setFailureFactors(fromFactorList(evaluation.failure_factors));
      setLessons(evaluation.lessons_learned ?? '');
      setShouldBecomeSop(evaluation.should_become_sop ?? false);
      setRolloutNeeded(evaluation.rollout_needed ?? false);
      setRolloutNotes(evaluation.rollout_notes ?? '');
    }
  }

  const isSelf = !!picId && profile?.id === picId;
  const isDone = status === 'done' || status === 'active';

  // S7-2 dirty guard: bandingkan tiap field dengan snapshot evaluasi tersimpan (atau default
  // kosong bila belum ada) — form UPSERT jadi hanya perubahan nyata terhadap yang persist
  // yang dianggap dirty. `submitted` mencegah dialog muncul setelah simpan sukses.
  const [submitted, setSubmitted] = useState(false);
  const initialTarget = (evaluation?.target_achieved as (typeof TARGETS)[number] | null) ?? null;
  const isDirty =
    !submitted &&
    (target !== initialTarget ||
      results !== (evaluation?.results ?? '') ||
      successFactors !== fromFactorList(evaluation?.success_factors) ||
      failureFactors !== fromFactorList(evaluation?.failure_factors) ||
      lessons !== (evaluation?.lessons_learned ?? '') ||
      shouldBecomeSop !== (evaluation?.should_become_sop ?? false) ||
      rolloutNeeded !== (evaluation?.rollout_needed ?? false) ||
      rolloutNotes !== (evaluation?.rollout_notes ?? ''));
  useDirtyGuard(isDirty);

  async function handleSave() {
    setError(null);
    if (isSelf) {
      setError('PIC tidak dapat mengevaluasi action_plannya sendiri.');
      return;
    }
    await record({
      actionPlanId,
      targetAchieved: target,
      results: results.trim(),
      successFactors: toFactorList(successFactors),
      failureFactors: toFactorList(failureFactors),
      lessonsLearned: lessons.trim(),
      shouldBecomeSop,
      rolloutNeeded,
      rolloutNotes: rolloutNotes.trim(),
    });
    setSubmitted(true);
  }

  if (!isDone) {
    return (
      <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
        <Stack.Screen options={{ title: 'Evaluasi' }} />
        <View className="gap-4 p-5">
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">Evaluasi belum tersedia</Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Evaluasi tersedia setelah Rencana Aksi berjalan atau selesai.
            </Text>
          </SectionCard>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
      keyboardVerticalOffset={0}>
      <ScrollView
        className="flex-1 bg-neutral-50 dark:bg-black"
        keyboardShouldPersistTaps="handled">
        {/* headerRight "Selesai" → handler simpan yang sama dgn CTA "Simpan Evaluasi" (headerLeft
            "Batal" dari MODAL_OPTIONS). disabled saat isSelf (PIC tak boleh evaluasi diri sendiri),
            mirror `disabled` tombol di konten. Hanya di render utama (status done/active). */}
        <Stack.Screen
          options={{
            title: 'Evaluasi',
            headerRight: () => <HeaderDoneButton onPress={handleSave} loading={isPending} disabled={isSelf} />,
          }}
        />
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
          <LabeledInput label="Hasil tercapai atau belum" value={results} onChangeText={setResults} multiline />
          <LabeledInput
            label="Faktor berhasil"
            value={successFactors}
            onChangeText={setSuccessFactors}
            multiline
            placeholder="Satu faktor per baris."
          />
          <LabeledInput
            label="Faktor gagal"
            value={failureFactors}
            onChangeText={setFailureFactors}
            multiline
            placeholder="Satu faktor per baris."
          />
          <LabeledInput label="Pelajaran yang Dipetik" value={lessons} onChangeText={setLessons} multiline />

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
              PIC tidak dapat mengevaluasi action_plannya sendiri.
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
    </KeyboardAvoidingView>
  );
}

export default function EvaluationRoute() {
  return <LiveEvaluationScreen />;
}
