// UI Fase 7 — Settings · Score Formula. Layar editor formula + override surface (D10 single-actor).
// Permission gate: manage_score_formula. RPC self-gated server (defense-in-depth).
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Badge, Button, EmptyState, GuidanceNote, LabeledInput, ScoreLegend, SectionCard, SkeletonCard } from '@/components/ui';
import { useActivePeriod, useScoreOverride } from '@/hooks/use-people-score';
import { useProfile } from '@/hooks/use-profile';
import { FORMULA_STATUS_LABEL } from '@/lib/people-score';

export default function SettingsScoreFormulaScreen() {
  const { profile, isLoading: profileLoading, can } = useProfile();
  const { period, isLoading: periodLoading } = useActivePeriod();
  const periodId = period?.id ?? '';
  const { override, isPending } = useScoreOverride(periodId);

  const [targetUserId, setTargetUserId] = useState('');
  const [manualScore, setManualScore] = useState('');
  const [reason, setReason] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  if (profileLoading) return <SkeletonCard />;

  if (!can('manage_score_formula')) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Stack.Screen options={{ title: 'Score Formula' }} />
        <Text accessibilityRole="alert" className="text-base text-neutral-600 dark:text-neutral-300">
          Anda tidak memiliki akses untuk mengelola Score Formula.
        </Text>
      </View>
    );
  }

  async function submitOverride() {
    setInlineError(null);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setInlineError('Alasan override wajib diisi.');
      return;
    }
    if (!targetUserId.trim()) {
      setInlineError('Target user wajib diisi.');
      return;
    }
    if (targetUserId.trim() === profile?.id) {
      setInlineError('Anda tidak bisa mengubah score Anda sendiri.');
      return;
    }
    const scoreNum = Number(manualScore);
    if (!Number.isFinite(scoreNum)) {
      setInlineError('Skor manual harus angka.');
      return;
    }
    try {
      await override({ userId: targetUserId.trim(), manualScore: scoreNum, reason: trimmedReason });
      Alert.alert('Berhasil', 'Override skor tersimpan.');
      setTargetUserId('');
      setManualScore('');
      setReason('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan override.';
      setInlineError(msg);
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Score Formula' }} />
      <View className="gap-5 p-5">
        <ScoreLegend />

        <SectionCard>
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-black dark:text-white">Periode aktif</Text>
            {period ? (
              <Badge label={FORMULA_STATUS_LABEL.active ?? 'Aktif'} tone="success" />
            ) : (
              <Badge label="—" tone="neutral" />
            )}
          </View>
          {periodLoading ? (
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">Memuat…</Text>
          ) : period ? (
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">
              {period.period_name} · {period.period_start} – {period.period_end}
            </Text>
          ) : (
            <GuidanceNote
              title="Belum ada periode skoring"
              body="Buka periode skoring agar perhitungan & override skor tersedia."
            />
          )}
        </SectionCard>

        <SectionCard>
          <Text className="text-base font-semibold text-black dark:text-white">
            Manual Override Skor
          </Text>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            Single-actor. Anti-self ditegakkan. Auto score tetap disimpan utuh (append-only).
          </Text>
          {!period ? (
            <EmptyState
              title="Tidak ada periode aktif"
              description="Override hanya bisa pada periode aktif."
            />
          ) : (
            <View className="gap-3">
              <LabeledInput
                label="User ID target"
                value={targetUserId}
                onChangeText={setTargetUserId}
                placeholder="uuid user"
              />
              <LabeledInput
                label="Skor manual (0-100)"
                value={manualScore}
                onChangeText={setManualScore}
                placeholder="contoh: 82"
                keyboardType="numeric"
              />
              <LabeledInput
                label="Alasan override"
                value={reason}
                onChangeText={setReason}
                placeholder="koreksi data, dll"
                multiline
              />
              {inlineError ? (
                <Text accessibilityRole="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {inlineError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Simpan Override"
                disabled={isPending}
                className={`h-11 items-center justify-center rounded-xl ${
                  isPending ? 'bg-neutral-300 dark:bg-neutral-700' : 'bg-brand-dark active:opacity-80'
                }`}
                onPress={submitOverride}>
                <Text className="text-base font-semibold text-white">
                  {isPending ? 'Menyimpan…' : 'Simpan Override'}
                </Text>
              </Pressable>
            </View>
          )}
        </SectionCard>
      </View>
    </ScrollView>
  );
}
