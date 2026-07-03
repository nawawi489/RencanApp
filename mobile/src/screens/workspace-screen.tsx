// Workspace (Fase 6) — Performance & Development sebagai route deep-linkable.
// Performance (Fase 4): Goal → KPI Area → Strategy → Initiative, + Initiative Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Initiative → Action Plan.
// UI-N-003 (Stage 1 B′): tree 3-level inline — KPI Area & Problem Statement EXPANDABLE
//   ke level-3 (Strategy / Initiative) untuk turunkan tap-count Goal→Strategy dari 3 → 1.
// Perpindahan pane dilakukan via Hub (Kembali di AppHeader → Masuk ruang lain) — TIDAK ada
// TabBar internal di pane agar tidak duplikasi navigasi hub-card lobby.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Alert, FlatList } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonList,
  TreeProgressOrb,
} from '@/components/ui';
import { PeriodSwitcher } from '@/components/period-switcher';
import {
  useCardProgress,
  useDevelopmentAreas,
  useGoals,
  useInitiativeActionPlans,
  useKpiAreas,
  useProblemStatements,
  useProblemStatementInitiatives,
  useStrategies,
  useStrategyInitiatives,
} from '@/hooks/use-workspace';
import { actionPlanTreeProgress, treeOrbLabel } from '@/lib/progress';
import { useProfile } from '@/hooks/use-profile';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useArchiveActions } from '@/hooks/use-governance-admin';
import { mbrBreakdownGuardMessage } from '@/lib/activation-check';
import type { MbrCompliance } from '@/lib/settings-mbr';
import type { CardEntityType } from '@/lib/governance-admin';
import { alertFriendlyError } from '@/lib/errors';
import type { RowAction } from '@/components/row-actions-menu';
import { PLANNING_STATUS_LABEL, STATUS_TONE, kpiCountOf, type GoalWithKpiCount } from '@/lib/goals';
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  type ActionPlanWithPeople,
  type Initiative,
} from '@/lib/cards';
import type { KpiArea } from '@/lib/kpi-areas';
import type { Strategy } from '@/lib/strategies';
import type { ProblemStatement } from '@/lib/problem-statements';
import {
  problemCountOf,
  type DevelopmentAreaWithProblemCount,
} from '@/lib/development-areas';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { useThemePreference } from '@/providers/theme-provider';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { WorkspaceHubCard } from '@/components/workspace-hub-card';
import { TREE_LEVEL_INDENT, WORKSPACE_KIND_BORDER, WorkspaceKindPill } from '@/components/workspace-kind-pill';
import {
  derivePerformanceHubStats,
  deriveDevelopmentHubStats,
} from '@/lib/workspace-hub-stats';
import { WS_COPY, WS_DEV_COPY, WS_HELP_COPY, WS_HUB_COPY } from '@/lib/workspace-copy';

// Tree merender status dari beberapa jenis kartu: planning (goal/kpi/strategy/dev-area/PS),
// initiative, dan action plan (execution). PLANNING_STATUS_LABEL saja bocorkan enum mentah
// (mis. `in_progress`) untuk Action Plan → gabung ketiga map (nilai konsisten, tanpa konflik).
const TREE_STATUS_LABEL: Record<string, string> = {
  ...PLANNING_STATUS_LABEL,
  ...INITIATIVE_STATUS_LABEL,
  ...ACTION_PLAN_STATUS_LABEL,
};

function StatusBadge({ status }: { status: string }) {
  return <Badge label={TREE_STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status]} />;
}

/**
 * Connector L-shape antar level tree (spec §8). Overlay dekoratif non-interaktif yang
 * menghubungkan sisi kiri card induk turun ke card anak. Geometri terkunci spec:
 * absolute, left/top -10, 10×32, border-left+bottom 2px `#cfd8e5`, radius bottom-left 8.
 * Dirender di dalam card anak (yang punya marginLeft indent) sehingga garis jatuh di gutter.
 */
function TreeConnector() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -16,
        top: -10,
        width: 16,
        height: 32,
        borderLeftWidth: 2,
        borderBottomWidth: 2,
        borderColor: '#cfd8e5',
        borderBottomLeftRadius: 8,
      }}
    />
  );
}

/**
 * Kolom kanan card tree (spec §6.4–6.8 / §10, WSA-15): progress orb 50px + label bawah
 * (`treeOrbLabel(kind)` → 'Capaian' Goal/KPI, 'Progress' lainnya). `value` null → '—'
 * (belum ter-fetch / error / RLS tak terlihat / AP repeat tanpa compliance) — no misleading
 * numbers, parity hub card; BUKAN 0%. Induk tanpa anak dikembalikan RPC sebagai 0 → orb '0%'.
 */
function TreeOrbCell({ kind, value }: { kind: string; value: number | null }) {
  if (value == null) {
    return (
      <View style={{ width: 50 }} className="items-center justify-center py-1">
        <Text className="text-base font-bold text-neutral-400 dark:text-neutral-500" accessibilityLabel={`${treeOrbLabel(kind)} belum tersedia`}>
          —
        </Text>
      </View>
    );
  }
  return <TreeProgressOrb value={value} label={treeOrbLabel(kind)} />;
}

function PastPeriodBadge() {
  return <Badge label="Periode lewat" tone="neutral" />;
}


/**
 * Badan card (pill + judul + orb): tap → langsung membuka Detail (menggantikan tombol Detail terpisah).
 * Tap-target = Pressable overlay absolut DI ATAS baris konten.
 */
function TreeCardBody({ cardLabel, onPress, children }: { cardLabel: string; onPress: () => void; children: ReactNode }) {
  return (
    <View style={{ position: 'relative' }}>
      <View className="flex-row items-start gap-3">{children}</View>
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        accessibilityRole="button"
        accessibilityLabel={`Buka detail ${cardLabel}`}
        onPress={onPress}
      />
    </View>
  );
}

/**
 * UI-S-W08 — dim "periode lewat" single-layer: hanya node past TERATAS yang di-dim.
 * Tanpa ini opacity-50 bertumpuk multiplikatif di tree bersarang (0.5³ = 0.125 di level-3)
 * dan merusak jaminan kontras AA (DESIGN §4). Inline style, bukan class NativeWind —
 * flatten deterministik di jest (pola SendButton, DESIGN §7).
 */
function PastDim({
  past,
  ancestorPast = false,
  children,
}: {
  past: boolean;
  ancestorPast?: boolean;
  children: ReactNode;
}) {
  return <View>{children}</View>;
}

/**
 * Baris aksi tree-card (PRD V1.8.2 §7.3): [Lihat/Tutup ▾] [Detail] [⋯] [+ tambah?].
 * Tap di luar tombol TIDAK membuka detail. `+` dikunci popup bila past period (§7.7).
 *
 * `onAdd` & `addLabel` opsional — child terdalam (mis. KPI Area di expand Goal) tak punya "+".
 */
function CardActionRow({
  cardLabel,
  expanded,
  onToggleExpand,
  expandLabel,
  collapseLabel,
  onMore,
  past,
  onAdd,
  onAddPress,
  addDimmed,
  addLabel,
  addButtonLabel,
}: {
  cardLabel: string;
  expanded: boolean;
  onToggleExpand: () => void;
  expandLabel: string;
  collapseLabel: string;
  onMore: () => void;
  past: boolean;
  onAdd?: () => void;
  /** Override penuh handler tekan "+" (caller urus past + guard MBR). Menang atas `onAdd`. */
  onAddPress?: () => void;
  /** Redup visual "+" (past ATAU ter-guard MBR). */
  addDimmed?: boolean;
  addLabel?: string;
  /** WSA-17 — teks TERLIHAT tombol tambah, mis. "+ KPI Area" (spec §11). */
  addButtonLabel?: string;
}) {
  // Spec §11 (amandemen a11y — DESIGN §4 mengikat menang atas lock; lihat lock §3/§11):
  // ⋯ 34×30 r999 surface-soft; + blue-soft teks #145ebc. hitSlop menjaga touch target ≥44px
  // meski tinggi visual 30px (DESIGN §4). Surface/border netral theme-aware: warna terang
  // terkunci HANYA berlaku di light mode; di dark mode ikut gelap (preseden workspace-hub-card).
  const isDark = useThemePreference().effective === 'dark';
  const hit = { top: 8, bottom: 8, left: 6, right: 6 };
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        className="min-h-[44px] flex-1 flex-row items-center gap-1 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={expanded ? collapseLabel : expandLabel}
        accessibilityState={{ expanded }}
        onPress={onToggleExpand}>
        <Text className="text-sm font-semibold text-brand-dark dark:text-brand">
          {expanded ? collapseLabel : expandLabel}
        </Text>
        <Text className="text-sm text-brand-dark dark:text-brand">{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      <Pressable
        hitSlop={hit}
        style={{ width: 34, height: 30, borderRadius: 999, backgroundColor: isDark ? '#171717' : '#f8fafc', borderWidth: 1, borderColor: isDark ? '#404040' : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
        accessibilityRole="button"
        accessibilityLabel={`Aksi lain ${cardLabel}`}
        onPress={onMore}>
        <Text style={{ color: isDark ? '#ffffff' : '#0f172a', fontSize: 14, fontWeight: '900' }}>⋯</Text>
      </Pressable>
      {onAdd || onAddPress ? (
        <Pressable
          hitSlop={hit}
          style={{
            height: 30,
            borderRadius: 999,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: (addDimmed ?? past)
              ? (isDark ? '#404040' : '#e2e8f0')
              : (isDark ? '#1e3a8a' : '#cce2ff'),
            backgroundColor: (addDimmed ?? past)
              ? (isDark ? '#262626' : '#f1f5f9')
              : (isDark ? '#172554' : '#eef6ff'),
          }}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? 'Tambah turunan'}
          accessibilityState={{ disabled: addDimmed ?? past }}
          onPress={() =>
            onAddPress ? onAddPress() : past ? showPastPeriodAlert(cardLabel) : onAdd?.()
          }>
          <Text style={{ color: (addDimmed ?? past) ? (isDark ? '#6b7280' : '#94a3b8') : (isDark ? '#93c5fd' : '#145ebc'), fontSize: 12, fontWeight: '900' }}>
            {addButtonLabel ?? '+'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// WSA-14 — path detail per jenis card (Ubah membuka detail page tempat edit/aktivasi).
const ENTITY_ROUTE_SEGMENT: Record<CardEntityType, string> = {
  goal: 'goal',
  kpi_area: 'kpi-area',
  strategy: 'strategy',
  initiative: 'initiative',
  action_plan: 'action-plan',
  development_area: 'development-area',
  problem_statement: 'problem-statement',
};

/**
 * WSA-14 — aksi sekunder card tree yang FUNGSIONAL (spec §12.2): `Ubah` → detail page,
 * `Arsipkan` → konfirmasi lalu `archiveCard` (server penegak izin; error disanitasi).
 * Menggantikan placeholder Alert "belum tersedia".
 */
function useTreeRowActions(
  entityType: CardEntityType,
  entityId: string,
  cardLabel: string,
): RowAction[] {
  const router = useRouter();
  const { archive } = useArchiveActions();
  return useMemo<RowAction[]>(
    () => [
      {
        label: 'Ubah',
        onPress: () =>
          router.push(`/${ENTITY_ROUTE_SEGMENT[entityType]}/${entityId}` as Href),
      },
      {
        label: 'Arsipkan',
        destructive: true,
        onPress: () =>
          Alert.alert(
            'Arsipkan card?',
            `Arsipkan "${cardLabel}"? Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.`,
            [
              { text: 'Batal', style: 'cancel' },
              {
                text: 'Arsipkan',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await archive({ entityType, entityId });
                  } catch (e) {
                    alertFriendlyError('Gagal mengarsipkan', e, 'Card belum bisa diarsipkan. Coba lagi.');
                  }
                },
              },
            ],
          ),
      },
    ],
    [router, archive, entityType, entityId, cardLabel],
  );
}

/**
 * Sub-row level 3: Strategy di bawah satu KPI Area. WSA-01: expandable → Initiative (level 4).
 * "+ Initiative" gated `create_initiative`, past-period lock, guard MBR kpi_area→strategy.
 */
function StrategySubRow({
  strategy,
  ancestorPast = false,
  parentCompliance,
  progress,
}: {
  strategy: Strategy;
  ancestorPast?: boolean;
  /** Kepatuhan MBR kpi_area→strategy (parent). Non-compliant → "+ Initiative" ter-guard (WSA-04). */
  parentCompliance?: MbrCompliance;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { initiatives, isLoading, isError, refetch } = useStrategyInitiatives(strategy.id, expanded);
  const { progressOf: initProgressOf } = useCardProgress(expanded ? initiatives.map((i) => i.id) : []);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(strategy, focus) === 'past';
  const canAddInit = can('create_initiative');
  const rowActions = useTreeRowActions('strategy', strategy.id, strategy.name);
  // WSA-04 — guard MBR: fail-open saat data belum ada (undefined); guard hanya saat tahu non-compliant.
  const mbrGuarded = !!parentCompliance && !parentCompliance.is_compliant;
  const onAddInitiative = () => {
    if (mbrGuarded && parentCompliance) {
      const { title, message } = mbrBreakdownGuardMessage('KPI Area', parentCompliance, 'Initiative');
      Alert.alert(title, message);
      return;
    }
    if (past) {
      showPastPeriodAlert(strategy.name);
      return;
    }
    router.push(`/initiative/new?strategyId=${strategy.id}` as Href);
  };
  // Tombol redup bila past ATAU ter-guard MBR (spec §11: tetap terlihat, tapi redup).
  const addDimmed = past || mbrGuarded;

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      {/* Spec §6.6 + §8: level-3 (indent 20px), border kiri 5px warna Strategy (#6941c6). */}
      <View
        className="gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.strategy, marginLeft: TREE_LEVEL_INDENT[3] }}>
        <TreeConnector />
        <TreeCardBody cardLabel={strategy.name} onPress={() => router.push(`/strategy/${strategy.id}` as Href)}>
          <View className="flex-1 gap-2">
            <View
              className="flex-row items-center justify-between gap-2"
              style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <WorkspaceKindPill kind="strategy" />
              <View className="flex-row items-center gap-1">
                {past ? <PastPeriodBadge /> : null}
                <StatusBadge status={strategy.status} />
              </View>
            </View>
            <Text
              className="text-sm font-medium text-black dark:text-white"
              numberOfLines={2}
              accessibilityLabel={`Strategy ${strategy.name}`}>
              {strategy.name}
            </Text>
          </View>
          <TreeOrbCell kind="strategy" value={progress} />
        </TreeCardBody>
        <CardActionRow
          cardLabel={strategy.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Initiative"
          collapseLabel="Tutup"
          onMore={() => setMenuOpen(true)}
          past={past}
          onAddPress={canAddInit ? onAddInitiative : undefined}
          addDimmed={addDimmed}
          addLabel={`Tambah Initiative ke ${strategy.name}`}
          addButtonLabel="+ Initiative"
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : initiatives.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Initiative. Tambah Initiative untuk eksekusi Strategy ini.
            </Text>
          ) : (
            <View className="gap-2">
              {initiatives.map((i) => (
                <InitiativeSubRow
                  key={i.id}
                  item={i}
                  ancestorPast={ancestorPast || past}
                  progress={initProgressOf(i.id)}
                />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={strategy.name}
        items={rowActions}
      />
    </PastDim>
  );
}

/**
 * Sub-row level 2: KPI Area di bawah satu Goal. Expandable → Strategy children.
 * Lazy fetch Strategy hanya saat `expanded` (parameter `enabled` di useStrategies).
 */
function KpiAreaSubRow({
  kpi,
  ancestorPast = false,
  progress,
}: {
  kpi: KpiArea;
  ancestorPast?: boolean;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { strategies, isLoading, isError, refetch } = useStrategies(kpi.id, expanded);
  const { progressOf: stratProgressOf } = useCardProgress(expanded ? strategies.map((s) => s.id) : []);
  // WSA-04 — guard MBR: fetch kepatuhan kpi_area→strategy hanya saat expanded (parentType ''
  // menonaktifkan query di useMbrCompliance). Diteruskan ke StrategySubRow untuk guard "+ Initiative".
  const { compliance: mbrCompliance } = useMbrCompliance(expanded ? 'kpi_area' : '', kpi.id);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(kpi, focus) === 'past';
  const canAddStrategy = can('create_strategy'); // WSA-13 — key presisi (bukan proxy create_kpi_area)
  const rowActions = useTreeRowActions('kpi_area', kpi.id, kpi.name);

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      {/* Spec §6.5 + §8: level-2 (indent 16px), border kiri 5px warna KPI Area (#b76b00). */}
      <View
        className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.kpi_area, marginLeft: TREE_LEVEL_INDENT[2] }}>
        <TreeConnector />
        <TreeCardBody cardLabel={kpi.name} onPress={() => router.push(`/kpi-area/${kpi.id}` as Href)}>
          <View className="flex-1 gap-2">
            <View
              className="flex-row items-center justify-between gap-2"
              style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <WorkspaceKindPill kind="kpi_area" />
              <View className="flex-row items-center gap-1.5">
                {past ? <PastPeriodBadge /> : null}
                <StatusBadge status={kpi.status} />
              </View>
            </View>
            <Text className="text-sm font-medium text-black dark:text-white" numberOfLines={2}>
              {kpi.name}
            </Text>
          </View>
          <TreeOrbCell kind="kpi_area" value={progress} />
        </TreeCardBody>
        <CardActionRow
          cardLabel={kpi.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Strategy"
          collapseLabel="Tutup"
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={
            canAddStrategy
              ? () => router.push(`/strategy/new?kpiAreaId=${kpi.id}` as Href)
              : undefined
          }
          addLabel={`Tambah Strategy ke ${kpi.name}`}
          addButtonLabel="+ Strategy"
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : strategies.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Strategy. Tambah Strategy untuk pecah KPI Area ini.
            </Text>
          ) : (
            <View className="gap-2">
              {strategies.map((s) => (
                <StrategySubRow
                  key={s.id}
                  strategy={s}
                  ancestorPast={ancestorPast || past}
                  parentCompliance={mbrCompliance}
                  progress={stratProgressOf(s.id)}
                />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={kpi.name}
        items={rowActions}
      />
    </PastDim>
  );
}

function GoalRow({ goal, progress }: { goal: GoalWithKpiCount; progress: number | null }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // UI-S-W07: destrukturisasi state fetch penuh — expand tanpa skeleton/empty/error
  // terasa seperti tombol mati (paritas dgn KpiAreaSubRow level-2).
  const { kpiAreas, isLoading, isError, refetch } = useKpiAreas(goal.id, expanded);
  const { focus } = usePeriodFocus();
  // WSA-15 — orb capaian anak (KPI Area) di level kontainer (1 RPC per Goal expanded, bukan per row).
  const { progressOf: kpiProgressOf } = useCardProgress(expanded ? kpiAreas.map((k) => k.id) : []);

  const count = kpiCountOf(goal);
  const countLabel = count == null ? WS_COPY.kpiCountUnknown : WS_COPY.kpiCount(count);
  const past = cardPeriodStatus(goal, focus) === 'past';
  const canAddKpi = can('create_kpi_area');
  const rowActions = useTreeRowActions('goal', goal.id, goal.name);

  return (
    <PastDim past={past}>
      {/* Spec §6.4 + §8: level-0 (indent 0), border kiri 5px warna kategori Goal. */}
      <View style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.goal, borderRadius: 16, marginLeft: TREE_LEVEL_INDENT[0] }}>
      <SectionCard>
        <TreeCardBody cardLabel={goal.name} onPress={() => router.push(`/goal/${goal.id}` as Href)}>
          <View className="flex-1 gap-2">
            <View
              className="flex-row items-center justify-between gap-2"
              style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <WorkspaceKindPill kind="goal" />
              <View className="flex-row items-center gap-1.5">
                {past ? <PastPeriodBadge /> : null}
                <StatusBadge status={goal.status} />
              </View>
            </View>
            <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={2}>{goal.name}</Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>
          </View>
          <TreeOrbCell kind="goal" value={progress} />
        </TreeCardBody>

        <CardActionRow
          cardLabel={goal.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat KPI Area"
          collapseLabel="Tutup"
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={canAddKpi ? () => router.push(`/kpi-area/new?goalId=${goal.id}` as Href) : undefined}
          addLabel={`Tambah KPI Area ke ${goal.name}`}
          addButtonLabel="+ KPI Area"
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : kpiAreas.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada KPI Area. Tambah KPI Area untuk pecah Goal ini.
            </Text>
          ) : (
            <View className="gap-2">
              {kpiAreas.map((k) => (
                <KpiAreaSubRow key={k.id} kpi={k} ancestorPast={past} progress={kpiProgressOf(k.id)} />
              ))}
            </View>
          )
        ) : null}
      </SectionCard>
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={goal.name}
        items={rowActions}
      />
    </PastDim>
  );
}

/**
 * Sub-row Action Plan — level TERBAWAH (spec §6.8/§7.5): tanpa panah, tanpa tombol tambah.
 * Hanya Detail + ⋯. `level` menentukan indent (5 di Performance, 4 di Development).
 */
function ActionPlanSubRow({
  item,
  ancestorPast = false,
  level,
}: {
  item: ActionPlanWithPeople;
  ancestorPast?: boolean;
  level: 4 | 5;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(item, focus) === 'past';
  const isDark = useThemePreference().effective === 'dark';
  const rowActions = useTreeRowActions('action_plan', item.id, item.name);
  // WSA-15 — orb AP leaf dihitung KLIEN (bukan RPC): status-based (one_time) via progress.ts.
  // Repeat AP butuh Repeat Compliance yg tak ter-fetch di baris ini → null → '—' (bukan 0% palsu).
  const orbValue = actionPlanTreeProgress({ status: item.status, repeatSetting: item.repeat_setting });

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      <View
        className="gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.action_plan, marginLeft: TREE_LEVEL_INDENT[level] }}>
        <TreeConnector />
        <TreeCardBody cardLabel={item.name} onPress={() => router.push(`/action-plan/${item.id}` as Href)}>
          <View className="flex-1 gap-2">
            <View
              className="flex-row items-center justify-between gap-2"
              style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <WorkspaceKindPill kind="action_plan" />
              <View className="flex-row items-center gap-1">
                {past ? <PastPeriodBadge /> : null}
                <StatusBadge status={item.status} />
              </View>
            </View>
            <Text
              className="text-sm font-medium text-black dark:text-white"
              numberOfLines={2}
              accessibilityLabel={`Action Plan ${item.name}`}>
              {item.name}
            </Text>
          </View>
          <TreeOrbCell kind="action_plan" value={orbValue} />
        </TreeCardBody>
        {/* Action Plan = leaf: tanpa panah/+ (spec §6.8). Hanya ⋯. */}
        <View className="flex-row items-center justify-end gap-2">
          <Pressable
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={{ width: 34, height: 30, borderRadius: 999, backgroundColor: isDark ? '#171717' : '#f8fafc', borderWidth: 1, borderColor: isDark ? '#404040' : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${item.name}`}
            onPress={() => setMenuOpen(true)}>
            <Text style={{ color: isDark ? '#ffffff' : '#0f172a', fontSize: 14, fontWeight: '900' }}>⋯</Text>
          </Pressable>
        </View>
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={item.name}
        items={rowActions}
      />
    </PastDim>
  );
}

/**
 * Sub-row Initiative. WSA-01: expandable → Action Plan (level terbawah). Dipakai di Performance
 * (di bawah Strategy, level 4) dan Development (di bawah Problem Statement, level 3).
 * "+ Plan" gated `create_action_plan`, past-period lock.
 */
function InitiativeSubRow({
  item,
  ancestorPast = false,
  level = 4,
  progress,
}: {
  item: Initiative;
  ancestorPast?: boolean;
  /** Level tree Initiative: 4 di Performance (bawah Strategy), 3 di Development (bawah PS). */
  level?: 3 | 4;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { actionPlans, isLoading, isError, refetch } = useInitiativeActionPlans(item.id, expanded);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(item, focus) === 'past';
  const canAddPlan = can('create_action_plan');
  const rowActions = useTreeRowActions('initiative', item.id, item.name);
  const childLevel = (level + 1) as 4 | 5;

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      {/* Spec §6.7/§7.5 + §8: border kiri 5px warna Initiative (#14845c). */}
      <View
        className="gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.initiative, marginLeft: TREE_LEVEL_INDENT[level] }}>
        <TreeConnector />
        <TreeCardBody cardLabel={item.name} onPress={() => router.push(`/initiative/${item.id}` as Href)}>
          <View className="flex-1 gap-2">
            <View
              className="flex-row items-center justify-between gap-2"
              style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <WorkspaceKindPill kind="initiative" />
              <View className="flex-row items-center gap-1">
                {past ? <PastPeriodBadge /> : null}
                <StatusBadge status={item.status} />
              </View>
            </View>
            <Text
              className="text-sm font-medium text-black dark:text-white"
              numberOfLines={2}
              accessibilityLabel={`Initiative ${item.name}`}>
              {item.name}
            </Text>
          </View>
          <TreeOrbCell kind="initiative" value={progress} />
        </TreeCardBody>
        <CardActionRow
          cardLabel={item.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Action Plan"
          collapseLabel="Tutup"
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={
            canAddPlan
              ? () => router.push(`/action-plan/new?initiativeId=${item.id}` as Href)
              : undefined
          }
          addLabel={`Tambah Action Plan ke ${item.name}`}
          addButtonLabel="+ Plan"
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : actionPlans.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Action Plan. Tambah Action Plan untuk eksekusi Initiative ini.
            </Text>
          ) : (
            <View className="gap-2">
              {actionPlans.map((ap) => (
                <ActionPlanSubRow key={ap.id} item={ap} ancestorPast={ancestorPast || past} level={childLevel} />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={item.name}
        items={rowActions}
      />
    </PastDim>
  );
}

/**
 * Sub-row level 2: Problem Statement di bawah satu Development Area. Expandable → Initiative.
 * Symmetric dgn KpiAreaSubRow di Performance pane.
 */
function ProblemStatementSubRow({
  ps,
  ancestorPast = false,
  progress,
}: {
  ps: ProblemStatement;
  ancestorPast?: boolean;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { initiatives, isLoading, isError, refetch } = useProblemStatementInitiatives(ps.id, expanded);
  const { progressOf: initProgressOf } = useCardProgress(expanded ? initiatives.map((i) => i.id) : []);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(ps, focus) === 'past';
  const canAddInit = can('create_initiative');
  const rowActions = useTreeRowActions('problem_statement', ps.id, ps.name);

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      {/* Spec §7.4 + §8: level-2 Dev pane, border kiri 5px warna Problem Statement (#c2410c). */}
      <View
        className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.problem_statement, marginLeft: TREE_LEVEL_INDENT[2] }}>
        <TreeConnector />
        <TreeCardBody cardLabel={ps.name} onPress={() => router.push(`/problem-statement/${ps.id}` as Href)}>
          <View className="flex-1 gap-2">
            <View
              className="flex-row items-center justify-between gap-2"
              style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <WorkspaceKindPill kind="problem_statement" />
              <View className="flex-row items-center gap-1.5">
                {past ? <PastPeriodBadge /> : null}
                <StatusBadge status={ps.status} />
              </View>
            </View>
            <Text className="text-sm font-medium text-black dark:text-white" numberOfLines={2}>{ps.name}</Text>
          </View>
          <TreeOrbCell kind="problem_statement" value={progress} />
        </TreeCardBody>
        <CardActionRow
          cardLabel={ps.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Initiative"
          collapseLabel="Tutup"
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={
            canAddInit
              ? () => router.push(`/initiative/new?problemStatementId=${ps.id}` as Href)
              : undefined
          }
          addLabel={`Tambah Initiative ke ${ps.name}`}
          addButtonLabel="+ Initiative"
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : initiatives.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Initiative. Tambah Initiative untuk eksekusi Problem Statement ini.
            </Text>
          ) : (
            <View className="gap-2">
              {initiatives.map((i) => (
                <InitiativeSubRow
                  key={i.id}
                  item={i}
                  ancestorPast={ancestorPast || past}
                  level={3}
                  progress={initProgressOf(i.id)}
                />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={ps.name}
        items={rowActions}
      />
    </PastDim>
  );
}

function DevelopmentAreaRow({
  devArea,
  progress,
}: {
  devArea: DevelopmentAreaWithProblemCount;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // UI-S-W07: paritas state fetch dgn GoalRow/ProblemStatementSubRow.
  const { problemStatements, isLoading, isError, refetch } = useProblemStatements(
    devArea.id,
    expanded,
  );
  const { focus } = usePeriodFocus();
  const { progressOf: psProgressOf } = useCardProgress(expanded ? problemStatements.map((p) => p.id) : []);

  const count = problemCountOf(devArea);
  const countLabel =
    count == null ? WS_DEV_COPY.problemCountUnknown : WS_DEV_COPY.problemCount(count);
  const past = cardPeriodStatus(devArea, focus) === 'past';
  const canAddProblem = can('create_problem_statement'); // WSA-13 — key presisi (bukan proxy create_development_area)
  const rowActions = useTreeRowActions('development_area', devArea.id, devArea.name);

  return (
    <PastDim past={past}>
      {/* Spec §7.3 + §8: level-0 Dev pane, border kiri 5px warna Development Area (#0f766e). */}
      <View style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.development_area, borderRadius: 16, marginLeft: TREE_LEVEL_INDENT[0] }}>
      <SectionCard>
        <TreeCardBody cardLabel={devArea.name} onPress={() => router.push(`/development-area/${devArea.id}` as Href)}>
          <View className="flex-1 gap-2">
            <View
              className="flex-row items-center justify-between gap-2"
              style={{ flexWrap: 'wrap', rowGap: 4 }}>
              <WorkspaceKindPill kind="development_area" />
              <View className="flex-row items-center gap-1.5">
                {past ? <PastPeriodBadge /> : null}
                <StatusBadge status={devArea.status} />
              </View>
            </View>
            <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={2}>
              {devArea.name}
            </Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>
          </View>
          <TreeOrbCell kind="development_area" value={progress} />
        </TreeCardBody>

        <CardActionRow
          cardLabel={devArea.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Problem Statement"
          collapseLabel="Tutup"
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={
            canAddProblem
              ? () => router.push(`/problem-statement/new?developmentAreaId=${devArea.id}` as Href)
              : undefined
          }
          addLabel={`Tambah Problem Statement ke ${devArea.name}`}
          addButtonLabel="+ Problem Statement"
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : problemStatements.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Problem Statement. Tambah Problem Statement untuk pecah Development Area
              ini.
            </Text>
          ) : (
            <View className="gap-2">
              {problemStatements.map((p) => (
                <ProblemStatementSubRow key={p.id} ps={p} ancestorPast={past} progress={psProgressOf(p.id)} />
              ))}
            </View>
          )
        ) : null}
      </SectionCard>
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={devArea.name}
        items={rowActions}
      />
    </PastDim>
  );
}

function PaneSectionHeader({
  title,
  primaryLabel,
  onPrimary,
}: {
  title: string;
  /** Tombol primary di kanan section header (mis. "+ Goal" / "+ Development Area"). */
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  // Pola "section header + section action" — konsisten dengan section lain di app. Brand-dark
  // fill, radius 12, tinggi 32 (compact — kartu pertama juga punya tombol sendiri, jadi bukan
  // satu-satunya cara).
  return (
    <View className="flex-row items-center justify-between">
      <Text
        accessibilityRole="header"
        className="text-xl font-bold text-black dark:text-white">
        {title}
      </Text>
      {primaryLabel && onPrimary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          onPress={onPrimary}
          style={{ height: 32, borderRadius: 12, backgroundColor: '#1564b3', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
          className="active:opacity-70">
          <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '900' }}>{primaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * UI-N-002 Stage 2 — HubView (lobby). 2 hub-card derive stats dari `useGoals`/`useDevelopmentAreas`
 * (zero query baru). Tap hub → masuk pane dgn back button.
 */
function HubView({ onSelect }: { onSelect: (t: 'performance' | 'development') => void }) {
  const router = useRouter();
  const goalsQ = useGoals();
  const devQ = useDevelopmentAreas();

  useFocusEffect(
    useCallback(() => {
      goalsQ.refetch();
      devQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const perfStats = derivePerformanceHubStats(goalsQ.goals);
  const devStats = deriveDevelopmentHubStats(devQ.developmentAreas);
  const loading = goalsQ.isLoading || devQ.isLoading;

  return (
    // ScrollView (bukan View) — hub harus selamat saat Dynamic Type besar / layar pendek (DESIGN §4.5).
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-5 p-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">{WS_HUB_COPY.title}</Text>
          <Text className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            {WS_HUB_COPY.sectionCount}
          </Text>
        </View>
        {/* WSA-06 — search launcher overview (spec §4.1). Tap → route /search global. */}
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Cari Workspace"
          onPress={() => router.push('/search' as Href)}
          className="min-h-[44px] flex-row items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-950">
          <Text className="text-base text-neutral-400 dark:text-neutral-500">⌕</Text>
          <Text className="text-sm text-neutral-400 dark:text-neutral-500">
            Cari Goal, KPI Area, Initiative, Action Plan
          </Text>
        </Pressable>
        {loading ? (
          <SkeletonList count={2} />
        ) : (
          <View className="gap-3">
            <WorkspaceHubCard
              kicker={WS_HUB_COPY.perf.kicker}
              title={WS_HUB_COPY.perf.title}
              meta={WS_HUB_COPY.perf.meta}
              stats={perfStats}
              enterLabel={WS_HUB_COPY.perf.enter}
              enterAccessibilityLabel={WS_HUB_COPY.perf.enterA11y}
              parentStatLabel="Goal"
              childStatLabel="KPI Area"
              activeStatLabel="Notif"
              help={WS_HELP_COPY.performance}
              helpAccessibilityLabel="Bantuan Performance"
              space="performance"
              onEnter={() => onSelect('performance')}
            />
            <WorkspaceHubCard
              kicker={WS_HUB_COPY.dev.kicker}
              title={WS_HUB_COPY.dev.title}
              meta={WS_HUB_COPY.dev.meta}
              stats={devStats}
              enterLabel={WS_HUB_COPY.dev.enter}
              enterAccessibilityLabel={WS_HUB_COPY.dev.enterA11y}
              parentStatLabel="Area"
              childStatLabel="Problem Statement"
              activeStatLabel="Notif"
              help={WS_HELP_COPY.development}
              helpAccessibilityLabel="Bantuan Development"
              space="development"
              onEnter={() => onSelect('development')}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function PerformancePane() {
  const router = useRouter();
  const { can } = useProfile();
  const goalsQ = useGoals();
  const canCreate = can('create_goal');

  useFocusEffect(
    useCallback(() => {
      goalsQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = (
    <View className="gap-5 pb-3">
      <View className="gap-1">
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold text-black dark:text-white">
          {WS_HUB_COPY.perf.kicker}
        </Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          {WS_COPY.subtitle}
        </Text>
      </View>
      <PeriodSwitcher />
      <PaneSectionHeader
        title={WS_COPY.sectionStrategis}
        primaryLabel={canCreate ? WS_COPY.btnGoalBaru : undefined}
        onPrimary={canCreate ? () => router.push('/goal-wizard' as Href) : undefined}
      />
      {goalsQ.isLoading ? <SkeletonList count={3} /> : null}
      {goalsQ.isError ? <ErrorState onRetry={() => goalsQ.refetch()} /> : null}
    </View>
  );

  // WSA-16 — section "Initiative Tanpa Goal" dihapus dari pane (di luar spec §6). Initiative
  // yatim tetap dapat diakses lewat Search (route /search) & Menu; pane fokus ke hierarki Goal.

  const goalsData = goalsQ.isLoading || goalsQ.isError ? [] : goalsQ.goals;
  const showEmpty = !goalsQ.isLoading && !goalsQ.isError && goalsQ.goals.length === 0;

  // WSA-15 — orb capaian Goal root: 1 RPC untuk semua Goal terlihat (bukan per row).
  const { progressOf: goalProgressOf } = useCardProgress(goalsData.map((g) => g.id));
  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <ScrollView contentContainerStyle={{ gap: 12, padding: 20 }}>
        {header}
        {showEmpty ? (
          <EmptyState
            title={WS_COPY.emptyGoalTitle}
            description={canCreate ? WS_COPY.emptyGoalDescCan : WS_COPY.emptyGoalDescView}
            action={
              canCreate
                ? { label: WS_COPY.btnGoalBaru, onPress: () => router.push('/goal-wizard' as Href) }
                : undefined
            }
          />
        ) : null}
        {goalsData.map((goal) => (
          <GoalRow key={goal.id} goal={goal} progress={goalProgressOf(goal.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

function DevelopmentPane() {
  const router = useRouter();
  const { can } = useProfile();
  const devQ = useDevelopmentAreas();
  const canCreate = can('create_development_area');

  useFocusEffect(
    useCallback(() => {
      devQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = (
    <View className="gap-5 pb-3">
      <View className="gap-1">
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold text-black dark:text-white">
          {WS_HUB_COPY.dev.kicker}
        </Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          {WS_DEV_COPY.subtitle}
        </Text>
      </View>
      <PeriodSwitcher space="development" />
      <PaneSectionHeader
        title={WS_DEV_COPY.sectionDevAreas}
        primaryLabel={canCreate ? WS_DEV_COPY.btnDevAreaBaru : undefined}
        onPrimary={canCreate ? () => router.push('/development-area/new' as Href) : undefined}
      />
      {devQ.isLoading ? <SkeletonList count={3} /> : null}
      {devQ.isError ? <ErrorState onRetry={() => devQ.refetch()} /> : null}
    </View>
  );

  const devData = devQ.isLoading || devQ.isError ? [] : devQ.developmentAreas;
  const showEmpty = !devQ.isLoading && !devQ.isError && devQ.developmentAreas.length === 0;

  // WSA-15 — orb capaian Development Area root: 1 RPC untuk semua DA terlihat.
  const { progressOf: devProgressOf } = useCardProgress(devData.map((d) => d.id));
  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <ScrollView contentContainerStyle={{ gap: 12, padding: 20 }}>
        {header}
        {showEmpty ? (
          <EmptyState
            title={WS_DEV_COPY.emptyDevAreaTitle}
            description={
              canCreate ? WS_DEV_COPY.emptyDevAreaDescCan : WS_DEV_COPY.emptyDevAreaDescView
            }
            action={
              canCreate
                ? {
                    label: WS_DEV_COPY.btnDevAreaBaru,
                    onPress: () => router.push('/development-area/new' as Href),
                  }
                : undefined
            }
          />
        ) : null}
        {devData.map((d) => (
          <DevelopmentAreaRow key={d.id} devArea={d} progress={devProgressOf(d.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

// WSA-19 — pane Workspace kini route deep-linkable di dalam nested stack tab (bukan state lokal).
// "Masuk" MENAVIGASI ke `/workspace/performance` · `/workspace/development`; tab bar tetap terlihat
// (pane hidup di bawah tab Workspace) dan back di AppHeader kembali ke hub (replace fallback untuk
// deep-link tanpa history).

/** Route index `/workspace` — Hub (lobby). Tap "Masuk" → push pane deep-linkable. */
export function HubScreen() {
  const router = useRouter();
  return <HubView onSelect={(t) => router.push(`/workspace/${t}` as Href)} />;
}

/** Route `/workspace/performance` — pane Performance. Back button di AppHeader. */
export function PerformanceScreen() {
  return <PerformancePane />;
}

/** Route `/workspace/development` — pane Development. Back button di AppHeader. */
export function DevelopmentScreen() {
  return <DevelopmentPane />;
}
