// Workspace (Fase 6) — dual-tab Performance/Development.
// Performance (Fase 4): Goal → KPI Area → Strategy → Initiative, + Initiative Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Initiative → Action Plan.
// UI-N-003 (Stage 1 B′): tree 3-level inline — KPI Area & Problem Statement EXPANDABLE
//   ke level-3 (Strategy / Initiative) untuk turunkan tap-count Goal→Strategy dari 3 → 1.
// Fetch independen per tab (DT-6: error satu tab tidak memblok tab lain). Tab Performance default.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, FlatList } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import PrototypeWorkspaceScreen from '@/prototype/screens/workspace';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonList,
  TabBar,
} from '@/components/ui';
import { PeriodSwitcher } from '@/components/period-switcher';
import {
  useDevelopmentAreas,
  useFlatInitiatives,
  useGoals,
  useKpiAreas,
  useProblemStatements,
  useProblemStatementInitiatives,
  useStrategies,
} from '@/hooks/use-workspace';
import { useProfile } from '@/hooks/use-profile';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { mbrBreakdownGuardMessage } from '@/lib/activation-check';
import type { MbrCompliance } from '@/lib/settings-mbr';
import { PLANNING_STATUS_LABEL, STATUS_TONE, kpiCountOf, type GoalWithKpiCount } from '@/lib/goals';
import { type Initiative } from '@/lib/cards';
import type { KpiArea } from '@/lib/kpi-areas';
import type { Strategy } from '@/lib/strategies';
import type { ProblemStatement } from '@/lib/problem-statements';
import {
  problemCountOf,
  type DevelopmentAreaWithProblemCount,
} from '@/lib/development-areas';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { WorkspaceHubCard } from '@/components/workspace-hub-card';
import { TREE_LEVEL_INDENT, WORKSPACE_KIND_BORDER, WorkspaceKindPill } from '@/components/workspace-kind-pill';
import {
  derivePerformanceHubStats,
  deriveDevelopmentHubStats,
} from '@/lib/workspace-hub-stats';
import { WS_COPY, WS_DEV_COPY, WS_HELP_COPY, WS_HUB_COPY, WS_TABS } from '@/lib/workspace-copy';

/**
 * Tab Workspace + state lobby. `'hub'` = HubView (2 hub-card pilih ruang); `'performance'`/
 * `'development'` = panel detail. UI-N-002 Stage 2: default = `'hub'` agar user lihat ringkasan
 * dulu sebelum dive in. Pane dapat tombol "← Workspace" untuk balik ke hub.
 */
type Tab = 'hub' | 'performance' | 'development';

function StatusBadge({ status }: { status: string }) {
  return <Badge label={PLANNING_STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status]} />;
}

function PastPeriodBadge() {
  return <Badge label="Periode lewat" tone="neutral" />;
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
  return <View style={past && !ancestorPast ? { opacity: 0.5 } : undefined}>{children}</View>;
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
  onDetail,
  detailLabel,
  onMore,
  past,
  onAdd,
  addLabel,
  addButtonLabel,
}: {
  cardLabel: string;
  expanded: boolean;
  onToggleExpand: () => void;
  expandLabel: string;
  collapseLabel: string;
  onDetail: () => void;
  detailLabel: string;
  onMore: () => void;
  past: boolean;
  onAdd?: () => void;
  addLabel?: string;
  /** WSA-17 — teks TERLIHAT tombol tambah, mis. "+ KPI Area" (spec §11). */
  addButtonLabel?: string;
}) {
  // Spec §11: Detail solid biru #1877f2 teks putih h30 r999; ⋯ 34×30 r999 bg #f8fafc;
  // + blue-soft #eef6ff border #cce2ff teks #145ebc. hitSlop menjaga touch target ≥44px
  // meski tinggi visual 30px (DESIGN §4).
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
        style={{ height: 30, borderRadius: 999, backgroundColor: '#1877f2', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
        accessibilityRole="button"
        accessibilityLabel={detailLabel}
        onPress={onDetail}>
        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '900' }}>Detail</Text>
      </Pressable>
      <Pressable
        hitSlop={hit}
        style={{ width: 34, height: 30, borderRadius: 999, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
        accessibilityRole="button"
        accessibilityLabel={`Aksi lain ${cardLabel}`}
        onPress={onMore}>
        <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '900' }}>⋯</Text>
      </Pressable>
      {onAdd ? (
        <Pressable
          hitSlop={hit}
          style={{
            height: 30,
            borderRadius: 999,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: past ? '#e2e8f0' : '#cce2ff',
            backgroundColor: past ? '#f1f5f9' : '#eef6ff',
          }}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? 'Tambah turunan'}
          accessibilityState={{ disabled: past }}
          onPress={() => (past ? showPastPeriodAlert(cardLabel) : onAdd())}>
          <Text style={{ color: past ? '#94a3b8' : '#145ebc', fontSize: 12, fontWeight: '900' }}>
            {addButtonLabel ?? '+'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Aksi sekunder default (Arsipkan/Ubah/Salin/Hapus draft) — saat ini placeholder V1: notify "Belum tersedia". */
function defaultRowActions(cardLabel: string): { label: string; onPress: () => void; disabled?: boolean }[] {
  const ph = (label: string) => () =>
    Alert.alert(label, `Aksi "${label}" untuk ${cardLabel} belum tersedia di V1.`);
  return [
    { label: 'Ubah', onPress: ph('Ubah') },
    { label: 'Arsipkan', onPress: ph('Arsipkan') },
    { label: 'Salin', onPress: ph('Salin') },
  ];
}

/**
 * Sub-row level 3: Strategy di bawah satu KPI Area. Per UI-N-003 (Stage 1 B′).
 * Tidak punya tree expand sendiri (Initiative tetap stack-nav via Strategy detail).
 * Punya RowActionsMenu + tombol "+ Initiative" (gated `create_initiative`, past-period lock).
 */
function StrategySubRow({
  strategy,
  ancestorPast = false,
  parentCompliance,
}: {
  strategy: Strategy;
  ancestorPast?: boolean;
  /** Kepatuhan MBR kpi_area→strategy (parent). Non-compliant → "+ Initiative" ter-guard (WSA-04). */
  parentCompliance?: MbrCompliance;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(strategy, focus) === 'past';
  const canAddInit = can('create_initiative');
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
        <WorkspaceKindPill kind="strategy" />
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 text-sm font-medium text-black dark:text-white"
            numberOfLines={2}
            accessibilityLabel={`Strategy ${strategy.name}`}>
            {strategy.name}
          </Text>
          <View className="flex-row items-center gap-1">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={strategy.status} />
          </View>
        </View>
        {/* Spec §11 pill geometry — pixel-identik dgn CardActionRow. */}
        <View className="flex-row items-center justify-end gap-2">
          <Pressable
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={{ height: 30, borderRadius: 999, backgroundColor: '#1877f2', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Buka detail ${strategy.name}`}
            onPress={() => router.push(`/strategy/${strategy.id}` as Href)}>
            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '900' }}>Detail</Text>
          </Pressable>
          <Pressable
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={{ width: 34, height: 30, borderRadius: 999, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${strategy.name}`}
            onPress={() => setMenuOpen(true)}>
            <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '900' }}>⋯</Text>
          </Pressable>
          {canAddInit ? (
            <Pressable
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={{
                height: 30,
                borderRadius: 999,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: addDimmed ? '#e2e8f0' : '#cce2ff',
                backgroundColor: addDimmed ? '#f1f5f9' : '#eef6ff',
              }}
              accessibilityRole="button"
              accessibilityLabel={`Tambah Initiative ke ${strategy.name}`}
              accessibilityState={{ disabled: addDimmed }}
              onPress={onAddInitiative}>
              <Text style={{ color: addDimmed ? '#94a3b8' : '#145ebc', fontSize: 12, fontWeight: '900' }}>
                + Initiative
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={strategy.name}
        items={defaultRowActions(strategy.name)}
      />
    </PastDim>
  );
}

/**
 * Sub-row level 2: KPI Area di bawah satu Goal. Expandable → Strategy children.
 * Lazy fetch Strategy hanya saat `expanded` (parameter `enabled` di useStrategies).
 */
function KpiAreaSubRow({ kpi, ancestorPast = false }: { kpi: KpiArea; ancestorPast?: boolean }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { strategies, isLoading, isError, refetch } = useStrategies(kpi.id, expanded);
  // WSA-04 — guard MBR: fetch kepatuhan kpi_area→strategy hanya saat expanded (parentType ''
  // menonaktifkan query di useMbrCompliance). Diteruskan ke StrategySubRow untuk guard "+ Initiative".
  const { compliance: mbrCompliance } = useMbrCompliance(expanded ? 'kpi_area' : '', kpi.id);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(kpi, focus) === 'past';
  const canAddStrategy = can('create_strategy'); // WSA-13 — key presisi (bukan proxy create_kpi_area)

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      {/* Spec §6.5 + §8: level-2 (indent 16px), border kiri 5px warna KPI Area (#b76b00). */}
      <View
        className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.kpi_area, marginLeft: TREE_LEVEL_INDENT[2] }}>
        <WorkspaceKindPill kind="kpi_area" />
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-sm font-medium text-black dark:text-white">
            {kpi.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={kpi.status} />
          </View>
        </View>
        <CardActionRow
          cardLabel={kpi.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Strategy"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/kpi-area/${kpi.id}` as Href)}
          detailLabel={`Buka detail ${kpi.name}`}
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
        items={defaultRowActions(kpi.name)}
      />
    </PastDim>
  );
}

function GoalRow({ goal }: { goal: GoalWithKpiCount }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // UI-S-W07: destrukturisasi state fetch penuh — expand tanpa skeleton/empty/error
  // terasa seperti tombol mati (paritas dgn KpiAreaSubRow level-2).
  const { kpiAreas, isLoading, isError, refetch } = useKpiAreas(goal.id, expanded);
  const { focus } = usePeriodFocus();

  const count = kpiCountOf(goal);
  const countLabel = count == null ? WS_COPY.kpiCountUnknown : WS_COPY.kpiCount(count);
  const past = cardPeriodStatus(goal, focus) === 'past';
  const canAddKpi = can('create_kpi_area');

  return (
    <PastDim past={past}>
      {/* Spec §6.4 + §8: level-0 (indent 0), border kiri 5px warna kategori Goal. */}
      <View style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.goal, borderRadius: 16, marginLeft: TREE_LEVEL_INDENT[0] }}>
      <SectionCard>
        <WorkspaceKindPill kind="goal" />
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-black dark:text-white">{goal.name}</Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={goal.status} />
          </View>
        </View>

        <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>

        <CardActionRow
          cardLabel={goal.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat KPI Area"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/goal/${goal.id}` as Href)}
          detailLabel={`Buka detail ${goal.name}`}
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
                <KpiAreaSubRow key={k.id} kpi={k} ancestorPast={past} />
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
        items={defaultRowActions(goal.name)}
      />
    </PastDim>
  );
}

/**
 * Sub-row level 3: Initiative di bawah satu Problem Statement (Development pane).
 * Action Plan tetap stack-nav via Initiative detail (4-level penuh ditunda — lihat ADR Stage 1).
 */
function InitiativeSubRow({
  item,
  ancestorPast = false,
}: {
  item: Initiative;
  ancestorPast?: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(item, focus) === 'past';

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      {/* Spec §6.7/§7.5 + §8: level-3 di Dev pane, border kiri 5px warna Initiative (#14845c). */}
      <View
        className="gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.initiative, marginLeft: TREE_LEVEL_INDENT[3] }}>
        <WorkspaceKindPill kind="initiative" />
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 text-sm font-medium text-black dark:text-white"
            numberOfLines={2}
            accessibilityLabel={`Initiative ${item.name}`}>
            {item.name}
          </Text>
          <View className="flex-row items-center gap-1">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={item.status} />
          </View>
        </View>
        <View className="flex-row items-center justify-end gap-2">
          <Pressable
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={{ height: 30, borderRadius: 999, backgroundColor: '#1877f2', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Buka detail ${item.name}`}
            onPress={() => router.push(`/initiative/${item.id}` as Href)}>
            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '900' }}>Detail</Text>
          </Pressable>
          <Pressable
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={{ width: 34, height: 30, borderRadius: 999, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${item.name}`}
            onPress={() => setMenuOpen(true)}>
            <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '900' }}>⋯</Text>
          </Pressable>
        </View>
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={item.name}
        items={defaultRowActions(item.name)}
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
}: {
  ps: ProblemStatement;
  ancestorPast?: boolean;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { initiatives, isLoading, isError, refetch } = useProblemStatementInitiatives(ps.id, expanded);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(ps, focus) === 'past';
  const canAddInit = can('create_initiative');

  return (
    <PastDim past={past} ancestorPast={ancestorPast}>
      {/* Spec §7.4 + §8: level-2 Dev pane, border kiri 5px warna Problem Statement (#c2410c). */}
      <View
        className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.problem_statement, marginLeft: TREE_LEVEL_INDENT[2] }}>
        <WorkspaceKindPill kind="problem_statement" />
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-sm font-medium text-black dark:text-white">{ps.name}</Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={ps.status} />
          </View>
        </View>
        <CardActionRow
          cardLabel={ps.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Initiative"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/problem-statement/${ps.id}` as Href)}
          detailLabel={`Buka detail ${ps.name}`}
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
                <InitiativeSubRow key={i.id} item={i} ancestorPast={ancestorPast || past} />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={ps.name}
        items={defaultRowActions(ps.name)}
      />
    </PastDim>
  );
}

function DevelopmentAreaRow({ devArea }: { devArea: DevelopmentAreaWithProblemCount }) {
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

  const count = problemCountOf(devArea);
  const countLabel =
    count == null ? WS_DEV_COPY.problemCountUnknown : WS_DEV_COPY.problemCount(count);
  const past = cardPeriodStatus(devArea, focus) === 'past';
  const canAddProblem = can('create_problem_statement'); // WSA-13 — key presisi (bukan proxy create_development_area)

  return (
    <PastDim past={past}>
      {/* Spec §7.3 + §8: level-0 Dev pane, border kiri 5px warna Development Area (#0f766e). */}
      <View style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.development_area, borderRadius: 16, marginLeft: TREE_LEVEL_INDENT[0] }}>
      <SectionCard>
        <WorkspaceKindPill kind="development_area" />
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-black dark:text-white">
            {devArea.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={devArea.status} />
          </View>
        </View>

        <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>

        <CardActionRow
          cardLabel={devArea.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Problem Statement"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/development-area/${devArea.id}` as Href)}
          detailLabel={`Buka detail ${devArea.name}`}
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
                <ProblemStatementSubRow key={p.id} ps={p} ancestorPast={past} />
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
        items={defaultRowActions(devArea.name)}
      />
    </PastDim>
  );
}

function InitiativeRow({ item, onPress }: { item: Initiative; onPress: () => void }) {
  const { focus } = usePeriodFocus();
  const [menuOpen, setMenuOpen] = useState(false);
  const past = cardPeriodStatus(item, focus) === 'past';
  return (
    <PastDim past={past}>
      <SectionCard>
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={item.status} />
          </View>
        </View>
        <View className="flex-row items-center justify-end gap-2">
          <Pressable
            className="min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 px-3 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Buka detail ${item.name}`}
            onPress={onPress}>
            <Text className="text-sm font-semibold text-black dark:text-white">Detail</Text>
          </Pressable>
          <Pressable
            className="min-h-[44px] w-11 items-center justify-center rounded-xl border border-neutral-300 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${item.name}`}
            onPress={() => setMenuOpen(true)}>
            <Text className="text-base font-bold text-black dark:text-white">⋯</Text>
          </Pressable>
        </View>
      </SectionCard>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={item.name}
        items={defaultRowActions(item.name)}
      />
    </PastDim>
  );
}

function PaneTopHeader({
  tab,
  onTabChange,
  onBackToHub,
  primaryLabel,
  onPrimary,
  canEdit,
  onEdit,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onBackToHub: () => void;
  /** WSA-07 — tombol utama pane, mis. "+ Goal" / "+ Development Area". */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** WSA-07 — tombol `Edit` di-gate izin admin. */
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  return (
    <View className="gap-5 pb-5">
      {/* WSA-07 — button row paling atas: Kembali · [Edit (gated)] · + Turunan (primary). */}
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali ke Workspace"
          onPress={onBackToHub}
          style={{ minHeight: 38, minWidth: 92, borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          className="active:opacity-70">
          <Text style={{ color: '#145ebc', fontSize: 16 }}>←</Text>
          <Text style={{ color: '#145ebc', fontSize: 13, fontWeight: '900' }}>Kembali</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {canEdit && onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit Workspace"
            onPress={onEdit}
            style={{ height: 42, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
            className="active:opacity-70">
            <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '900' }}>Edit</Text>
          </Pressable>
        ) : null}
        {primaryLabel && onPrimary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            onPress={onPrimary}
            style={{ height: 42, borderRadius: 8, backgroundColor: '#1877f2', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
            className="active:opacity-70">
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '900' }}>{primaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">{WS_COPY.title}</Text>
      <TabBar<'performance' | 'development'>
        tabs={[
          { key: 'performance', label: WS_TABS.performance },
          { key: 'development', label: WS_TABS.development },
        ]}
        active={tab === 'hub' ? 'performance' : tab}
        onChange={(t) => onTabChange(t)}
      />
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

function PerformancePane({
  tab,
  onTabChange,
  onBackToHub,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onBackToHub: () => void;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const goalsQ = useGoals();
  const flatQ = useFlatInitiatives();
  const canCreate = can('create_goal');

  useFocusEffect(
    useCallback(() => {
      goalsQ.refetch();
      flatQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = (
    <View className="gap-5 pb-3">
      <PaneTopHeader
        tab={tab}
        onTabChange={onTabChange}
        onBackToHub={onBackToHub}
        primaryLabel={canCreate ? WS_COPY.btnGoalBaru : undefined}
        onPrimary={canCreate ? () => router.push('/goal-wizard' as Href) : undefined}
      />
      <PeriodSwitcher />
      <Text className="text-base text-neutral-500 dark:text-neutral-400">{WS_COPY.subtitle}</Text>
      <Text accessibilityRole="header" className="text-xl font-bold text-black dark:text-white">{WS_COPY.sectionStrategis}</Text>
      {goalsQ.isLoading ? <SkeletonList count={3} /> : null}
      {goalsQ.isError ? <ErrorState onRetry={() => goalsQ.refetch()} /> : null}
    </View>
  );

  const footer = (
    <View className="gap-3 pt-5">
      <Text accessibilityRole="header" className="text-xl font-bold text-black dark:text-white">{WS_COPY.sectionTanpaGoal}</Text>
      {flatQ.isLoading ? (
        <SkeletonList count={2} />
      ) : flatQ.isError ? (
        <ErrorState onRetry={() => flatQ.refetch()} />
      ) : flatQ.initiatives.length > 0 ? (
        <View className="gap-3">
          {flatQ.initiatives.map((item) => (
            <InitiativeRow
              key={item.id}
              item={item}
              onPress={() => router.push(`/initiative/${item.id}` as Href)}
            />
          ))}
        </View>
      ) : (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">
          {WS_COPY.emptyFlatInitiative}
        </Text>
      )}
    </View>
  );

  const goalsData = goalsQ.isLoading || goalsQ.isError ? [] : goalsQ.goals;
  const showEmpty = !goalsQ.isLoading && !goalsQ.isError && goalsQ.goals.length === 0;

  const renderItem = ({ item: goal }: { item: GoalWithKpiCount }) => <GoalRow goal={goal} />;

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <FlatList<GoalWithKpiCount>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={goalsData}
        keyExtractor={(goal) => goal.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          showEmpty ? (
            <EmptyState
              title={WS_COPY.emptyGoalTitle}
              description={canCreate ? WS_COPY.emptyGoalDescCan : WS_COPY.emptyGoalDescView}
              action={
                canCreate
                  ? { label: WS_COPY.btnGoalBaru, onPress: () => router.push('/goal-wizard' as Href) }
                  : undefined
              }
            />
          ) : null
        }
        ListFooterComponent={footer}
        renderItem={renderItem}
      />
    </View>
  );
}

function DevelopmentPane({
  tab,
  onTabChange,
  onBackToHub,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onBackToHub: () => void;
}) {
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
      <PaneTopHeader
        tab={tab}
        onTabChange={onTabChange}
        onBackToHub={onBackToHub}
        primaryLabel={canCreate ? WS_DEV_COPY.btnDevAreaBaru : undefined}
        onPrimary={canCreate ? () => router.push('/development-area/new' as Href) : undefined}
      />
      <PeriodSwitcher space="development" />
      <Text className="text-base text-neutral-500 dark:text-neutral-400">{WS_DEV_COPY.subtitle}</Text>
      <Text accessibilityRole="header" className="text-xl font-bold text-black dark:text-white">
        {WS_DEV_COPY.sectionDevAreas}
      </Text>
      {devQ.isLoading ? <SkeletonList count={3} /> : null}
      {devQ.isError ? <ErrorState onRetry={() => devQ.refetch()} /> : null}
    </View>
  );

  const devData = devQ.isLoading || devQ.isError ? [] : devQ.developmentAreas;
  const showEmpty = !devQ.isLoading && !devQ.isError && devQ.developmentAreas.length === 0;

  const renderItem = ({ item: d }: { item: DevelopmentAreaWithProblemCount }) => (
    <DevelopmentAreaRow devArea={d} />
  );

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <FlatList<DevelopmentAreaWithProblemCount>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={devData}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          showEmpty ? (
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
          ) : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}

export function LiveWorkspaceScreen() {
  // UI-N-002 Stage 2: default `hub` agar user lihat lobby dulu sebelum dive in.
  const [tab, setTab] = useState<Tab>('hub');
  const backToHub = () => setTab('hub');

  if (tab === 'hub') return <HubView onSelect={setTab} />;
  return tab === 'performance' ? (
    <PerformancePane tab={tab} onTabChange={setTab} onBackToHub={backToHub} />
  ) : (
    <DevelopmentPane tab={tab} onTabChange={setTab} onBackToHub={backToHub} />
  );
}

export default function WorkspaceRoute() {
  return <TabScreenAdapter live={LiveWorkspaceScreen} prototype={PrototypeWorkspaceScreen} />;
}
