import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { ActivityLogPanel } from '@/components/activity-log-panel';
import { StatTile } from '@/components/stat-tile';
import { Avatar, Badge, Button, EmptyState, ErrorState, MetaGrid, ProgressOrb, SectionCard, SectionHeading, SkeletonList } from '@/components/ui';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useCardProgress } from '@/hooks/use-workspace';
import { alertFriendlyError } from '@/lib/errors';
import { childrenSublabel, ratioDoneOfChildren, treeOrbLabel } from '@/lib/progress';
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_TONE,
  activateActionPlan,
  getActionPlan,
  listTasks,
  personLabel,
  type TaskWithPeople,
} from '@/lib/cards';
import { listTeams } from '@/lib/org-structure';
import { guardActivationFields } from '@/lib/activation-check';
import { useProfile } from '@/hooks/use-profile';
// use-profile provides orgId at component level below

// ---------- UI-S-ID2 — Ruang Eksekusi & Tim/Akses Otomatis ----------
type ExecCounts = {
  draft: number;
  active: number;
  submitted: number;
  done: number;
  revision: number;
  total: number;
};

function computeExecCounts(plans: TaskWithPeople[]): ExecCounts {
  const c: ExecCounts = { draft: 0, active: 0, submitted: 0, done: 0, revision: 0, total: plans.length };
  for (const p of plans) {
    if (p.status === 'draft') c.draft++;
    else if (p.status === 'assigned' || p.status === 'in_progress') c.active++;
    else if (p.status === 'submitted') c.submitted++;
    else if (p.status === 'done') c.done++;
    else if (p.status === 'revision') c.revision++;
  }
  return c;
}

function ExecSpaceCard({
  counts,
  onOpenChat,
}: {
  counts: ExecCounts;
  onOpenChat: () => void;
}) {
  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold text-black dark:text-white">Ruang Eksekusi</Text>
        <Badge label={`${counts.total} Tugas`} tone="info" />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Status pekerjaan di bawah Rencana Aksi ini.
      </Text>
      <View className="flex-row flex-wrap gap-2 pt-1">
        <StatTile
          label="Aktif"
          value={counts.active}
          containerCls="bg-blue-100 dark:bg-blue-950"
          textCls="text-blue-700 dark:text-blue-300"
        />
        <StatTile
          label="Review"
          value={counts.submitted}
          containerCls="bg-amber-100 dark:bg-amber-950"
          textCls="text-amber-700 dark:text-amber-300"
        />
        <StatTile
          label="Selesai"
          value={counts.done}
          containerCls="bg-emerald-100 dark:bg-emerald-950"
          textCls="text-emerald-700 dark:text-emerald-300"
        />
        <StatTile
          label="Revisi"
          value={counts.revision}
          containerCls="bg-red-100 dark:bg-red-950"
          textCls="text-red-700 dark:text-red-300"
        />
        <StatTile
          label="Draft"
          value={counts.draft}
          containerCls="bg-neutral-100 dark:bg-neutral-800"
          textCls="text-neutral-700 dark:text-neutral-300"
        />
      </View>
      <View className="pt-2">
        <Button label="Buka Chat Rencana Aksi" variant="secondary" onPress={onOpenChat} />
      </View>
    </SectionCard>
  );
}

type RosterEntry = { id: string; full_name: string | null; email: string | null; roles: Set<string> };

function collectRoster(plans: TaskWithPeople[], actionPlanPicId: string | null): RosterEntry[] {
  const map = new Map<string, RosterEntry>();
  const add = (p: PersonRefLike, role: string) => {
    if (!p) return;
    const existing = map.get(p.id);
    if (existing) existing.roles.add(role);
    else map.set(p.id, { id: p.id, full_name: p.full_name, email: p.email, roles: new Set([role]) });
  };
  if (actionPlanPicId) {
    const initPic = plans.find((p) => p.pic?.id === actionPlanPicId)?.pic
      ?? plans.find((p) => p.reviewer?.id === actionPlanPicId)?.reviewer
      ?? null;
    if (initPic) add(initPic, 'Rencana Aksi PIC');
    else map.set(actionPlanPicId, { id: actionPlanPicId, full_name: null, email: null, roles: new Set(['Rencana Aksi PIC']) });
  }
  for (const p of plans) {
    add(p.pic, 'PIC Tugas');
    add(p.reviewer, 'Reviewer');
  }
  return Array.from(map.values());
}

type PersonRefLike = { id: string; full_name: string | null; email: string | null } | null;

function RosterCard({ entries }: { entries: RosterEntry[] }) {
  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold text-black dark:text-white">Tim & Akses Otomatis</Text>
        <Badge label={`${entries.length} orang`} tone="neutral" />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Hak akses Rencana Aksi ini terbentuk otomatis dari PIC & Reviewer Tugas di bawahnya.
      </Text>
      {entries.length === 0 ? (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">
          Belum ada anggota — tambahkan Tugas dengan PIC/Reviewer.
        </Text>
      ) : (
        <View className="gap-2 pt-1">
          {entries.map((r) => (
            <View key={r.id} className="flex-row items-center gap-3">
              <Avatar name={personLabel(r)} seed={r.id} />
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-semibold text-black dark:text-white" numberOfLines={1}>
                  {personLabel(r)}
                </Text>
                <View className="flex-row flex-wrap gap-1">
                  {Array.from(r.roles).map((role) => (
                    <Badge key={role} label={role} tone={role === 'Rencana Aksi PIC' ? 'info' : 'neutral'} />
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

function TaskRow({ item, onPress }: { item: TaskWithPeople; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge
          label={ACTION_PLAN_STATUS_LABEL[item.status] ?? item.status}
          tone={STATUS_TONE[item.status]}
        />
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          PIC: {item.pic ? personLabel(item.pic) : '—'}
        </Text>
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          Reviewer: {item.reviewer ? personLabel(item.reviewer) : '—'}
        </Text>
        {item.deadline ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">⏰ {item.deadline}</Text>
        ) : null}
        {item.priority ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            {PRIORITY_LABEL[item.priority] ?? item.priority}
          </Text>
        ) : null}
      </View>
    </SectionCard>
  );
}

export function LiveActionPlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const qc = useQueryClient();

  const actionPlanQ = useQuery({ queryKey: ['action_plan', id], queryFn: () => getActionPlan(id) });
  const plansQ = useQuery({ queryKey: ['action-plans', id], queryFn: () => listTasks(id) });
  // UI-S-I01 display: nama tim — query teams sekali, resolve via team_id.
  const teamsQ = useQuery({ queryKey: ['teams', { activeOnly: false }], queryFn: () => listTeams() });
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('action_plan', id);
  // WSA-15 / Opsi B — orb capaian sinkron dengan tree Workspace: pakai rollup rekursif
  // server (workspace_card_progress) = rata-rata progress Tugas anak, bukan heuristik
  // %-selesai klien. Selama RPC belum termuat (null), fall back ke `ratioDoneOfChildren`.
  const { progressOf } = useCardProgress([id]);

  useFocusEffect(
    useCallback(() => {
      actionPlanQ.refetch();
      plansQ.refetch();
      refetchCompliance(); // indikator Kelengkapan ikut segar setelah tambah/arsip Tugas
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const activateM = useMutation({
    mutationFn: () => activateActionPlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action_plan', id] });
      qc.invalidateQueries({ queryKey: ['action_plans'] });
    },
    onError: (e) => alertFriendlyError('Tidak bisa diaktifkan', e, 'Rencana Aksi belum bisa diaktifkan. Coba lagi.'),
  });

  const action_plan = actionPlanQ.data;
  const execCounts = useMemo(() => computeExecCounts(plansQ.data ?? []), [plansQ.data]);
  const roster = useMemo(
    () => collectRoster(plansQ.data ?? [], action_plan?.pic_id ?? null),
    [plansQ.data, action_plan?.pic_id],
  );
  // WSA-08 §14.4 — CTA "+ Tambah" dihapus; tambah Tugas hanya dari tree Workspace.

  async function handleActivate() {
    const orgId = profile?.organization_id ?? '';
    if (action_plan && (await guardActivationFields(orgId, 'action_plan', action_plan))) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Tugas',
      onAddChild: () => router.push(`/task/new?actionPlanId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: action_plan?.name ?? 'Rencana Aksi' }} />
      <View className="gap-5 p-5">
        {actionPlanQ.isLoading ? (
          <SkeletonList count={3} />
        ) : actionPlanQ.isError ? (
          // Sebelumnya error pun jatuh ke SkeletonList — layar terkunci tanpa jalan keluar.
          <ErrorState onRetry={() => actionPlanQ.refetch()} />
        ) : !action_plan ? (
          // null (bukan error): getActionPlan maybeSingle → id di luar akses/tidak ada.
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Badge
                    label={INITIATIVE_STATUS_LABEL[action_plan.status] ?? action_plan.status}
                    tone={STATUS_TONE[action_plan.status]}
                  />
                  <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">{action_plan.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={progressOf(id) ?? ratioDoneOfChildren(plansQ.data ?? [])}
                  sublabel={childrenSublabel(plansQ.data ?? [])}
                  label={treeOrbLabel('action_plan')}
                />
              </View>
              <MetaGrid
                items={[
                  { label: 'Target Hasil', value: action_plan.target_result || '—' },
                  {
                    label: 'Periode',
                    value: `${action_plan.period_start ?? '—'} → ${action_plan.period_end ?? '—'}`,
                  },
                  {
                    label: 'Tim',
                    value:
                      teamsQ.data?.find((t) => t.id === action_plan.team_id)?.name ?? '—',
                  },
                ]}
              />
            </View>

            {action_plan.description ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Deskripsi</Text>
                <Text className="text-base text-black dark:text-white">{action_plan.description}</Text>
              </SectionCard>
            ) : null}

            {/* UI-S-ID2 — Ruang Eksekusi + Tim & Akses Otomatis */}
            <ExecSpaceCard
              counts={execCounts}
              onOpenChat={() => router.push('/(tabs)/inbox' as Href)}
            />
            <RosterCard entries={roster} />

            <MbrCompletionIndicator compliance={compliance} />

            {action_plan.status === 'draft' ? (
              <Button
                label="Aktifkan Rencana Aksi"
                onPress={handleActivate}
                loading={activateM.isPending}
              />
            ) : null}

            {/* S4-2 — sunting. Server hanya menerima draft/active (RPC update_action_plan);
                pada done/archived tombol tak ditawarkan agar copy sinkron dengan gerbang. */}
            {action_plan.status === 'draft' || action_plan.status === 'active' ? (
              <Button
                label="Ubah Rencana Aksi"
                variant="secondary"
                onPress={() => router.push(`/action-plan/edit/${id}` as Href)}
              />
            ) : null}

            {/* PRD §26 — Evaluation muncul saat Rencana Aksi mendekati selesai atau selesai. */}
            {/* Anti-self gating ditangani oleh layar evaluation (picId dibandingkan dgn profile). */}
            {action_plan.status === 'active' || action_plan.status === 'done' ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Evaluasi Rencana Aksi</Text>
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  Catat pencapaian, lesson learned, dan apakah perlu jadi SOP atau rollout.
                </Text>
                <Button
                  label={action_plan.status === 'done' ? 'Buka Evaluasi' : 'Mulai Evaluasi'}
                  variant="secondary"
                  onPress={() =>
                    router.push(
                      `/evaluation?actionPlanId=${id}&picId=${action_plan.pic_id ?? ''}&status=${action_plan.status}` as Href,
                    )
                  }
                />
              </SectionCard>
            ) : null}

            <View className="gap-3">
              <SectionHeading title="Tugas" />

              {plansQ.isLoading ? (
                <SkeletonList count={2} />
              ) : plansQ.isError ? (
                <ErrorState onRetry={() => plansQ.refetch()} />
              ) : plansQ.data && plansQ.data.length > 0 ? (
                plansQ.data.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    onPress={() => router.push(`/task/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Tugas"
                  description="Pecah Rencana Aksi ini menjadi pekerjaan konkret dengan PIC, Reviewer, dan deadline."
                />
              )}
            </View>

            <ActivityLogPanel entityType="action_plan" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function ActionPlanDetailRoute() {
  return <LiveActionPlanDetailScreen />;
}
