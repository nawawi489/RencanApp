// UI Fase 7 — People · Manual Score Override (mockup 46). Layar khusus dijangkau dari profil
// (pra-isi userId/nama/periode — tanpa paste UUID). D10: single-actor, efektif seketika,
// anti-self + reason wajib + clamp 0–100 ditegakkan klien lalu server (defense-in-depth).
// Editor formula/override massal tetap ada di settings-score-formula; ini jalur per-orang.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, ScoreBadge, SectionCard } from '@/components/ui';
import { reportError } from '@/lib/errors';
import { effectiveScore } from '@/lib/people-score';
import { useScoreOverride, useUserScore } from '@/hooks/use-people-score';
import { useProfile } from '@/hooks/use-profile';

export default function ManualScoreOverrideScreen() {
  const { userId, userName, periodId } = useLocalSearchParams<{
    userId: string;
    userName?: string;
    periodId: string;
  }>();
  const router = useRouter();
  const { profile, can } = useProfile();
  const { override, isPending } = useScoreOverride(periodId ?? '');
  const { score: current } = useUserScore(userId ?? '', periodId ?? '');

  const [manualScore, setManualScore] = useState('');
  const [reason, setReason] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  const targetName = userName?.trim() || 'anggota ini';
  const currentEffective = effectiveScore(current ?? null);

  // Guard 1: wewenang (defense-in-depth — RPC tetap penegak akhir).
  if (!can('manage_score_formula')) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-black">
        <Stack.Screen options={{ title: 'Override Skor' }} />
        <Text accessibilityRole="alert" className="text-center text-base text-neutral-600 dark:text-neutral-300">
          Anda tidak berwenang mengelola Score Formula.
        </Text>
      </View>
    );
  }

  // Guard 2: param wajib (userId + periodId).
  if (!userId || !periodId) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-black">
        <Stack.Screen options={{ title: 'Override Skor' }} />
        <Text accessibilityRole="alert" className="text-center text-base text-neutral-600 dark:text-neutral-300">
          Data target tidak lengkap. Buka override dari profil anggota.
        </Text>
      </View>
    );
  }

  // Guard 3: anti-self (D10) — diblok di UI sebelum menyentuh RPC.
  if (userId === profile?.id) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-black">
        <Stack.Screen options={{ title: 'Override Skor' }} />
        <Text accessibilityRole="alert" className="text-center text-base text-neutral-600 dark:text-neutral-300">
          Anda tidak bisa mengubah score Anda sendiri.
        </Text>
      </View>
    );
  }

  async function submit() {
    setInlineError(null);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setInlineError('Alasan override wajib diisi.');
      return;
    }
    const scoreNum = Number(manualScore);
    if (!manualScore.trim() || !Number.isFinite(scoreNum)) {
      setInlineError('Skor manual harus angka.');
      return;
    }
    if (scoreNum < 0 || scoreNum > 100) {
      setInlineError('Skor manual harus dalam rentang 0–100.');
      return;
    }
    try {
      await override({ userId: userId!, manualScore: scoreNum, reason: trimmedReason });
      Alert.alert('Berhasil', `Override skor untuk ${targetName} tersimpan.`);
      router.back();
    } catch (e) {
      setInlineError(reportError('Simpan override', e, 'Gagal menyimpan override.'));
    }
  }

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ title: 'Override Skor' }} />
      <View className="gap-5 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Override Skor</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Menyesuaikan Achievement Score {targetName} untuk periode berjalan.
          </Text>
        </View>

        <SectionCard>
          <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Skor saat ini</Text>
          {currentEffective != null ? (
            <ScoreBadge score={currentEffective} />
          ) : (
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Belum ada skor terhitung untuk anggota ini di periode aktif.
            </Text>
          )}
        </SectionCard>

        <GuidanceNote
          title="Append-only & teraudit"
          body="Skor otomatis tidak dihapus. Override membuat catatan baru beserta alasan, dan tercatat di Activity Log."
        />

        <View className="gap-3">
          <LabeledInput
            label="Skor manual (0–100)"
            value={manualScore}
            onChangeText={setManualScore}
            placeholder="contoh: 82"
            keyboardType="numeric"
            required
          />
          <LabeledInput
            label="Alasan override"
            value={reason}
            onChangeText={setReason}
            placeholder="mis. koreksi data instance yang salah hitung"
            multiline
            required
          />
          {inlineError ? (
            <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700 dark:text-red-400">
              {inlineError}
            </Text>
          ) : null}
          <Button
            label={isPending ? 'Menyimpan…' : 'Simpan Override'}
            onPress={submit}
            loading={isPending}
            disabled={isPending}
          />
        </View>
      </View>
    </ScrollView>
  );
}
