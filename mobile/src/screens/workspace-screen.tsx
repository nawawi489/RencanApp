// Workspace (Fase 6) — dual-tab Performance/Development.
// Performance (Fase 4): Goal → KPI Area → Strategy → Initiative, + Initiative Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Initiative → Action Plan.
// UI-N-003 (Stage 1 B′): tree 3-level inline — KPI Area & Problem Statement EXPANDABLE
//   ke level-3 (Strategy / Initiative) untuk turunkan tap-count Goal→Strategy dari 3 → 1.
// Fetch independen per tab (DT-6: error satu tab tidak memblok tab lain). Tab Performance default.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
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
  TabBar,
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
        left: -10,
        top: -10,
        width: 10,
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

// WSA-20 (spec §12.1.4) — tap badan card → toast edukasi non-blocking (BUKAN Alert modal).
// Toast di-host per-pane (WorkspaceToastHost) & dipicu lewat context agar row terdalam tak perlu
// prop-drilling. Timer di-clear saat unmount → tak ada setState pasca-unmount (aman di jest).
const ToastContext = createContext<(message: string) => void>(() => {});

/**
 * Host toast Workspace — overlay bawah non-interaktif. `show(msg)` menampilkan pesan 2.6s lalu
 * auto-hilang. Timer ref di-clear di cleanup effect (unmount) sehingga tidak ada setState setelah
 * unmount (cegah act-warning + kebocoran antar-test).
 */
function WorkspaceToastHost({ children }: PropsWithChildren) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `mounted` guard: auto-dismiss timer di-clear saat unmount, DAN callback jadi no-op bila sudah
  // unmount. Tanpa ini, timer 2.6s bisa memanggil setState pasca-unmount → act-warning yang
  // mencemari test lain (persis kerapuhan yang jadi alasan WSA-20 sempat ditunda).
  const mounted = useRef(true);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    const handle = setTimeout(() => {
      if (mounted.current) setMessage(null);
    }, 2600);
    // Node/jest: unref agar timer tak menahan worker exit (warning "active timers"); no-op di RN
    // (setTimeout mengembalikan number). Safety net; unmount tetap clear via cleanup effect.
    (handle as { unref?: () => void }).unref?.();
    timer.current = handle;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <View className="flex-1">
        {children}
        {message ? (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={{ position: 'absolute', left: 16, right: 16, bottom: 24, alignItems: 'center' }}>
            <View
              style={{
                maxWidth: 520,
                borderRadius: 12,
                backgroundColor: '#0f172a',
                paddingVertical: 10,
                paddingHorizontal: 14,
              }}>
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                {message}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

/**
 * WSA-20 — "badan card" (pill + judul + orb): tap → toast edukasi (§12.1.4) yang MENGARAHKAN user ke
 * tombol Detail. Tap-target = Pressable overlay absolut DI ATAS baris konten (bukan pembungkus/ancestor).
 * Alasan: kalau Pressable membungkus konten, `fireEvent.press` pada teks judul akan mem-bubble ke
 * Pressable dan membocorkan kerja async pressed-state antar-test (overlapping act). Sebagai overlay
 * sibling, teks judul tak punya handler (tap judul = no-op di test, seperti baseline), sedangkan di
 * device tap area badan mengenai overlay. Aksi turunan (Detail/⋯/+/panah) berada di luar wrapper.
 */
function TreeCardBody({ cardLabel, children }: { cardLabel: string; children: ReactNode }) {
  const show = useContext(ToastContext);
  return (
    <View style={{ position: 'relative' }}>
      <View className="flex-row items-start gap-3">{children}</View>
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        accessibilityRole="button"
        accessibilityLabel={`Isi card ${cardLabel}`}
        onPress={() => show(WS_COPY.bodyTapHint)}
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
  onDetail: () => void;
  detailLabel: string;
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
            borderColor: (addDimmed ?? past) ? '#e2e8f0' : '#cce2ff',
            backgroundColor: (addDimmed ?? past) ? '#f1f5f9' : '#eef6ff',
          }}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? 'Tambah turunan'}
          accessibilityState={{ disabled: addDimmed ?? past }}
          onPress={() =>
            onAddPress ? onAddPress() : past ? showPastPeriodAlert(cardLabel) : onAdd?.()
          }>
          <Text style={{ color: (addDimmed ?? past) ? '#94a3b8' : '#145ebc', fontSize: 12, fontWeight: '900' }}>
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
        <TreeCardBody cardLabel={strategy.name}>
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
          onDetail={() => router.push(`/strategy/${strategy.id}` as Href)}
          detailLabel={`Buka detail ${strategy.name}`}
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
        <TreeCardBody cardLabel={kpi.name}>
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
        <TreeCardBody cardLabel={goal.name}>
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
        <TreeCardBody cardLabel={item.name}>
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
        {/* Action Plan = leaf: tanpa panah/+ (spec §6.8). Hanya Detail + ⋯. */}
        <View className="flex-row items-center justify-end gap-2">
          <Pressable
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={{ height: 30, borderRadius: 999, backgroundColor: '#1877f2', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Buka detail ${item.name}`}
            onPress={() => router.push(`/action-plan/${item.id}` as Href)}>
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
        <TreeCardBody cardLabel={item.name}>
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
          onDetail={() => router.push(`/initiative/${item.id}` as Href)}
          detailLabel={`Buka detail ${item.name}`}
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
        <TreeCardBody cardLabel={ps.name}>
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
        <TreeCardBody cardLabel={devArea.name}>
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
  const canCreate = can('create_goal');

  useFocusEffect(
    useCallback(() => {
      goalsQ.refetch();
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

  // WSA-16 — section "Initiative Tanpa Goal" dihapus dari pane (di luar spec §6). Initiative
  // yatim tetap dapat diakses lewat Search (route /search) & Menu; pane fokus ke hierarki Goal.

  const goalsData = goalsQ.isLoading || goalsQ.isError ? [] : goalsQ.goals;
  const showEmpty = !goalsQ.isLoading && !goalsQ.isError && goalsQ.goals.length === 0;

  // WSA-15 — orb capaian Goal root: 1 RPC untuk semua Goal terlihat (bukan per row).
  const { progressOf: goalProgressOf } = useCardProgress(goalsData.map((g) => g.id));
  const renderItem = ({ item: goal }: { item: GoalWithKpiCount }) => (
    <GoalRow goal={goal} progress={goalProgressOf(goal.id)} />
  );

  return (
    <WorkspaceToastHost>
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
          renderItem={renderItem}
        />
      </View>
    </WorkspaceToastHost>
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

  // WSA-15 — orb capaian Development Area root: 1 RPC untuk semua DA terlihat.
  const { progressOf: devProgressOf } = useCardProgress(devData.map((d) => d.id));
  const renderItem = ({ item: d }: { item: DevelopmentAreaWithProblemCount }) => (
    <DevelopmentAreaRow devArea={d} progress={devProgressOf(d.id)} />
  );

  return (
    <WorkspaceToastHost>
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
    </WorkspaceToastHost>
  );
}

// WSA-19 — pane Workspace kini route deep-linkable di dalam nested stack tab (bukan state lokal).
// "Masuk" MENAVIGASI ke `/workspace/performance` · `/workspace/development`; tab bar tetap terlihat
// (pane hidup di bawah tab Workspace) dan back gesture kembali ke hub (index anchor via _layout).

/** Navigasi balik ke hub: back bila ada history, else replace ke index (kasus deep-link langsung). */
function useBackToHub() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/workspace' as Href);
  }, [router]);
}

/** Route index `/workspace` — Hub (lobby). Tap "Masuk" → push pane deep-linkable. */
export function HubScreen() {
  const router = useRouter();
  return <HubView onSelect={(t) => router.push(`/workspace/${t}` as Href)} />;
}

/** Route `/workspace/performance` — pane Performance. */
export function PerformanceScreen() {
  const router = useRouter();
  const onBackToHub = useBackToHub();
  const onTabChange = (t: Tab) => {
    if (t === 'development') router.replace('/workspace/development' as Href);
  };
  return <PerformancePane tab="performance" onTabChange={onTabChange} onBackToHub={onBackToHub} />;
}

/** Route `/workspace/development` — pane Development. */
export function DevelopmentScreen() {
  const router = useRouter();
  const onBackToHub = useBackToHub();
  const onTabChange = (t: Tab) => {
    if (t === 'performance') router.replace('/workspace/performance' as Href);
  };
  return <DevelopmentPane tab="development" onTabChange={onTabChange} onBackToHub={onBackToHub} />;
}
