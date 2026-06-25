// UI Fase 7 — Settings · Score Formula. Layar editor formula + override surface (D10 single-actor).
// Permission gate: manage_score_formula. RPC self-gated server (defense-in-depth).
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Badge, Button, EmptyState, GuidanceNote, LabeledInput, ScoreLegend, SectionCard, SkeletonCard } from '@/components/ui';
import {
  useActivePeriod,
  useFormulaActions,
  useScoreFormulaTemplates,
  useScoreFormulaVersions,
  useScoreOverride,
} from '@/hooks/use-people-score';
import { useProfile } from '@/hooks/use-profile';
import { FORMULA_STATUS_LABEL, METRIC_LABEL, type ScoreFormulaVersion } from '@/lib/people-score';

function FormulaVersionCard({
  version,
  canManage,
  onActivate,
}: {
  version: ScoreFormulaVersion;
  canManage: boolean;
  onActivate: (versionId: string) => void;
}) {
  // categories JSONB → array {code, weight, source_metric}
  const cats = Array.isArray(version.categories)
    ? (version.categories as Array<{ code: string; weight: number; source_metric: string }>)
    : [];
  const sum = cats.reduce((acc, c) => acc + Number(c.weight || 0), 0);
  const tone =
    version.status === 'active' ? 'success' : version.status === 'draft' ? 'warning' : 'neutral';
  return (
    <View
      className="gap-2.5 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
      accessible
      accessibilityLabel={`Versi ${version.version_number} ${FORMULA_STATUS_LABEL[version.status] ?? version.status}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-black dark:text-white">
          Versi {version.version_number}
        </Text>
        <Badge label={FORMULA_STATUS_LABEL[version.status] ?? version.status} tone={tone} />
      </View>
      {cats.length ? (
        <View className="gap-1">
          {cats.map((c) => (
            <View key={c.code} className="flex-row items-center justify-between">
              <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                {METRIC_LABEL[c.code] ?? c.code}
              </Text>
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                {c.weight}%
              </Text>
            </View>
          ))}
          <Text
            className={`mt-1 text-xs font-semibold ${sum === 100 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
            Total bobot: {sum}% {sum === 100 ? '(valid)' : '(harus 100% untuk aktivasi)'}
          </Text>
        </View>
      ) : (
        <Text className="text-xs text-neutral-400">Belum ada kategori — perlu diisi via SQL/Admin.</Text>
      )}
      {canManage && version.status === 'draft' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aktifkan versi ${version.version_number}`}
          className="h-9 items-center justify-center rounded-lg bg-brand-dark active:opacity-80"
          onPress={() => onActivate(version.id)}>
          <Text className="text-sm font-semibold text-white">Aktifkan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FormulaTemplateSection({
  templateId,
  templateName,
  level,
  canManage,
}: {
  templateId: string;
  templateName: string;
  level: string;
  canManage: boolean;
}) {
  const { versions, isLoading } = useScoreFormulaVersions(templateId);
  const { activate, isPending } = useFormulaActions(templateId);
  const [activateError, setActivateError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function handleActivate(versionId: string) {
    setActivateError(null);
    try {
      await activate(versionId, today);
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : 'Gagal mengaktifkan versi.');
    }
  }

  return (
    <SectionCard>
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-black dark:text-white">{templateName}</Text>
        <Badge label={level} tone="neutral" />
      </View>
      {isLoading ? (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">Memuat versi…</Text>
      ) : versions.length === 0 ? (
        <Text className="text-sm text-neutral-400">Belum ada versi formula.</Text>
      ) : (
        <View className="gap-2">
          {versions.map((v) => (
            <FormulaVersionCard
              key={v.id}
              version={v}
              canManage={canManage}
              onActivate={handleActivate}
            />
          ))}
        </View>
      )}
      {activateError ? (
        <Text accessibilityRole="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
          {activateError}
        </Text>
      ) : null}
      {isPending ? (
        <Text className="text-xs text-neutral-400">Menyimpan…</Text>
      ) : null}
    </SectionCard>
  );
}

export default function SettingsScoreFormulaScreen() {
  const { profile, isLoading: profileLoading, can } = useProfile();
  const { period, isLoading: periodLoading } = useActivePeriod();
  const periodId = period?.id ?? '';
  const { override, isPending } = useScoreOverride(periodId);
  const canManage = can('manage_score_formula');
  const { templates } = useScoreFormulaTemplates();

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

        {templates.length ? (
          <View className="gap-3">
            <Text className="px-1 text-xs font-semibold uppercase text-neutral-400">
              Template & Versi Formula
            </Text>
            {templates.map((t) => (
              <FormulaTemplateSection
                key={t.id}
                templateId={t.id}
                templateName={t.name}
                level={t.level}
                canManage={canManage}
              />
            ))}
          </View>
        ) : null}

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
