import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import {
  Avatar,
  EmptyState,
  ErrorState,
  GuidanceNote,
  ScoreBadge,
  ScoreBreakdown,
  ScoreLegend,
  ScoreSparkline,
  SkeletonList,
  type ScoreBreakdownMetric,
} from '@/components/ui';
import { listOrgProfiles, type PersonRef } from '@/lib/cards';
import { METRIC_LABEL, effectiveScore } from '@/lib/people-score';
import { useActivePeriod, useLatestClosedPeriod, useMyScore, useMyScoreHistory, useRanking } from '@/hooks/use-people-score';

type Person = NonNullable<PersonRef> & { score?: number | null };

function personLabel(p: Person): string {
  return p.full_name?.trim() || p.email || 'Tanpa nama';
}

function breakdownToMetrics(breakdown: unknown): ScoreBreakdownMetric[] {
  if (!breakdown || typeof breakdown !== 'object') return [];
  const obj = breakdown as Record<string, unknown>;
  const items: ScoreBreakdownMetric[] = [];
  for (const [code, raw] of Object.entries(obj)) {
    const label = METRIC_LABEL[code] ?? code;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) items.push({ label, value });
  }
  return items;
}

export default function PeopleScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['org-profiles'],
    queryFn: listOrgProfiles,
  });
  const { period } = useActivePeriod();
  const { score: myScore } = useMyScore(period?.id);
  // Per-user ScoreBadge bersumber dari ranking_snapshots periode tertutup terbaru
  // (D9: ranking hanya tampil setelah close). RLS otomatis menyaring per visibility.
  const { period: latestClosed } = useLatestClosedPeriod();
  const { ranking } = useRanking(latestClosed?.id ?? '');
  const { history } = useMyScoreHistory(6);
  // Sparkline KRONOLOGIS (kiri = terlama). DB urut DESC → reverse.
  const sparklinePoints = [...history]
    .reverse()
    .map((h) => Number(h.manual_adjusted_score ?? h.auto_calculated_score) || 0);

  const scoreByUser = new Map<string, number>();
  for (const r of ranking) scoreByUser.set(r.user_id, r.score);

  const peopleRaw = (data ?? []) as Person[];
  const people: Person[] = peopleRaw.map((p) => ({
    ...p,
    score: scoreByUser.has(p.id) ? scoreByUser.get(p.id)! : p.score ?? null,
  }));
  const myEffective = effectiveScore(myScore ?? null);
  const myBreakdown = myScore ? breakdownToMetrics(myScore.metric_breakdown) : [];

  return (
    <Screen title="People" subtitle="Ranking dan profil pencapaian.">
      {isLoading ? (
        <SkeletonList count={5} />
      ) : isError ? (
        <ErrorState
          title="Gagal memuat People"
          description="Tidak bisa mengambil daftar anggota organisasi."
          onRetry={() => refetch()}
        />
      ) : people.length === 0 ? (
        <EmptyState
          icon={<Text className="text-2xl">👥</Text>}
          title="Belum ada anggota"
          description="Anggota organisasi yang diundang admin akan muncul di sini."
        />
      ) : (
        <>
          <ScoreLegend />

          {/* Skor saya — hanya tampil saat ada periode aktif & skor sudah dihitung. */}
          {period && myEffective != null ? (
            <View
              className="gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
              accessible
              accessibilityLabel="Skor saya">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase text-neutral-400">
                  Skor saya · {period.period_name}
                </Text>
              </View>
              <ScoreBadge score={myEffective} />
              {sparklinePoints.length ? (
                <View className="gap-1.5">
                  <Text className="text-xs font-semibold uppercase text-neutral-400">Tren</Text>
                  <ScoreSparkline points={sparklinePoints} />
                </View>
              ) : null}
              {myBreakdown.length ? <ScoreBreakdown metrics={myBreakdown} /> : null}
            </View>
          ) : period ? (
            <GuidanceNote
              title="Skor menyusul"
              body={`Periode "${period.period_name}" aktif. Skor Anda muncul setelah perhitungan periode berjalan.`}
            />
          ) : (
            <GuidanceNote
              title="Belum ada periode skoring"
              body="Achievement Score muncul setelah administrator membuka periode skoring untuk organisasi."
            />
          )}

          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase text-neutral-400">
                Anggota Organisasi
              </Text>
              <Text className="text-xs font-semibold text-neutral-400">{people.length} user</Text>
            </View>

            {people.map((p, i) => (
              <View
                key={p.id}
                className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
                <View className="h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                  <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">{i + 1}</Text>
                </View>
                <Avatar name={personLabel(p)} seed={p.id} />
                <View className="flex-1">
                  <Text className="text-base font-bold text-black dark:text-white" numberOfLines={1}>
                    {personLabel(p)}
                  </Text>
                  {p.email ? (
                    <Text className="text-xs text-neutral-400" numberOfLines={1}>
                      {p.email}
                    </Text>
                  ) : null}
                  {/* p.score null vs 0: null → tak ada badge; 0 nyata → band attention */}
                  {p.score != null ? (
                    <View className="mt-1.5">
                      <ScoreBadge score={p.score} />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
