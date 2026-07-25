// UI Fase 7 — People · Profil (mockup 33). Drill-down satu anggota: identitas + Achievement Score
// + breakdown metrik + tren (diri sendiri) + tombol override (berwenang, non-self, periode aktif).
// Sumber skor: periode aktif (useUserScore, RLS-gated D1) → fallback ranking periode tertutup (D9).
// null vs 0 dibedakan (AC-7.23): null → GuidanceNote "Skor menyusul"; 0 nyata → band attention.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import {
  ContributionSection,
  TrendSection,
} from '@/components/people-profile-sections';
import {
  Avatar,
  Badge,
  Button,
  GuidanceNote,
  ScoreBadge,
  ScoreBreakdown,
  SectionCard,
  SkeletonCard,
} from '@/components/ui';
import {
  ACTION_PLAN_STATUS_LABEL,
  STATUS_TONE,
  countCompletedTasksInPeriod,
  getOrgProfileDetail,
  listTasksByPic,
  personLabel,
  type TaskWithPeople,
} from '@/lib/cards';
import { breakdownToMetrics, effectiveScore } from '@/lib/people-score';
import {
  useActivePeriod,
  useLatestClosedPeriod,
  useMyScoreHistory,
  useRanking,
  useUserScore,
  useUserScoreHistory,
} from '@/hooks/use-people-score';
import { useProfile } from '@/hooks/use-profile';

const ROLE_LEVEL_LABEL: Record<string, string> = {
  staff: 'Staff', management: 'Management', c_level: 'C-Level', ceo: 'CEO',
};

/**
 * "Role Name · Level" — suffix level disembunyikan bila nama role sudah memuat label level
 * (mis. "CEO / Super Admin · CEO" atau "Staff · Staff" jadi berulang; ISSUE-011).
 */
function roleWithLevel(roleName: string, roleLevel: string | null | undefined): string {
  if (!roleLevel) return roleName;
  const levelLabel = ROLE_LEVEL_LABEL[roleLevel] ?? roleLevel;
  if (roleName.toLowerCase().includes(levelLabel.toLowerCase())) return roleName;
  return `${roleName} · ${levelLabel}`;
}

function formatJoinDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function LivePeopleProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, can } = useProfile();

  // UI-S-PR1 — satu-satunya sumber identitas + rich chrome (nama, email, status, role, position,
  // join date). Header memakai query detail per-orang ini; tidak lagi memuat seluruh roster org.
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['profile-detail', id],
    queryFn: () => getOrgProfileDetail(id ?? ''),
    enabled: !!id,
  });

  const { period: active } = useActivePeriod();
  const { score: activeScore, isLoading: scoreLoading } = useUserScore(id ?? '', active?.id ?? '');
  const { period: closed } = useLatestClosedPeriod();
  const { ranking } = useRanking(closed?.id ?? '');
  const closedEntry = useMemo(() => ranking.find((r) => r.user_id === id), [ranking, id]);

  // UI-S-PR4 — Tugas (Tugas) yang user ini jadi PIC-nya. Collapsible.
  const [tasksOpen, setTasksOpen] = useState(false);
  const tasksQ = useQuery({
    queryKey: ['person-tasks', id],
    queryFn: () => listTasksByPic(id ?? ''),
    enabled: !!id && tasksOpen,
  });
  const tasks = (tasksQ.data ?? []) as TaskWithPeople[];

  const isSelf = profile?.id === id;
  const canManage = can('manage_score_formula');
  const canViewScore = isSelf || canManage;

  // PPL-06 Kontribusi bulan ini (OQ-6 diputuskan 2026-07-05): count AP done PIC pada periode aktif.
  // Semantik pakai `updated_at` sbg approksimasi `completed_at` (schema tak punya kolom itu; §NG-5
  // tidak mengizinkan migrasi baru). UX (OQ-6 sub-2): untuk profil orang lain, sembunyikan seksi
  // bila count=0 untuk menghindari ambiguitas 0-nyata vs RLS-hidden.
  const contributionQ = useQuery({
    queryKey: ['contribution', id, active?.id ?? 'none'],
    queryFn: () => countCompletedTasksInPeriod(id ?? '', active ?? null),
    enabled: !!id && !!active,
  });
  const contributionCount = contributionQ.data ?? 0;
  const showContribution = isSelf || contributionCount > 0;
  // Trend cross-user (PPL-06 / OQ-5 diputuskan 2026-07-05): kedua hook DIPANGGIL unconditionally
  // per render (rules-of-hooks — kritik STRATEGI-MOCK-3). Untuk profil orang lain, RLS server-side
  // (0013:799-815) menyaring viewer (self OR manage_score_formula OR view_all_workspace OR
  // is_supervisor_of). Viewer di luar scope → history=[] graceful → seksi Tren tidak render.
  const { history: myHistory } = useMyScoreHistory(6);
  const { history: userHistory } = useUserScoreHistory(id ?? '', 6);
  const history = isSelf ? myHistory : userHistory;
  const sparkPoints = useMemo(
    () => [...history].reverse().map((h) => Number(h.manual_adjusted_score ?? h.auto_calculated_score) || 0),
    [history],
  );

  // Skor efektif: periode aktif diutamakan; jika belum dihitung, pakai snapshot ranking tertutup.
  const activeEffective = effectiveScore(activeScore ?? null);
  const displayedScore = activeEffective ?? closedEntry?.score ?? null;
  const breakdown = useMemo(() => {
    if (activeScore?.metric_breakdown) return breakdownToMetrics(activeScore.metric_breakdown);
    if (closedEntry?.metric_breakdown) return breakdownToMetrics(closedEntry.metric_breakdown);
    return [];
  }, [activeScore, closedEntry]);

  const label = personLabel(detail, 'Anggota');
  const scoreSourceLabel = activeEffective != null ? active?.period_name : closed?.period_name;

  if (detailLoading) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Profil' }} />
        <SkeletonCard />
      </View>
    );
  }

  // PPL-06-Q1 (2026-07-05): not-found state — id deep-link tak match anggota org.
  // Cegah render header 'Anggota' + seksi kosong yang membingungkan.
  if (!detail) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Profil' }} />
        <GuidanceNote
          title="Anggota tidak ditemukan"
          body="Profil yang Anda cari mungkin sudah dihapus, non-aktif, atau di luar akses Anda."
        />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ title: 'Profil' }} />
      <View className="gap-5 p-5">
        {/* UI-S-PR1 — Identitas + status pill + role/position + join date. */}
        <View className="items-center gap-3">
          <Avatar name={label} seed={id} size={88} />
          <View className="items-center gap-1.5">
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold text-black dark:text-white">{label}</Text>
              {detail ? (
                <Badge
                  label={detail.is_active ? 'Aktif' : 'Nonaktif'}
                  tone={detail.is_active ? 'success' : 'neutral'}
                />
              ) : null}
            </View>
            {detail?.role_name ? (
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                {roleWithLevel(detail.role_name, detail.role_level)}
              </Text>
            ) : null}
            {detail?.position_title ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                {detail.position_title}
              </Text>
            ) : null}
            {detail.email ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">{detail.email}</Text>
            ) : null}
            {detail?.created_at ? (
              <Text className="text-xs text-neutral-400">
                Bergabung {formatJoinDate(detail.created_at)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* UI-S-PR2 — Action row: Chat (ke Inbox). Tidak tampil utk diri sendiri. */}
        {!isSelf ? (
          <View className="flex-row gap-2">
            <Button
              label="Chat"
              variant="secondary"
              onPress={() => router.push('/(tabs)/inbox' as Href)}
            />
          </View>
        ) : null}

        {/* UI-S-PR3 — Ranking card besar (rank + periode tertutup). Hanya tampil bila ada snapshot. */}
        {closedEntry && closed ? (
          <SectionCard>
            <View className="flex-row items-center gap-4">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-dark">
                <Text className="text-3xl font-extrabold text-white">#{closedEntry.rank_number}</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Ranking</Text>
                <Text className="text-base font-semibold text-black dark:text-white">
                  Periode {closed.period_name}
                </Text>
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  Snapshot resmi setelah periode ditutup.
                </Text>
              </View>
            </View>
          </SectionCard>
        ) : null}

        {/* Achievement Score — §33 komponen 9: hanya self atau admin/management. */}
        {canViewScore ? (
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
                <TrendSection points={sparkPoints} />
              </View>
            ) : (
              <GuidanceNote
                title="Skor menyusul"
                body="Achievement Score muncul setelah perhitungan periode berjalan atau periode pertama ditutup."
              />
            )}
          </SectionCard>
        ) : null}

        {/* PPL-06 Kontribusi bulan ini (OQ-6). Sembunyikan bila !isSelf && count=0. */}
        <ContributionSection
          show={!!active && showContribution}
          isLoading={contributionQ.isLoading}
          count={contributionCount}
        />

        {/* Breakdown metrik — §33: gated bersama score detail. */}
        {canViewScore && breakdown.length ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">Breakdown Metrik</Text>
            <ScoreBreakdown metrics={breakdown} />
          </SectionCard>
        ) : null}

        {/* UI-S-PR4 — Detail People: ringkasan role/dept/position dari `detail`. */}
        {detail ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">Detail People</Text>
            <View className="gap-1.5">
              <View className="flex-row justify-between gap-2">
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">Status</Text>
                <Text className="text-sm font-medium text-black dark:text-white">
                  {detail.is_active ? 'Aktif' : 'Nonaktif'}
                </Text>
              </View>
              {detail.role_name ? (
                <View className="flex-row justify-between gap-2">
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400">Hak akses</Text>
                  <Text className="text-sm font-medium text-black dark:text-white">
                    {roleWithLevel(detail.role_name, detail.role_level)}
                  </Text>
                </View>
              ) : null}
              {detail.position_title ? (
                <View className="flex-row justify-between gap-2">
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400">Posisi</Text>
                  <Text className="text-sm font-medium text-black dark:text-white">
                    {detail.position_title}
                  </Text>
                </View>
              ) : null}
              {detail.email ? (
                <View className="flex-row justify-between gap-2">
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400">Email</Text>
                  <Text className="text-sm font-medium text-black dark:text-white" numberOfLines={1}>
                    {detail.email}
                  </Text>
                </View>
              ) : null}
            </View>
          </SectionCard>
        ) : null}

        {/* UI-S-PR4 — Tugas (Tugas aktif yang user ini PIC-nya). Lazy fetch saat expand. */}
        <SectionCard>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tasksOpen ? 'Tutup Tugas' : 'Buka Tugas'}
            accessibilityState={{ expanded: tasksOpen }}
            onPress={() => setTasksOpen((v) => !v)}
            className="min-h-[44px] flex-row items-center justify-between gap-2 active:opacity-70">
            <Text className="text-base font-semibold text-black dark:text-white">Tugas aktif</Text>
            <Text className="text-sm text-brand-dark">{tasksOpen ? 'Tutup ▾' : 'Buka ▸'}</Text>
          </Pressable>
          {tasksOpen ? (
            tasksQ.isLoading ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Memuat tugas…</Text>
            ) : tasksQ.isError ? (
              <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
                Gagal memuat tugas.
              </Text>
            ) : tasks.length === 0 ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                Tidak ada Tugas aktif untuk anggota ini.
              </Text>
            ) : (
              <View className="gap-2">
                {tasks.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Buka ${t.name}`}
                    onPress={() => router.push(`/task/${t.id}` as Href)}
                    className="gap-1 rounded-xl bg-neutral-50 p-3 active:opacity-70 dark:bg-neutral-900">
                    <View className="flex-row items-start justify-between gap-2">
                      <Text className="flex-1 text-sm font-medium text-black dark:text-white">
                        {t.name}
                      </Text>
                      <Badge
                        label={ACTION_PLAN_STATUS_LABEL[t.status] ?? t.status}
                        tone={STATUS_TONE[t.status]}
                      />
                    </View>
                    {t.deadline ? (
                      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                        ⏰ Deadline {t.deadline}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )
          ) : null}
        </SectionCard>

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

export default function PeopleProfileRoute() {
  return <LivePeopleProfileScreen />;
}
