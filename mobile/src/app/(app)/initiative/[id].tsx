import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { ActivityLogPanel } from '@/components/activity-log-panel';
import { Avatar, Badge, Button, EmptyState, ErrorState, MetaGrid, ProgressOrb, SectionCard, SkeletonList } from '@/components/ui';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { alertFriendlyError } from '@/lib/errors';
import { childrenSublabel, ratioDoneOfChildren } from '@/lib/progress';
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_TONE,
  activateInitiative,
  getInitiative,
  listActionPlans,
  personLabel,
  type ActionPlanWithPeople,
} from '@/lib/cards';
import { listTeams } from '@/lib/org-structure';
import { guardActivationFields } from '@/lib/activation-check';

// ---------- UI-S-ID2 — Ruang Eksekusi & Tim/Akses Otomatis ----------
type ExecCounts = {
  draft: number;
  active: number;
  submitted: number;
  done: number;
  revision: number;
  total: number;
};

function computeExecCounts(plans: ActionPlanWithPeople[]): ExecCounts {
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

function ExecTile({
  label,
  value,
  containerCls,
  textCls,
}: {
  label: string;
  value: number;
  containerCls: string;
  textCls: string;
}) {
  return (
    <View className={`rounded-lg px-3 py-1.5 ${containerCls}`}>
      <Text className={`text-[10px] ${textCls}`}>{label}</Text>
      <Text className={`text-sm font-semibold ${textCls}`}>{value}</Text>
    </View>
  );
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
        <Badge label={`${counts.total} Action Plan`} tone="info" />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Status pekerjaan di bawah Initiative ini.
      </Text>
      <View className="flex-row flex-wrap gap-2 pt-1">
        <ExecTile
          label="Aktif"
          value={counts.active}
          containerCls="bg-blue-100 dark:bg-blue-950"
          textCls="text-blue-700 dark:text-blue-300"
        />
        <ExecTile
          label="Review"
          value={counts.submitted}
          containerCls="bg-amber-100 dark:bg-amber-950"
          textCls="text-amber-700 dark:text-amber-300"
        />
        <ExecTile
          label="Selesai"
          value={counts.done}
          containerCls="bg-emerald-100 dark:bg-emerald-950"
          textCls="text-emerald-700 dark:text-emerald-300"
        />
        <ExecTile
          label="Revisi"
          value={counts.revision}
          containerCls="bg-red-100 dark:bg-red-950"
          textCls="text-red-700 dark:text-red-300"
        />
        <ExecTile
          label="Draft"
          value={counts.draft}
          containerCls="bg-neutral-100 dark:bg-neutral-800"
          textCls="text-neutral-700 dark:text-neutral-300"
        />
      </View>
      <View className="pt-2">
        <Button label="Buka Chat Initiative" variant="secondary" onPress={onOpenChat} />
      </View>
    </SectionCard>
  );
}

type RosterEntry = { id: string; full_name: string | null; email: string | null; roles: Set<string> };

function collectRoster(plans: ActionPlanWithPeople[], initiativePicId: string | null): RosterEntry[] {
  const map = new Map<string, RosterEntry>();
  const add = (p: PersonRefLike, role: string) => {
    if (!p) return;
    const existing = map.get(p.id);
    if (existing) existing.roles.add(role);
    else map.set(p.id, { id: p.id, full_name: p.full_name, email: p.email, roles: new Set([role]) });
  };
  if (initiativePicId) {
    const initPic = plans.find((p) => p.pic?.id === initiativePicId)?.pic
      ?? plans.find((p) => p.reviewer?.id === initiativePicId)?.reviewer
      ?? null;
    if (initPic) add(initPic, 'Initiative PIC');
    else map.set(initiativePicId, { id: initiativePicId, full_name: null, email: null, roles: new Set(['Initiative PIC']) });
  }
  for (const p of plans) {
    add(p.pic, 'PIC AP');
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
        Hak akses Initiative ini terbentuk otomatis dari PIC & Reviewer Action Plan di bawahnya.
      </Text>
      {entries.length === 0 ? (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">
          Belum ada anggota — tambahkan Action Plan dengan PIC/Reviewer.
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
                    <Badge key={role} label={role} tone={role === 'Initiative PIC' ? 'info' : 'neutral'} />
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

function ActionPlanRow({ item, onPress }: { item: ActionPlanWithPeople; onPress: () => void }) {
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

export function LiveInitiativeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const initiativeQ = useQuery({ queryKey: ['initiative', id], queryFn: () => getInitiative(id) });
  const plansQ = useQuery({ queryKey: ['action-plans', id], queryFn: () => listActionPlans(id) });
  // UI-S-I01 display: nama tim — query teams sekali, resolve via team_id.
  const teamsQ = useQuery({ queryKey: ['teams', { activeOnly: false }], queryFn: () => listTeams() });
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('initiative', id);

  useFocusEffect(
    useCallback(() => {
      initiativeQ.refetch();
      plansQ.refetch();
      refetchCompliance(); // indikator Kelengkapan ikut segar setelah tambah/arsip Action Plan
    }, [initiativeQ, plansQ, refetchCompliance]),
  );

  const activateM = useMutation({
    mutationFn: () => activateInitiative(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['initiative', id] });
      qc.invalidateQueries({ queryKey: ['initiatives'] });
    },
    onError: (e) => alertFriendlyError('Tidak bisa diaktifkan', e, 'Initiative belum bisa diaktifkan. Coba lagi.'),
  });

  const initiative = initiativeQ.data;
  const execCounts = useMemo(() => computeExecCounts(plansQ.data ?? []), [plansQ.data]);
  const roster = useMemo(
    () => collectRoster(plansQ.data ?? [], initiative?.pic_id ?? null),
    [plansQ.data, initiative?.pic_id],
  );
  // WSA-08 §14.4 — CTA "+ Tambah" dihapus; tambah Action Plan hanya dari tree Workspace.

  function handleActivate() {
    if (initiative && guardActivationFields('initiative', initiative)) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Action Plan',
      onAddChild: () => router.push(`/action-plan/new?initiativeId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: initiative?.name ?? 'Initiative' }} />
      <View className="gap-5 p-5">
        {initiativeQ.isLoading || !initiative ? (
          <SkeletonList count={3} />
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Badge
                    label={INITIATIVE_STATUS_LABEL[initiative.status] ?? initiative.status}
                    tone={STATUS_TONE[initiative.status]}
                  />
                  <Text className="text-2xl font-bold text-black dark:text-white">{initiative.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={ratioDoneOfChildren(plansQ.data ?? [])}
                  sublabel={childrenSublabel(plansQ.data ?? [])}
                />
              </View>
              <MetaGrid
                items={[
                  { label: 'Target Hasil', value: initiative.target_result || '—' },
                  {
                    label: 'Periode',
                    value: `${initiative.period_start ?? '—'} → ${initiative.period_end ?? '—'}`,
                  },
                  {
                    label: 'Tim',
                    value:
                      teamsQ.data?.find((t) => t.id === initiative.team_id)?.name ?? '—',
                  },
                ]}
              />
            </View>

            {initiative.description ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Deskripsi</Text>
                <Text className="text-base text-black dark:text-white">{initiative.description}</Text>
              </SectionCard>
            ) : null}

            {/* UI-S-ID2 — Ruang Eksekusi + Tim & Akses Otomatis */}
            <ExecSpaceCard
              counts={execCounts}
              onOpenChat={() => router.push('/(tabs)/inbox' as Href)}
            />
            <RosterCard entries={roster} />

            <MbrCompletionIndicator compliance={compliance} />

            {initiative.status === 'draft' ? (
              <Button
                label="Aktifkan Initiative"
                onPress={handleActivate}
                loading={activateM.isPending}
              />
            ) : null}

            {/* PRD §26 — Evaluation muncul saat Initiative mendekati selesai atau selesai. */}
            {/* Anti-self gating ditangani oleh layar evaluation (picId dibandingkan dgn profile). */}
            {initiative.status === 'active' || initiative.status === 'done' ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Evaluasi Initiative</Text>
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  Catat pencapaian, lesson learned, dan apakah perlu jadi SOP atau rollout.
                </Text>
                <Button
                  label={initiative.status === 'done' ? 'Buka Evaluasi' : 'Mulai Evaluasi'}
                  variant="secondary"
                  onPress={() =>
                    router.push(
                      `/evaluation?initiativeId=${id}&picId=${initiative.pic_id ?? ''}&status=${initiative.status}` as Href,
                    )
                  }
                />
              </SectionCard>
            ) : null}

            <View className="gap-3">
              <Text className="text-lg font-bold text-black dark:text-white">Action Plan</Text>

              {plansQ.isLoading ? (
                <SkeletonList count={2} />
              ) : plansQ.isError ? (
                <ErrorState onRetry={() => plansQ.refetch()} />
              ) : plansQ.data && plansQ.data.length > 0 ? (
                plansQ.data.map((item) => (
                  <ActionPlanRow
                    key={item.id}
                    item={item}
                    onPress={() => router.push(`/action-plan/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Action Plan"
                  description="Pecah Initiative ini menjadi pekerjaan konkret dengan PIC, Reviewer, dan deadline."
                />
              )}
            </View>

            <ActivityLogPanel entityType="initiative" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function InitiativeDetailRoute() {
  return <LiveInitiativeDetailScreen />;
}
