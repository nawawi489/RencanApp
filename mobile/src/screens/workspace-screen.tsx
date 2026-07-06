// Workspace (Fase 6) — Performance & Development sebagai route deep-linkable.
// Performance (Fase 4): Goal → KPI Area → Strategy → Initiative, + Initiative Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Initiative → Action Plan.
// UI-N-003 (Stage 1 B′): tree 3-level inline — KPI Area & Problem Statement EXPANDABLE
//   ke level-3 (Strategy / Initiative) untuk turunkan tap-count Goal→Strategy dari 3 → 1.
// Perpindahan pane dilakukan via Hub (Kembali di AppHeader → Masuk ruang lain) — TIDAK ada
// TabBar internal di pane agar tidak duplikasi navigasi hub-card lobby.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import {
  Fragment,
  memo,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import {
  Badge,
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
import { ENTITY_ROUTE_SEGMENT } from '@/lib/entity-routes';
import { alertFriendlyError } from '@/lib/errors';
import type { RowAction } from '@/components/row-actions-menu';
import { PLANNING_STATUS_LABEL, kpiCountOf, type GoalWithKpiCount } from '@/lib/goals';
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
import {
  MONTH_LABELS_ID,
  focusPeriodStatus,
  formatPeriodLabel,
  isAddLocked,
  quarterOfMonth,
  showPastPeriodAlert,
} from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { useThemePreference } from '@/providers/theme-provider';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { WorkspaceHubCard } from '@/components/workspace-hub-card';
import {
  TREE_LEVEL_INDENT,
  WORKSPACE_KIND_BORDER,
  WorkspaceKindPill,
  type WorkspaceKind,
} from '@/components/workspace-kind-pill';
import {
  derivePerformanceHubStats,
  deriveDevelopmentHubStats,
} from '@/lib/workspace-hub-stats';
import { WS_COPY, WS_DEV_COPY, WS_HELP_COPY, WS_HUB_COPY, WS_TREE_COMPACT_COPY } from '@/lib/workspace-copy';

// Tree merender status dari beberapa jenis kartu: planning (goal/kpi/strategy/dev-area/PS),
// initiative, dan action plan (execution). PLANNING_STATUS_LABEL saja bocorkan enum mentah
// (mis. `in_progress`) untuk Action Plan → gabung ketiga map (nilai konsisten, tanpa konflik).
const TREE_STATUS_LABEL: Record<string, string> = {
  ...PLANNING_STATUS_LABEL,
  ...INITIATIVE_STATUS_LABEL,
  ...ACTION_PLAN_STATUS_LABEL,
};

// UI-S-W09 — hitSlop dinaikkan ke 10/8 agar touch target efektif ≥ 44px (DESIGN §4 a11y).
// Tombol visual 32–34px + hitSlop ini → 48–54px target sentuh, setara panduan iOS/Material.
const ACTION_HIT_SLOP = { top: 10, bottom: 10, left: 8, right: 8 };
const EMPTY_IDS: string[] = [];

type TreeCardDates = {
  period_start?: string | null;
  period_end?: string | null;
  start_date?: string | null;
  deadline?: string | null;
};

/**
 * Garis kontinu yang membentang di sepanjang daftar sibling card (spesifik §8 polish).
 * Dipasang sekali di wrapper yang membungkus list anak, sehingga garis TIDAK putus di antara
 * card-card level yang sama. `offsetLeft` = posisi absolut garis di dalam wrapper (gutter
 * relatif thd child).
 */
function SiblingTreeLine({ offsetLeft }: { offsetLeft: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: offsetLeft,
        top: 0,
        bottom: 0,
        width: 1.5,
        backgroundColor: '#cfd8e5',
        borderRadius: 1,
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
function TreeOrbCell({
  kind,
  value,
  compact = false,
}: {
  kind: string;
  value: number | null;
  compact?: boolean;
}) {
  if (value == null) {
    return (
      <View style={{ width: compact ? 38 : 50 }} className="items-center justify-center py-0.5">
        <Text className="text-base font-bold text-neutral-400 dark:text-neutral-500" accessibilityLabel={`${treeOrbLabel(kind)} belum tersedia`}>
          —
        </Text>
      </View>
    );
  }
  return <TreeProgressOrb value={value} label={treeOrbLabel(kind)} compact={compact} />;
}

function CompactMeta({ lines }: { lines: Array<string | null | undefined> }) {
  const visibleLines = lines.filter((line): line is string => !!line && line.trim().length > 0).slice(0, 2);
  if (visibleLines.length === 0) return null;
  return (
    <View className="gap-1">
      {visibleLines.map((line) => (
        <Text
          key={line}
          className="text-xs leading-4.5 text-neutral-500 dark:text-neutral-400"
          numberOfLines={2}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function compactDate(value: string | null | undefined) {
  return value?.trim() ? value.slice(0, 10) : null;
}

type YMD = { iso: string; year: number; month: number; day: number };

function parseDateOnly(value: string | null | undefined): YMD | null {
  if (!value?.trim()) return null;
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split('-').map((part) => Number(part));
  if (!y || !m || !d) return null;
  return { iso, year: y, month: m, day: d };
}

function endOfMonthDay(year: number, month1: number) {
  // Satu-satunya `new Date` yang tersisa: last-day-of-month via day-0 trick.
  return new Date(year, month1, 0).getDate();
}

function treePeriodPillLabel(
  card: TreeCardDates,
  fallbackFocus: ReturnType<typeof usePeriodFocus>['focus'],
) {
  const start = parseDateOnly(card.period_start ?? card.start_date);
  const end = parseDateOnly(card.period_end ?? card.deadline);
  if (!start || !end) return formatPeriodLabel(fallbackFocus);

  // Full year: YYYY-01-01..YYYY-12-31.
  if (start.year === end.year && start.iso.slice(5) === '01-01' && end.iso.slice(5) === '12-31') {
    return `${start.year}`;
  }

  if (start.year === end.year) {
    const startQuarter = quarterOfMonth(start.month);
    const endQuarter = quarterOfMonth(end.month);
    const quarterStartMonth = (startQuarter - 1) * 3 + 1;
    const quarterEndMonth = quarterStartMonth + 2;
    if (
      startQuarter === endQuarter &&
      start.month === quarterStartMonth &&
      start.day === 1 &&
      end.month === quarterEndMonth &&
      end.day === endOfMonthDay(end.year, end.month)
    ) {
      return `Q${startQuarter} ${start.year}`;
    }
  }

  if (start.year === end.year && start.month === end.month) {
    return `${MONTH_LABELS_ID[start.month]} ${start.year}`;
  }

  return formatPeriodLabel(fallbackFocus);
}


/**
 * Badan card (pill + judul + orb): tap → membuka detail. Action row tetap menyediakan tombol
 * Detail eksplisit untuk pola compact, tetapi overlay ini dipertahankan agar perilaku tap badan
 * card yang sudah ada tidak regres. `overlayRightInset` dipakai bila ada kontrol independen di sisi
 * kanan header (mis. chevron compact) agar tombol itu tidak tertutup overlay detail.
 */
function TreeCardBody({
  cardLabel,
  onPress,
  children,
  overlayRightInset = 0,
}: {
  cardLabel: string;
  onPress: () => void;
  children: ReactNode;
  overlayRightInset?: number;
}) {
  return (
    <View style={{ position: 'relative' }}>
      <View className="flex-row items-start gap-2">{children}</View>
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: overlayRightInset, bottom: 0 }}
        accessibilityRole="button"
        accessibilityLabel={`Buka detail ${cardLabel}`}
        onPress={onPress}
      />
    </View>
  );
}

function CompactHeaderPills({
  kind,
  periodLabel,
}: {
  kind: WorkspaceKind;
  periodLabel: string;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <WorkspaceKindPill kind={kind} />
      <Badge label={periodLabel} tone="neutral" />
    </View>
  );
}

function TreeToggleButton({
  expanded,
  label,
  onPress,
}: {
  expanded: boolean;
  label: string;
  onPress: () => void;
}) {
  const isDark = useThemePreference().effective === 'dark';
  const borderColor = expanded ? (isDark ? '#3b82f6' : '#bfdbfe') : isDark ? '#404040' : '#d9e3ef';
  const backgroundColor = expanded ? (isDark ? '#172554' : '#eff6ff') : isDark ? '#171717' : '#f8fafc';
  const iconColor = expanded ? (isDark ? '#bfdbfe' : '#2563eb') : isDark ? '#e5e7eb' : '#64748b';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      hitSlop={ACTION_HIT_SLOP}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        pointerEvents="none"
        style={{
          transform: [{ rotate: expanded ? '90deg' : '0deg' }],
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name="chevron-forward" size={18} color={iconColor} />
      </View>
    </Pressable>
  );
}

function ExpandChildCount({
  label,
  expanded,
  onPress,
}: {
  label: string;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={ACTION_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ketuk untuk ${expanded ? 'tutup' : 'buka'}`}>
      <Text className="text-xs leading-4.5 text-neutral-500 dark:text-neutral-400">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Action row compact tree-card: [Detail] [⋯] [+ tambah?].
 * Expand/collapse dipindah ke chevron kanan atas; tombol "+" tetap mewarisi seluruh guard bisnis
 * lama (past-period, permission, MBR) agar semantik tidak berubah.
 */
function CompactActionRow({
  cardLabel,
  detailLabel,
  onDetail,
  onMore,
  past,
  onAdd,
  onAddPress,
  addDimmed,
  addLabel,
  addButtonLabel,
}: {
  cardLabel: string;
  detailLabel: string;
  onDetail: () => void;
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
  // row dibuat tetap compact: tombol visible 30px dengan hitSlop agar target sentuh tetap nyaman.
  const isDark = useThemePreference().effective === 'dark';
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        hitSlop={ACTION_HIT_SLOP}
        style={{
          minHeight: 34,
          borderRadius: 999,
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1d4ed8' : '#1564b3',
        }}
        accessibilityRole="button"
        accessibilityLabel={detailLabel}
        onPress={onDetail}>
        <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '900' }}>Detail</Text>
      </Pressable>
      <Pressable
        hitSlop={ACTION_HIT_SLOP}
        style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: isDark ? '#171717' : '#f8fafc', borderWidth: 1, borderColor: isDark ? '#404040' : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
        accessibilityRole="button"
        accessibilityLabel={`Aksi lain ${cardLabel}`}
        onPress={onMore}>
        <Text style={{ color: isDark ? '#ffffff' : '#0f172a', fontSize: 14, fontWeight: '900' }}>⋯</Text>
      </Pressable>
      {onAdd || onAddPress ? (
        <Pressable
          hitSlop={ACTION_HIT_SLOP}
          style={{
            minHeight: 34,
            borderRadius: 999,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            // UI-S-W09 — tombol "+ Child" pakai family teal (konstruktif) agar tidak rancu
            // dengan Detail (biru = primary nav) dan "⋯" (netral = utility).
            borderWidth: 1,
            borderColor: (addDimmed ?? past)
              ? (isDark ? '#404040' : '#e2e8f0')
              : (isDark ? '#115e59' : '#99f6e4'),
            backgroundColor: (addDimmed ?? past)
              ? (isDark ? '#262626' : '#f1f5f9')
              : (isDark ? '#134e4a' : '#ccfbf1'),
          }}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? 'Tambah turunan'}
          accessibilityState={{ disabled: addDimmed ?? past }}
          onPress={() =>
            onAddPress ? onAddPress() : past ? showPastPeriodAlert() : onAdd?.()
          }>
          <Text style={{ color: (addDimmed ?? past) ? (isDark ? '#6b7280' : '#94a3b8') : (isDark ? '#5eead4' : '#0f766e'), fontSize: 11, fontWeight: '900' }}>
            {addButtonLabel ?? '+'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

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
const StrategySubRow = memo(function StrategySubRow({
  strategy,
  parentCompliance,
  progress,
}: {
  strategy: Strategy;
  /** Kepatuhan MBR kpi_area→strategy (parent). Non-compliant → "+ Initiative" ter-guard (WSA-04). */
  parentCompliance?: MbrCompliance;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { initiatives, isLoading, isError, refetch } = useStrategyInitiatives(strategy.id, expanded);
  const initiativeIds = useMemo(
    () => (expanded ? initiatives.map((i) => i.id) : EMPTY_IDS),
    [expanded, initiatives],
  );
  const { progressOf: initProgressOf } = useCardProgress(initiativeIds);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(strategy, focus, now);
  const canAddInit = can('create_initiative');
  const rowActions = useTreeRowActions('strategy', strategy.id, strategy.name);
  const periodLabel = treePeriodPillLabel(strategy, focus);
  const metaLines = WS_TREE_COMPACT_COPY.strategyMeta({
    past,
    statusLabel: TREE_STATUS_LABEL[strategy.status] ?? strategy.status,
    contribution: strategy.contribution_pct == null ? null : `${strategy.contribution_pct}%`,
    risk: strategy.main_risk,
  });
  // WSA-04 — guard MBR: fail-open saat data belum ada (undefined); guard hanya saat tahu non-compliant.
  const mbrGuarded = !!parentCompliance && !parentCompliance.is_compliant;
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/strategy/${strategy.id}` as Href),
    [router, strategy.id],
  );
  const retryChildren = useCallback(() => refetch(), [refetch]);
  const onAddInitiative = useCallback(() => {
    if (mbrGuarded && parentCompliance) {
      const { title, message } = mbrBreakdownGuardMessage('KPI Area', parentCompliance, 'Initiative');
      Alert.alert(title, message);
      return;
    }
    if (past) {
      showPastPeriodAlert();
      return;
    }
    router.push(`/initiative/new?strategyId=${strategy.id}` as Href);
  }, [mbrGuarded, parentCompliance, past, router, strategy.id, strategy.name]);
  // Tombol redup bila past ATAU ter-guard MBR (spec §11: tetap terlihat, tapi redup).
  const addDimmed = past || mbrGuarded;

  return (
    <View>
      <View
        className="gap-2"
        style={{ marginLeft: TREE_LEVEL_INDENT[3] }}>
        {/* Spec §6.6 + §8: level-3 (indent 20px), border kiri 5px warna Strategy (#6941c6). */}
        <View
          className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.strategy }}>
          <TreeCardBody cardLabel={strategy.name} onPress={openDetail} overlayRightInset={52}>
            <View className="flex-1 gap-1.5">
              <CompactHeaderPills kind="strategy" periodLabel={periodLabel} />
              <Text
                className="text-sm font-medium text-black dark:text-white"
                numberOfLines={2}
                accessibilityLabel={`Strategy ${strategy.name}`}>
                {strategy.name}
              </Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="strategy" value={progress} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Initiative ${strategy.name}`}
                onPress={toggleExpanded}
              />
            </View>
          </TreeCardBody>
          <CompactActionRow
            cardLabel={strategy.name}
            detailLabel={`Detail ${strategy.name}`}
            onDetail={openDetail}
            onMore={openMenu}
            past={past}
            onAddPress={canAddInit ? onAddInitiative : undefined}
            addDimmed={addDimmed}
            addLabel={`Tambah Initiative ke ${strategy.name}`}
            addButtonLabel="+ Initiative"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : initiatives.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Initiative. Tambah Initiative untuk eksekusi Strategy ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[4] - 10} />
              {initiatives.map((i) => (
                <InitiativeSubRow
                  key={i.id}
                  item={i}
                  progress={initProgressOf(i.id)}
                />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={closeMenu}
        title={strategy.name}
        items={rowActions}
      />
    </View>
  );
});

/**
 * Sub-row level 2: KPI Area di bawah satu Goal. Expandable → Strategy children.
 * Lazy fetch Strategy hanya saat `expanded` (parameter `enabled` di useStrategies).
 */
const KpiAreaSubRow = memo(function KpiAreaSubRow({
  kpi,
  progress,
}: {
  kpi: KpiArea;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { strategies, isLoading, isError, refetch } = useStrategies(kpi.id, expanded);
  const strategyIds = useMemo(
    () => (expanded ? strategies.map((s) => s.id) : EMPTY_IDS),
    [expanded, strategies],
  );
  const { progressOf: stratProgressOf } = useCardProgress(strategyIds);
  // WSA-04 — guard MBR: fetch kepatuhan kpi_area→strategy hanya saat expanded (parentType ''
  // menonaktifkan query di useMbrCompliance). Diteruskan ke StrategySubRow untuk guard "+ Initiative".
  const { compliance: mbrCompliance } = useMbrCompliance(expanded ? 'kpi_area' : '', kpi.id);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(kpi, focus, now);
  const canAddStrategy = can('create_strategy'); // WSA-13 — key presisi (bukan proxy create_kpi_area)
  const rowActions = useTreeRowActions('kpi_area', kpi.id, kpi.name);
  const periodLabel = treePeriodPillLabel(kpi, focus);
  const metaLines = WS_TREE_COMPACT_COPY.kpiMeta({
    past,
    statusLabel: TREE_STATUS_LABEL[kpi.status] ?? kpi.status,
    target: kpi.target,
    outcome: kpi.expected_outcome,
  });
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/kpi-area/${kpi.id}` as Href),
    [router, kpi.id],
  );
  const addStrategy = useCallback(
    () => router.push(`/strategy/new?kpiAreaId=${kpi.id}` as Href),
    [router, kpi.id],
  );
  const retryChildren = useCallback(() => refetch(), [refetch]);

  return (
    <View>
      <View
        className="gap-2"
        style={{ marginLeft: TREE_LEVEL_INDENT[2] }}>
        {/* Spec §6.5 + §8: level-2 (indent 16px), border kiri 5px warna KPI Area (#b76b00). */}
        <View
          className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.kpi_area }}>
          <TreeCardBody cardLabel={kpi.name} onPress={openDetail} overlayRightInset={52}>
            <View className="flex-1 gap-1.5">
              <CompactHeaderPills kind="kpi_area" periodLabel={periodLabel} />
              <Text className="text-sm font-medium text-black dark:text-white" numberOfLines={2}>
                {kpi.name}
              </Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="kpi_area" value={progress} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Strategy ${kpi.name}`}
                onPress={toggleExpanded}
              />
            </View>
          </TreeCardBody>
          <CompactActionRow
            cardLabel={kpi.name}
            detailLabel={`Detail ${kpi.name}`}
            onDetail={openDetail}
            onMore={openMenu}
            past={past}
            onAdd={canAddStrategy ? addStrategy : undefined}
            addLabel={`Tambah Strategy ke ${kpi.name}`}
            addButtonLabel="+ Strategy"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : strategies.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Strategy. Tambah Strategy untuk pecah KPI Area ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[3] - 10} />
              {strategies.map((s) => (
                <StrategySubRow
                  key={s.id}
                  strategy={s}
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
        onClose={closeMenu}
        title={kpi.name}
        items={rowActions}
      />
    </View>
  );
});

const GoalRow = memo(function GoalRow({
  goal,
  progress,
}: {
  goal: GoalWithKpiCount;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // UI-S-W07: destrukturisasi state fetch penuh — expand tanpa skeleton/empty/error
  // terasa seperti tombol mati (paritas dgn KpiAreaSubRow level-2).
  const { kpiAreas, isLoading, isError, refetch } = useKpiAreas(goal.id, expanded);
  const { focus, now } = usePeriodFocus();
  // WSA-15 — orb capaian anak (KPI Area) di level kontainer (1 RPC per Goal expanded, bukan per row).
  const kpiIds = useMemo(() => (expanded ? kpiAreas.map((k) => k.id) : EMPTY_IDS), [expanded, kpiAreas]);
  const { progressOf: kpiProgressOf } = useCardProgress(kpiIds);

  const count = kpiCountOf(goal);
  const past = isAddLocked(goal, focus, now);
  const canAddKpi = can('create_kpi_area');
  const rowActions = useTreeRowActions('goal', goal.id, goal.name);
  const periodLabel = treePeriodPillLabel(goal, focus);
  const metaLines = WS_TREE_COMPACT_COPY.goalMeta({
    past,
    statusLabel: TREE_STATUS_LABEL[goal.status] ?? goal.status,
    // Kolom tabel `goals` bernama `target_value` (bukan `target_result` — itu milik `initiatives`).
    // Referensi lama menghasilkan `undefined` → target Goal tak pernah tampil di tree meta.
    target: goal.target_value,
  });
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(() => router.push(`/goal/${goal.id}` as Href), [router, goal.id]);
  const addKpi = useCallback(
    () => router.push(`/kpi-area/new?goalId=${goal.id}` as Href),
    [router, goal.id],
  );
  const retryChildren = useCallback(() => refetch(), [refetch]);

  return (
    <View>
      {/* Spec §6.4 + §8: level-0 (indent 0), border kiri 5px warna kategori Goal. */}
      <View className="gap-2" style={{ marginLeft: TREE_LEVEL_INDENT[0] }}>
        {/* testID membungkus HANYA kartu Goal (turunan KPI dirender sibling di luar, §UI-N-003) —
            penanda stabil untuk test struktur karena react-native-css menanggalkan className. */}
        <View
          testID={`tree-card-goal-${goal.id}`}
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.goal, borderRadius: 16 }}>
          <SectionCard>
            <TreeCardBody cardLabel={goal.name} onPress={openDetail} overlayRightInset={52}>
              <View className="flex-1 gap-1.5">
                <CompactHeaderPills kind="goal" periodLabel={periodLabel} />
                <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={2}>{goal.name}</Text>
                <CompactMeta lines={metaLines} />
              </View>
              <View className="items-center gap-1">
                <TreeOrbCell kind="goal" value={progress} compact />
                <TreeToggleButton
                  expanded={expanded}
                  label={`Toggle KPI Area ${goal.name}`}
                  onPress={toggleExpanded}
                />
              </View>
            </TreeCardBody>

            <ExpandChildCount
              label={count === 0 ? 'Belum ada KPI' : WS_TREE_COMPACT_COPY.needChild(count, 'KPI Area')}
              expanded={expanded}
              onPress={toggleExpanded}
            />

            <CompactActionRow
              cardLabel={goal.name}
              detailLabel={`Detail ${goal.name}`}
              onDetail={openDetail}
              onMore={openMenu}
              past={past}
              onAdd={canAddKpi ? addKpi : undefined}
              addLabel={`Tambah KPI Area ke ${goal.name}`}
              addButtonLabel="+ KPI Area"
            />
          </SectionCard>
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : kpiAreas.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada KPI Area. Tambah KPI Area untuk pecah Goal ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[2] - 10} />
              {kpiAreas.map((k) => (
                <KpiAreaSubRow
                  key={k.id}
                  kpi={k}
                  progress={kpiProgressOf(k.id)}
                />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={closeMenu}
        title={goal.name}
        items={rowActions}
      />
    </View>
  );
});

/**
 * Sub-row Action Plan — level TERBAWAH (spec §6.8/§7.5): tanpa panah, tanpa tombol tambah.
 * Hanya Detail + ⋯. `level` menentukan indent (5 di Performance, 4 di Development).
 */
const ActionPlanSubRow = memo(function ActionPlanSubRow({
  item,
  level,
}: {
  item: ActionPlanWithPeople;
  level: 4 | 5;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(item, focus, now);
  const rowActions = useTreeRowActions('action_plan', item.id, item.name);
  const periodLabel = treePeriodPillLabel(item, focus);
  const metaLines = WS_TREE_COMPACT_COPY.actionPlanMeta({
    past,
    statusLabel: TREE_STATUS_LABEL[item.status] ?? item.status,
    deadline: compactDate(item.deadline ?? item.start_date),
    reviewer: item.reviewer?.full_name,
  });
  // WSA-15 — orb AP leaf dihitung KLIEN (bukan RPC): status-based (one_time) via progress.ts.
  // Repeat AP butuh Repeat Compliance yg tak ter-fetch di baris ini → null → '—' (bukan 0% palsu).
  const orbValue = actionPlanTreeProgress({ status: item.status, repeatSetting: item.repeat_setting });
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/action-plan/${item.id}` as Href),
    [router, item.id],
  );

  return (
    <View>
      <View
        className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.action_plan, marginLeft: TREE_LEVEL_INDENT[level] }}>
        <TreeCardBody cardLabel={item.name} onPress={openDetail}>
          <View className="flex-1 gap-1.5">
            <CompactHeaderPills kind="action_plan" periodLabel={periodLabel} />
            <Text
              className="text-sm font-medium text-black dark:text-white"
              numberOfLines={2}
              accessibilityLabel={`Action Plan ${item.name}`}>
              {item.name}
            </Text>
            <CompactMeta lines={metaLines} />
          </View>
          <TreeOrbCell kind="action_plan" value={orbValue} compact />
        </TreeCardBody>
        {/* Action Plan = leaf: tanpa panah/+. Tetap pakai pola compact Detail + ⋯. */}
        <CompactActionRow
          cardLabel={item.name}
          detailLabel={`Detail ${item.name}`}
          onDetail={openDetail}
          onMore={openMenu}
          past={past}
        />
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={closeMenu}
        title={item.name}
        items={rowActions}
      />
    </View>
  );
});

/**
 * Sub-row Initiative. WSA-01: expandable → Action Plan (level terbawah). Dipakai di Performance
 * (di bawah Strategy, level 4) dan Development (di bawah Problem Statement, level 3).
 * "+ Plan" gated `create_action_plan`, past-period lock.
 */
const InitiativeSubRow = memo(function InitiativeSubRow({
  item,
  level = 4,
  progress,
}: {
  item: Initiative;
  /** Level tree Initiative: 4 di Performance (bawah Strategy), 3 di Development (bawah PS). */
  level?: 3 | 4;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { actionPlans, isLoading, isError, refetch } = useInitiativeActionPlans(item.id, expanded);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(item, focus, now);
  const canAddPlan = can('create_action_plan');
  const rowActions = useTreeRowActions('initiative', item.id, item.name);
  const periodLabel = treePeriodPillLabel(item, focus);
  const metaLines = WS_TREE_COMPACT_COPY.initiativeMeta({
    past,
    statusLabel: TREE_STATUS_LABEL[item.status] ?? item.status,
    target: item.target_result,
  });
  const childLevel = (level + 1) as 4 | 5;
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/initiative/${item.id}` as Href),
    [router, item.id],
  );
  const addPlan = useCallback(
    () => router.push(`/action-plan/new?initiativeId=${item.id}` as Href),
    [router, item.id],
  );
  const retryChildren = useCallback(() => refetch(), [refetch]);

  return (
    <View>
      <View
        className="gap-2"
        style={{ marginLeft: TREE_LEVEL_INDENT[level] }}>
        {/* Spec §6.7/§7.5 + §8: border kiri 5px warna Initiative (#14845c). */}
        <View
          className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.initiative }}>
          <TreeCardBody cardLabel={item.name} onPress={openDetail} overlayRightInset={52}>
            <View className="flex-1 gap-1.5">
              <CompactHeaderPills kind="initiative" periodLabel={periodLabel} />
              <Text
                className="text-sm font-medium text-black dark:text-white"
                numberOfLines={2}
                accessibilityLabel={`Initiative ${item.name}`}>
                {item.name}
              </Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="initiative" value={progress} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Action Plan ${item.name}`}
                onPress={toggleExpanded}
              />
            </View>
          </TreeCardBody>
          <CompactActionRow
            cardLabel={item.name}
            detailLabel={`Detail ${item.name}`}
            onDetail={openDetail}
            onMore={openMenu}
            past={past}
            onAdd={canAddPlan ? addPlan : undefined}
            addLabel={`Tambah Action Plan ke ${item.name}`}
            addButtonLabel="+ Plan"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : actionPlans.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Action Plan. Tambah Action Plan untuk eksekusi Initiative ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[5] - 10} />
              {actionPlans.map((ap) => (
                <ActionPlanSubRow key={ap.id} item={ap} level={childLevel} />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={closeMenu}
        title={item.name}
        items={rowActions}
      />
    </View>
  );
});

/**
 * Sub-row level 2: Problem Statement di bawah satu Development Area. Expandable → Initiative.
 * Symmetric dgn KpiAreaSubRow di Performance pane.
 */
const ProblemStatementSubRow = memo(function ProblemStatementSubRow({
  ps,
  progress,
}: {
  ps: ProblemStatement;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { initiatives, isLoading, isError, refetch } = useProblemStatementInitiatives(ps.id, expanded);
  const initiativeIds = useMemo(
    () => (expanded ? initiatives.map((i) => i.id) : EMPTY_IDS),
    [expanded, initiatives],
  );
  const { progressOf: initProgressOf } = useCardProgress(initiativeIds);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(ps, focus, now);
  const canAddInit = can('create_initiative');
  const rowActions = useTreeRowActions('problem_statement', ps.id, ps.name);
  const periodLabel = treePeriodPillLabel(ps, focus);
  const metaLines = WS_TREE_COMPACT_COPY.problemStatementMeta({
    past,
    statusLabel: TREE_STATUS_LABEL[ps.status] ?? ps.status,
    impact: ps.impact,
    evidence: ps.initial_evidence,
  });
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/problem-statement/${ps.id}` as Href),
    [router, ps.id],
  );
  const addInitiative = useCallback(
    () => router.push(`/initiative/new?problemStatementId=${ps.id}` as Href),
    [router, ps.id],
  );
  const retryChildren = useCallback(() => refetch(), [refetch]);

  return (
    <View>
      <View
        className="gap-2"
        style={{ marginLeft: TREE_LEVEL_INDENT[2] }}>
        {/* Spec §7.4 + §8: level-2 Dev pane, border kiri 5px warna Problem Statement (#c2410c). */}
        <View
          className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.problem_statement }}>
          <TreeCardBody cardLabel={ps.name} onPress={openDetail} overlayRightInset={52}>
            <View className="flex-1 gap-1.5">
              <CompactHeaderPills kind="problem_statement" periodLabel={periodLabel} />
              <Text className="text-sm font-medium text-black dark:text-white" numberOfLines={2}>{ps.name}</Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="problem_statement" value={progress} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Initiative ${ps.name}`}
                onPress={toggleExpanded}
              />
            </View>
          </TreeCardBody>
          <CompactActionRow
            cardLabel={ps.name}
            detailLabel={`Detail ${ps.name}`}
            onDetail={openDetail}
            onMore={openMenu}
            past={past}
            onAdd={canAddInit ? addInitiative : undefined}
            addLabel={`Tambah Initiative ke ${ps.name}`}
            addButtonLabel="+ Initiative"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : initiatives.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Initiative. Tambah Initiative untuk eksekusi Problem Statement ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[3] - 10} />
              {initiatives.map((i) => (
                <InitiativeSubRow
                  key={i.id}
                  item={i}
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
        onClose={closeMenu}
        title={ps.name}
        items={rowActions}
      />
    </View>
  );
});

const DevelopmentAreaRow = memo(function DevelopmentAreaRow({
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
  const { focus, now } = usePeriodFocus();
  const problemStatementIds = useMemo(
    () => (expanded ? problemStatements.map((p) => p.id) : EMPTY_IDS),
    [expanded, problemStatements],
  );
  const { progressOf: psProgressOf } = useCardProgress(problemStatementIds);

  const count = problemCountOf(devArea);
  const past = isAddLocked(devArea, focus, now);
  const canAddProblem = can('create_problem_statement'); // WSA-13 — key presisi (bukan proxy create_development_area)
  const rowActions = useTreeRowActions('development_area', devArea.id, devArea.name);
  const periodLabel = treePeriodPillLabel(devArea, focus);
  const metaLines = WS_TREE_COMPACT_COPY.developmentAreaMeta({
    past,
    statusLabel: TREE_STATUS_LABEL[devArea.status] ?? devArea.status,
  });
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/development-area/${devArea.id}` as Href),
    [router, devArea.id],
  );
  const addProblemStatement = useCallback(
    () => router.push(`/problem-statement/new?developmentAreaId=${devArea.id}` as Href),
    [router, devArea.id],
  );
  const retryChildren = useCallback(() => refetch(), [refetch]);

  return (
    <View>
      {/* Spec §7.3 + §8: level-0 Dev pane, border kiri 5px warna Development Area (#0f766e). */}
      <View className="gap-2" style={{ marginLeft: TREE_LEVEL_INDENT[0] }}>
        <View
          testID={`tree-card-dev-${devArea.id}`}
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.development_area, borderRadius: 16 }}>
          <SectionCard>
            <TreeCardBody cardLabel={devArea.name} onPress={openDetail} overlayRightInset={52}>
              <View className="flex-1 gap-1.5">
                <CompactHeaderPills kind="development_area" periodLabel={periodLabel} />
                <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={2}>
                  {devArea.name}
                </Text>
                <CompactMeta lines={metaLines} />
              </View>
              <View className="items-center gap-1">
                <TreeOrbCell kind="development_area" value={progress} compact />
                <TreeToggleButton
                  expanded={expanded}
                  label={`Toggle Problem Statement ${devArea.name}`}
                  onPress={toggleExpanded}
                />
              </View>
            </TreeCardBody>

            <ExpandChildCount
              label={WS_TREE_COMPACT_COPY.needChild(count, 'Problem Statement')}
              expanded={expanded}
              onPress={toggleExpanded}
            />

            <CompactActionRow
              cardLabel={devArea.name}
              detailLabel={`Detail ${devArea.name}`}
              onDetail={openDetail}
              onMore={openMenu}
              past={past}
              onAdd={canAddProblem ? addProblemStatement : undefined}
              addLabel={`Tambah Problem Statement ke ${devArea.name}`}
              addButtonLabel="+ Problem Statement"
            />
          </SectionCard>
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : problemStatements.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Problem Statement. Tambah Problem Statement untuk pecah Development Area
              ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[2] - 10} />
              {problemStatements.map((p) => (
                <ProblemStatementSubRow key={p.id} ps={p} progress={psProgressOf(p.id)} />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={closeMenu}
        title={devArea.name}
        items={rowActions}
      />
    </View>
  );
});

function PaneSectionHeader({
  title,
  primaryLabel,
  onPrimary,
  pastLocked,
}: {
  title: string;
  /** Tombol primary di kanan section header (mis. "+ Goal" / "+ Development Area"). */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** WS-04: periode fokus arsip — tombol tetap terlihat tapi redup+disabled a11y,
   *  press → showPastPeriodAlert() (bukan onPrimary). */
  pastLocked?: boolean;
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
          accessibilityLabel={
            pastLocked ? `${primaryLabel} (periode arsip — nonaktif)` : primaryLabel
          }
          accessibilityState={{ disabled: !!pastLocked }}
          onPress={pastLocked ? () => showPastPeriodAlert() : onPrimary}
          style={{
            height: 32,
            borderRadius: 12,
            backgroundColor: '#1564b3',
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pastLocked ? 0.4 : 1,
          }}
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

/**
 * Pane workspace (Performance / Development) — hierarki Goal atau Development Area
 * dengan pattern identik: header + PeriodSwitcher + section + list. Beda hanya
 * sumber data, izin, copy, tombol, dan row component (lihat 2 call site di bawah).
 * WSA-15/-16: orb capaian root dihitung 1 RPC untuk semua item terlihat.
 */
type PaneConfig<T extends { id: string }> = {
  kicker: string;
  subtitle: string;
  sectionTitle: string;
  btnLabel: string;
  emptyTitle: string;
  emptyDescCan: string;
  emptyDescView: string;
  permission: string;
  newRoute: string;
  periodSpace?: 'performance' | 'development';
  useItems: () => { items: T[]; isLoading: boolean; isError: boolean; refetch: () => void };
  renderRow: (item: T, progress: number | null) => ReactNode;
};

function WorkspacePane<T extends { id: string }>(config: PaneConfig<T>) {
  const router = useRouter();
  const { can } = useProfile();
  const q = config.useItems();
  const canCreate = can(config.permission);
  // WS-04: gating archive gate section-level & empty-state action. Periode
  // future default TIDAK dikunci (OQ-2 default). Server-side gate belum ada
  // (OQ-1 = a: UI-only, governance debt tercatat di docs/spec-ui-testfix).
  // Pakai `now` dari provider agar deterministik saat test menginjeksi anchor.
  const { focus, now: nowRef } = usePeriodFocus();
  const pastLocked = focusPeriodStatus(focus, nowRef) === 'past';

  useFocusEffect(
    useCallback(() => {
      q.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const items = q.isLoading || q.isError ? [] : q.items;
  const showEmpty = !q.isLoading && !q.isError && q.items.length === 0;
  const { progressOf } = useCardProgress(items.map((i) => i.id));

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <ScrollView contentContainerStyle={{ gap: 12, padding: 20 }}>
        <View className="gap-5 pb-3">
          <View className="gap-1">
            <Text
              accessibilityRole="header"
              className="text-2xl font-bold text-black dark:text-white">
              {config.kicker}
            </Text>
            <Text className="text-base text-neutral-500 dark:text-neutral-400">
              {config.subtitle}
            </Text>
          </View>
          <PeriodSwitcher space={config.periodSpace} />
          <PaneSectionHeader
            title={config.sectionTitle}
            primaryLabel={canCreate ? config.btnLabel : undefined}
            onPrimary={canCreate ? () => router.push(config.newRoute as Href) : undefined}
            pastLocked={pastLocked}
          />
          {q.isLoading ? <SkeletonList count={3} /> : null}
          {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : null}
        </View>
        {showEmpty ? (
          <EmptyState
            title={config.emptyTitle}
            description={canCreate ? config.emptyDescCan : config.emptyDescView}
            action={
              canCreate
                ? {
                    label: config.btnLabel,
                    onPress: pastLocked
                      ? () => showPastPeriodAlert()
                      : () => router.push(config.newRoute as Href),
                    disabled: pastLocked,
                  }
                : undefined
            }
          />
        ) : null}
        {items.map((item) => (
          <Fragment key={item.id}>{config.renderRow(item, progressOf(item.id))}</Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

function usePerformanceItems() {
  const q = useGoals();
  return { items: q.goals, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
function useDevelopmentItems() {
  const q = useDevelopmentAreas();
  return {
    items: q.developmentAreas,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
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
  return (
    <WorkspacePane
      kicker={WS_HUB_COPY.perf.kicker}
      subtitle={WS_COPY.subtitle}
      sectionTitle={WS_COPY.sectionStrategis}
      btnLabel={WS_COPY.btnGoalBaru}
      emptyTitle={WS_COPY.emptyGoalTitle}
      emptyDescCan={WS_COPY.emptyGoalDescCan}
      emptyDescView={WS_COPY.emptyGoalDescView}
      permission="create_goal"
      newRoute="/goal-wizard"
      useItems={usePerformanceItems}
      renderRow={(goal, progress) => <GoalRow goal={goal} progress={progress} />}
    />
  );
}

/** Route `/workspace/development` — pane Development. Back button di AppHeader. */
export function DevelopmentScreen() {
  return (
    <WorkspacePane
      kicker={WS_HUB_COPY.dev.kicker}
      subtitle={WS_DEV_COPY.subtitle}
      sectionTitle={WS_DEV_COPY.sectionDevAreas}
      btnLabel={WS_DEV_COPY.btnDevAreaBaru}
      emptyTitle={WS_DEV_COPY.emptyDevAreaTitle}
      emptyDescCan={WS_DEV_COPY.emptyDevAreaDescCan}
      emptyDescView={WS_DEV_COPY.emptyDevAreaDescView}
      permission="create_development_area"
      newRoute="/development-area/new"
      periodSpace="development"
      useItems={useDevelopmentItems}
      renderRow={(d, progress) => <DevelopmentAreaRow devArea={d} progress={progress} />}
    />
  );
}
