// UI Fase 7 — People · Profil (mockup 33). Drill-down satu anggota: identitas + Achievement Score
// + breakdown metrik + tren (diri sendiri) + tombol override (berwenang, non-self, periode aktif).
// Sumber skor: periode aktif (useUserScore, RLS-gated D1) → fallback ranking periode tertutup (D9).
// null vs 0 dibedakan (AC-7.23): null → GuidanceNote "Skor menyusul"; 0 nyata → band attention.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import {
  Avatar,
  Button,
  GuidanceNote,
  ScoreBadge,
  ScoreBreakdown,
  ScoreSparkline,
  SectionCard,
  SkeletonCard,
  type ScoreBreakdownMetric,
} from '@/components/ui';
import { listOrgProfiles, type PersonRef } from '@/lib/cards';
import { METRIC_LABEL, effectiveScore } from '@/lib/people-score';
import {
  useActivePeriod,
  useLatestClosedPeriod,
  useMyScoreHistory,
  useRanking,
  useUserScore,
} from '@/hooks/use-people-score';
import { useProfile } from '@/hooks/use-profile';

type Person = NonNullable<PersonRef>;

function personLabel(p: Person | undefined): string {
  return p?.full_name?.trim() || p?.email || 'Anggota';
}

/** metric_breakdown JSONB (skala 0–100) → metrik berlabel untuk ScoreBreakdown. */
function breakdownToMetrics(breakdown: unknown): ScoreBreakdownMetric[] {
  if (!breakdown || typeof breakdown !== 'object') return [];
  const out: ScoreBreakdownMetric[] = [];
  for (const [code, raw] of Object.entries(breakdown as Record<string, unknown>)) {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) out.push({ label: METRIC_LABEL[code] ?? code, value });
  }
  return out;
}

export default function PeopleProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, can } = useProfile();

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['org-profiles'],
    queryFn: listOrgProfiles,
  });
  const person = useMemo(
    () => ((profiles ?? []) as Person[]).find((p) => p.id === id),
    [profiles, id],
  );

  const { period: active } = useActivePeriod();
  const { score: activeScore, isLoading: scoreLoading } = useUserScore(id ?? '', active?.id ?? '');
  const { period: closed } = useLatestClosedPeriod();
  const { ranking } = useRanking(closed?.id ?? '');
  const closedEntry = useMemo(() => ranking.find((r) => r.user_id === id), [ranking, id]);

  const isSelf = profile?.id === id;
  const canManage = can('manage_score_formula');
  // Trend hanya untuk diri sendiri (lib histori = self-only). DESC → reverse jadi kronologis.
  const { history } = useMyScoreHistory(6);
  const sparkPoints = useMemo(
    () =>
      isSelf
        ? [...history].reverse().map((h) => Number(h.manual_adjusted_score ?? h.auto_calculated_score) || 0)
        : [],
    [isSelf, history],
  );

  // Skor efektif: periode aktif diutamakan; jika belum dihitung, pakai snapshot ranking tertutup.
  const activeEffective = effectiveScore(activeScore ?? null);
  const displayedScore = activeEffective ?? closedEntry?.score ?? null;
  const breakdown = useMemo(() => {
    if (activeScore?.metric_breakdown) return breakdownToMetrics(activeScore.metric_breakdown);
    if (closedEntry?.metric_breakdown) return breakdownToMetrics(closedEntry.metric_breakdown);
    return [];
  }, [activeScore, closedEntry]);

  const label = personLabel(person);
  const scoreSourceLabel = activeEffective != null ? active?.period_name : closed?.period_name;

  if (profilesLoading) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Profil' }} />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ title: 'Profil' }} />
      <View className="gap-5 p-5">
        {/* Identitas */}
        <View className="items-center gap-3">
          <Avatar name={label} seed={id} size={88} />
          <View className="items-center gap-1">
            <Text className="text-2xl font-bold text-black dark:text-white">{label}</Text>
            {person?.email ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">{person.email}</Text>
            ) : null}
          </View>
        </View>

        {/* Achievement Score */}
        <SectionCard>
          <Text className="text-base font-semibold text-black dark:text-white">Achievement Score</Text>
          {scoreLoading ? (
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">Memuat skor…</Text>
          ) : displayedScore != null ? (
            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <ScoreBadge score={displayedScore} />
                {scoreSourceLabel ? (
                  <Text className="text-xs text-neutral-400">· {scoreSourceLabel}</Text>
                ) : null}
              </View>
              {sparkPoints.length ? (
                <View className="gap-1.5">
                  <Text className="text-xs font-semibold uppercase text-neutral-400">Tren</Text>
                  <ScoreSparkline points={sparkPoints} />
                </View>
              ) : null}
            </View>
          ) : (
            <GuidanceNote
              title="Skor menyusul"
              body="Achievement Score muncul setelah perhitungan periode berjalan atau periode pertama ditutup."
            />
          )}
        </SectionCard>

        {/* Breakdown metrik */}
        {breakdown.length ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">Breakdown Metrik</Text>
            <ScoreBreakdown metrics={breakdown} />
          </SectionCard>
        ) : null}

        {/* Override — hanya berwenang, bukan diri sendiri (anti-self D10), periode aktif ada. */}
        {canManage && !isSelf && active ? (
          <View className="gap-2">
            <Button
              label="Override Skor"
              variant="secondary"
              onPress={() =>
                router.push(
                  `/manual-score-override?userId=${id}&userName=${encodeURIComponent(label)}&periodId=${active.id}` as Href,
                )
              }
            />
            <Text className="px-1 text-xs text-neutral-400">
              Single-actor + jejak audit. Skor otomatis tetap tersimpan utuh (append-only).
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
