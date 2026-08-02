// Workspace (Fase 6) — Performance & Development sebagai route deep-linkable.
// Performance (Fase 4): Goal → Strategi → Inisiatif → Rencana Aksi, + Rencana Aksi Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Rencana Aksi → Tugas.
// UI-N-003 (Stage 1 B′): tree 3-level inline — Strategi & Problem Statement EXPANDABLE
//   ke level-3 (Inisiatif / Rencana Aksi) untuk turunkan tap-count Goal→Inisiatif dari 3 → 1.
// Perpindahan pane dilakukan via Hub (Kembali di AppHeader → Masuk ruang lain) — TIDAK ada
// TabBar internal di pane agar tidak duplikasi navigasi hub-card lobby.
import Ionicons from '@expo/vector-icons/Ionicons';
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
  type Tone,
} from '@/components/ui';
import { PeriodSwitcher } from '@/components/period-switcher';
import {
  useCardProgress,
  useDevelopmentAreas,
  useGoals,
  useActionPlanTasks,
  useStrategies,
  useProblemStatements,
  useProblemStatementActionPlans,
  useInitiatives,
  useInitiativeActionPlans,
} from '@/hooks/use-workspace';
import { taskTreeProgress, treeOrbLabel } from '@/lib/progress';
import { useProfile } from '@/hooks/use-profile';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useArchiveActions } from '@/hooks/use-governance-admin';
import { mbrBreakdownGuardMessage } from '@/lib/activation-check';
import { isMbrCascadeBlocked } from '@/lib/mbr-cascade';
import { CARD_TYPE_LABEL, type CardType, type MbrCompliance } from '@/lib/settings-mbr';
import type { CardEntityType } from '@/lib/governance-admin';
import { ENTITY_ROUTE_SEGMENT } from '@/lib/entity-routes';
import { alertFriendlyError } from '@/lib/errors';
import type { RowAction } from '@/components/row-actions-menu';
import { PLANNING_STATUS_LABEL, kpiCountOf, type GoalWithKpiCount } from '@/lib/goals';
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  STATUS_TONE,
  type TaskWithPeople,
  type ActionPlan,
} from '@/lib/cards';
import type { Strategi } from '@/lib/strategies';
import type { Inisiatif } from '@/lib/initiatives';
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
  overlapsFocusYear,
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

// Tree merender status dari beberapa jenis kartu: planning (goal/kpi/action-plan/dev-area/PS),
// action_plan, dan action plan (execution). PLANNING_STATUS_LABEL saja bocorkan enum mentah
// (mis. `in_progress`) untuk Tugas → gabung ketiga map (nilai konsisten, tanpa konflik).
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
 * Kolom kanan card tree (spec §6.4–6.8 / §10, WSA-15): progress orb 50px + label bawah.
 * `isMeasured` drives label: Goal/Strategy+measured→"Capaian", else "Progress" (P1 attainment).
 * `value` null → '—' (belum ter-fetch / error / RLS tak terlihat / AP repeat tanpa compliance).
 */
function TreeOrbCell({
  kind,
  value,
  isMeasured = false,
  compact = false,
}: {
  kind: string;
  value: number | null;
  isMeasured?: boolean;
  compact?: boolean;
}) {
  const label = treeOrbLabel(kind, isMeasured);
  if (value == null) {
    return (
      <View style={{ width: compact ? 38 : 50 }} className="items-center justify-center py-0.5">
        <Text className="text-base font-bold text-neutral-400 dark:text-neutral-500" accessibilityLabel={`${label} belum tersedia`}>
          —
        </Text>
      </View>
    );
  }
  return <TreeProgressOrb value={value} label={label} compact={compact} />;
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

/**
 * Baris pill header untuk kartu tree: [jenis card] [periode] (+ [status] bila non-Aktif).
 * Status card ("Draft", "Selesai", "Diarsipkan", dst.) dirender sbg badge ketiga agar terlihat
 * jelas di scan visual dan tidak bentrok makna dgn kata "Aktif"/periode di baris meta.
 * "Aktif" implisit — tak dirender sbg badge (mengurangi noise; default paling umum).
 */
function CompactHeaderPills({
  kind,
  periodLabel,
  statusLabel,
  statusTone,
  cardLabel,
}: {
  kind: WorkspaceKind;
  periodLabel: string;
  /** Label status siklus-hidup (mis. "Draft", "Selesai", "Diarsipkan"). Kosongkan bila status = 'active'. */
  statusLabel?: string;
  statusTone?: Tone;
  /** Nama kartu — dipakai utk a11y label badge status agar screen reader menyebut konteksnya. */
  cardLabel?: string;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <WorkspaceKindPill kind={kind} />
      <Badge label={periodLabel} tone="neutral" />
      {statusLabel ? (
        <View
          accessibilityRole="text"
          accessibilityLabel={cardLabel ? `Status ${cardLabel}: ${statusLabel}` : `Status: ${statusLabel}`}>
          <Badge label={statusLabel} tone={statusTone ?? 'neutral'} />
        </View>
      ) : null}
    </View>
  );
}

/** Bantu render badge status hanya utk status non-Aktif (active implisit → tak render badge). */
function statusPillProps(status: string): { statusLabel?: string; statusTone?: Tone } {
  if (!status || status === 'active') return {};
  const label = TREE_STATUS_LABEL[status] ?? status;
  return { statusLabel: label, statusTone: STATUS_TONE[status] ?? 'neutral' };
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
  /** WSA-17 — teks TERLIHAT tombol tambah, mis. "+ Strategi" (spec §11). */
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
 * Props cascade MBR yang dipakai setiap sub-row ber-tombol-tambah (BL-04).
 * Aturan `X → Y` menahan tombol di kartu `Y` yang membuat `Z`; jadi yang diteruskan ke bawah adalah
 * kepatuhan INDUK (`X`), bukan kepatuhan kartu itu sendiri. Lihat `lib/mbr-cascade.ts`.
 */
type MbrCascadeProps = {
  /** Kepatuhan kartu induk (`X`). Undefined → fail-open (tombol normal). */
  parentCompliance?: MbrCompliance;
  /** Jenis kartu induk (`X`) — hanya untuk kalimat guard. Penamaan sekarang, bukan alias legacy. */
  parentCardType: CardType;
};

/**
 * Sub-row level 3: Inisiatif di bawah satu Strategi. WSA-01: expandable → Rencana Aksi (level 4).
 * "+ Rencana Aksi" gated `create_action_plan`, past-period lock, guard MBR strategy→initiative.
 */
const InitiativeSubRow = memo(function InitiativeSubRow({
  initiative,
  parentCompliance,
  parentCardType,
  progress,
}: MbrCascadeProps & {
  initiative: Inisiatif;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { action_plans, isLoading, isError, refetch } = useInitiativeActionPlans(initiative.id, expanded);
  const actionPlanIds = useMemo(
    () => (expanded ? action_plans.map((i) => i.id) : EMPTY_IDS),
    [expanded, action_plans],
  );
  const { progressOf: initProgressOf } = useCardProgress(actionPlanIds);
  // BL-04 — kepatuhan initiative→action_plan milik Inisiatif ini; diteruskan ke Rencana Aksi anak
  // untuk menjaga tombol "+ Plan" (cucu = Tugas). Fetch hanya saat expanded.
  const { compliance: ownCompliance } = useMbrCompliance(expanded ? 'initiative' : '', initiative.id);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(initiative, focus, now);
  const canAddInit = can('create_action_plan');
  const rowActions = useTreeRowActions('initiative', initiative.id, initiative.name);
  const periodLabel = treePeriodPillLabel(initiative, focus);
  const metaLines = WS_TREE_COMPACT_COPY.initiativeMeta({
    past,
    contribution: initiative.contribution_pct == null ? null : `${initiative.contribution_pct}%`,
    risk: initiative.main_risk,
  });
  const initiativeStatusPill = statusPillProps(initiative.status);
  // WSA-04 — guard MBR: fail-open saat data belum ada (undefined); hanya mode blokir_akses_turunan
  // yang menahan tombol (BL-04 — sebelumnya mode apa pun ikut menahan asal non-compliant).
  const mbrGuarded = isMbrCascadeBlocked(parentCompliance);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/initiative/${initiative.id}`),
    [router, initiative.id],
  );
  const retryChildren = useCallback(() => refetch(), [refetch]);
  const onAddActionPlan = useCallback(() => {
    if (mbrGuarded && parentCompliance) {
      const { title, message } = mbrBreakdownGuardMessage(
        CARD_TYPE_LABEL[parentCardType],
        parentCompliance,
        'Rencana Aksi',
      );
      Alert.alert(title, message);
      return;
    }
    if (past) {
      showPastPeriodAlert();
      return;
    }
    router.push(`/action-plan/new?initiativeId=${initiative.id}`);
  }, [mbrGuarded, parentCompliance, parentCardType, past, router, initiative.id]);
  // Tombol redup bila past ATAU ter-guard MBR (spec §11: tetap terlihat, tapi redup).
  const addDimmed = past || mbrGuarded;

  return (
    <View>
      <View
        className="gap-2"
        style={{ marginLeft: TREE_LEVEL_INDENT[3] }}>
        {/* Spec §6.6 + §8: level-3 (indent 20px), border kiri 5px warna Inisiatif (#6941c6). */}
        <View
          className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.initiative }}>
          <TreeCardBody cardLabel={initiative.name} onPress={openDetail} overlayRightInset={52}>
            <View className="flex-1 gap-1.5">
              <CompactHeaderPills kind="initiative" periodLabel={periodLabel} cardLabel={initiative.name} {...initiativeStatusPill} />
              <Text
                className="text-sm font-medium text-black dark:text-white"
                numberOfLines={2}
                accessibilityLabel={`Inisiatif ${initiative.name}`}>
                {initiative.name}
              </Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="initiative" value={progress} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Rencana Aksi ${initiative.name}`}
                onPress={toggleExpanded}
              />
            </View>
          </TreeCardBody>
          <CompactActionRow
            cardLabel={initiative.name}
            detailLabel={`Detail ${initiative.name}`}
            onDetail={openDetail}
            onMore={openMenu}
            past={past}
            onAddPress={canAddInit ? onAddActionPlan : undefined}
            addDimmed={addDimmed}
            addLabel={`Tambah Rencana Aksi ke ${initiative.name}`}
            addButtonLabel="+ Rencana Aksi"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : action_plans.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Rencana Aksi. Tambah Rencana Aksi untuk eksekusi Inisiatif ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[4] - 10} />
              {action_plans.map((i) => (
                <ActionPlanSubRow
                  key={i.id}
                  item={i}
                  parentCompliance={ownCompliance}
                  parentCardType="initiative"
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
        title={initiative.name}
        items={rowActions}
      />
    </View>
  );
});

/**
 * Sub-row level 2: Strategi di bawah satu Goal. Expandable → Inisiatif children.
 * Lazy fetch Inisiatif hanya saat `expanded` (parameter `enabled` di useInitiatives).
 */
const StrategySubRow = memo(function StrategySubRow({
  kpi,
  parentCompliance,
  parentCardType,
  progress,
  isMeasured = false,
}: MbrCascadeProps & {
  kpi: Strategi;
  progress: number | null;
  isMeasured?: boolean;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { initiatives, isLoading, isError, refetch } = useInitiatives(kpi.id, expanded);
  const initiativeIds = useMemo(
    () => (expanded ? initiatives.map((s) => s.id) : EMPTY_IDS),
    [expanded, initiatives],
  );
  const { progressOf: stratProgressOf } = useCardProgress(initiativeIds);
  // WSA-04 — guard MBR: fetch kepatuhan strategy→initiative hanya saat expanded (parentType ''
  // menonaktifkan query di useMbrCompliance). Diteruskan ke InitiativeSubRow untuk guard "+ Rencana Aksi".
  const { compliance: mbrCompliance } = useMbrCompliance(expanded ? 'strategy' : '', kpi.id);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(kpi, focus, now);
  const canAddInitiative = can('create_initiative'); // WSA-13 — key presisi (bukan proxy create_strategy)
  const rowActions = useTreeRowActions('strategy', kpi.id, kpi.name);
  const periodLabel = treePeriodPillLabel(kpi, focus);
  const metaLines = WS_TREE_COMPACT_COPY.kpiMeta({
    past,
    target: kpi.target,
    outcome: kpi.expected_outcome,
  });
  const kpiStatusPill = statusPillProps(kpi.status);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/strategy/${kpi.id}`),
    [router, kpi.id],
  );
  // BL-04 — cascade goal→strategy: Goal yang belum cukup Strategi mengunci "+ Inisiatif" di setiap
  // Strategi miliknya (bukan mengunci pembuatan Strategi itu sendiri — lihat mbr-cascade.ts).
  const mbrGuarded = isMbrCascadeBlocked(parentCompliance);
  const addInitiative = useCallback(() => {
    if (mbrGuarded && parentCompliance) {
      const { title, message } = mbrBreakdownGuardMessage(
        CARD_TYPE_LABEL[parentCardType],
        parentCompliance,
        'Inisiatif',
      );
      Alert.alert(title, message);
      return;
    }
    if (past) {
      showPastPeriodAlert();
      return;
    }
    router.push(`/initiative/new?strategyId=${kpi.id}`);
  }, [mbrGuarded, parentCompliance, parentCardType, past, router, kpi.id]);
  const retryChildren = useCallback(() => refetch(), [refetch]);

  return (
    <View>
      <View
        className="gap-2"
        style={{ marginLeft: TREE_LEVEL_INDENT[2] }}>
        {/* Spec §6.5 + §8: level-2 (indent 16px), border kiri 5px warna Strategi (#b76b00). */}
        <View
          className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.strategy }}>
          <TreeCardBody cardLabel={kpi.name} onPress={openDetail} overlayRightInset={52}>
            <View className="flex-1 gap-1.5">
              <CompactHeaderPills kind="strategy" periodLabel={periodLabel} cardLabel={kpi.name} {...kpiStatusPill} />
              <Text className="text-sm font-medium text-black dark:text-white" numberOfLines={2}>
                {kpi.name}
              </Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="strategy" value={progress} isMeasured={isMeasured} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Inisiatif ${kpi.name}`}
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
            onAddPress={canAddInitiative ? addInitiative : undefined}
            addDimmed={past || mbrGuarded}
            addLabel={`Tambah Inisiatif ke ${kpi.name}`}
            addButtonLabel="+ Inisiatif"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : initiatives.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Inisiatif. Tambah Inisiatif untuk pecah Strategi ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[3] - 10} />
              {initiatives.map((s) => (
                <InitiativeSubRow
                  key={s.id}
                  initiative={s}
                  parentCompliance={mbrCompliance}
                  parentCardType="strategy"
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
  isMeasured = false,
}: {
  goal: GoalWithKpiCount;
  progress: number | null;
  isMeasured?: boolean;
}) {
  const router = useRouter();
  const { can, profile } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // UI-S-W07: destrukturisasi state fetch penuh — expand tanpa skeleton/empty/error
  // terasa seperti tombol mati (paritas dgn StrategySubRow level-2).
  const { strategies, isLoading, isError, refetch } = useStrategies(goal.id, expanded);
  const { focus, now } = usePeriodFocus();
  // WSA-15 — orb capaian anak (Strategi) di level kontainer (1 RPC per Goal expanded, bukan per row).
  const kpiIds = useMemo(() => (expanded ? strategies.map((k) => k.id) : EMPTY_IDS), [expanded, strategies]);
  const { progressOf: kpiProgressOf, measuredOf: kpiMeasuredOf } = useCardProgress(kpiIds);
  // BL-04 — kepatuhan goal→strategy; menjaga "+ Inisiatif" di Strategi anak. Fetch hanya saat expanded.
  const { compliance: mbrCompliance } = useMbrCompliance(expanded ? 'goal' : '', goal.id);

  const count = kpiCountOf(goal);
  const past = isAddLocked(goal, focus, now);
  // WSA-13 — key presisi (bukan proxy create_strategy) + jalur PIC-Goal, mirror policy
  // strategies_insert (0010): has_permission('create_kpi_area') OR is_goal_pic(goal_id).
  // K4 (0010): create_kpi_area BUKAN default management/c_level. Proxy create_strategy sebelumnya
  // salah dua arah: (a) manager tanpa grant sempat lihat tombol lalu server tolak (drift bisa
  // muncul kalau MGR_DEFAULT_KEYS berubah), dan (b) manager yang JADI PIC Goal — server izinkan —
  // TIDAK melihat tombol.
  const canAddKpi = can('create_kpi_area') || (profile?.id != null && goal.pic_id === profile.id);
  const rowActions = useTreeRowActions('goal', goal.id, goal.name);
  const periodLabel = treePeriodPillLabel(goal, focus);
  const metaLines = WS_TREE_COMPACT_COPY.goalMeta({
    past,
    // Kolom tabel `goals` bernama `target_value` (bukan `target_result` — itu milik `action_plans`).
    // Referensi lama menghasilkan `undefined` → target Goal tak pernah tampil di tree meta.
    target: goal.target_value,
  });
  const goalStatusPill = statusPillProps(goal.status);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(() => router.push(`/goal/${goal.id}`), [router, goal.id]);
  const addKpi = useCallback(
    () => router.push(`/strategy/new?goalId=${goal.id}`),
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
                <CompactHeaderPills kind="goal" periodLabel={periodLabel} cardLabel={goal.name} {...goalStatusPill} />
                <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={2}>{goal.name}</Text>
                <CompactMeta lines={metaLines} />
              </View>
              <View className="items-center gap-1">
                <TreeOrbCell kind="goal" value={progress} isMeasured={isMeasured} compact />
                <TreeToggleButton
                  expanded={expanded}
                  label={`Toggle Strategi ${goal.name}`}
                  onPress={toggleExpanded}
                />
              </View>
            </TreeCardBody>

            <ExpandChildCount
              label={count === 0 ? 'Belum ada KPI' : WS_TREE_COMPACT_COPY.needChild(count, 'Strategi')}
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
              addLabel={`Tambah Strategi ke ${goal.name}`}
              addButtonLabel="+ Strategi"
            />
          </SectionCard>
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : strategies.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Strategi. Tambah Strategi untuk pecah Goal ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[2] - 10} />
              {strategies.map((k) => (
                <StrategySubRow
                  key={k.id}
                  kpi={k}
                  parentCompliance={mbrCompliance}
                  parentCardType="goal"
                  progress={kpiProgressOf(k.id)}
                  isMeasured={kpiMeasuredOf(k.id)}
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
 * Sub-row Tugas — level TERBAWAH (spec §6.8/§7.5): tanpa panah, tanpa tombol tambah.
 * Hanya Detail + ⋯. `level` menentukan indent (5 di Performance, 4 di Development).
 */
const TaskSubRow = memo(function TaskSubRow({
  item,
  level,
}: {
  item: TaskWithPeople;
  level: 4 | 5;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(item, focus, now);
  const rowActions = useTreeRowActions('task', item.id, item.name);
  const periodLabel = treePeriodPillLabel(item, focus);
  const metaLines = WS_TREE_COMPACT_COPY.taskMeta({
    past,
    deadline: compactDate(item.deadline ?? item.start_date),
    reviewer: item.reviewer?.full_name,
  });
  const taskStatusPill = statusPillProps(item.status);
  // WSA-15 — orb AP leaf dihitung KLIEN (bukan RPC): status-based (one_time) via progress.ts.
  // Repeat AP butuh Repeat Compliance yg tak ter-fetch di baris ini → null → '—' (bukan 0% palsu).
  const orbValue = taskTreeProgress({ status: item.status, repeatSetting: item.repeat_setting });
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/task/${item.id}`),
    [router, item.id],
  );

  return (
    <View>
      <View
        className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.task, marginLeft: TREE_LEVEL_INDENT[level] }}>
        <TreeCardBody cardLabel={item.name} onPress={openDetail}>
          <View className="flex-1 gap-1.5">
            <CompactHeaderPills kind="task" periodLabel={periodLabel} cardLabel={item.name} {...taskStatusPill} />
            <Text
              className="text-sm font-medium text-black dark:text-white"
              numberOfLines={2}
              accessibilityLabel={`Tugas ${item.name}`}>
              {item.name}
            </Text>
            <CompactMeta lines={metaLines} />
          </View>
          <TreeOrbCell kind="task" value={orbValue} compact />
        </TreeCardBody>
        {/* Tugas = leaf: tanpa panah/+. Tetap pakai pola compact Detail + ⋯. */}
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
 * Sub-row Rencana Aksi. WSA-01: expandable → Tugas (level terbawah). Dipakai di Performance
 * (di bawah Inisiatif, level 4) dan Development (di bawah Problem Statement, level 3).
 * "+ Plan" gated `create_task`, past-period lock.
 */
const ActionPlanSubRow = memo(function ActionPlanSubRow({
  item,
  level = 4,
  parentCompliance,
  parentCardType,
  progress,
}: MbrCascadeProps & {
  item: ActionPlan;
  /** Level tree Rencana Aksi: 4 di Performance (bawah Inisiatif), 3 di Development (bawah PS). */
  level?: 3 | 4;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { tasks, isLoading, isError, refetch } = useActionPlanTasks(item.id, expanded);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(item, focus, now);
  const canAddPlan = can('create_task');
  const rowActions = useTreeRowActions('action_plan', item.id, item.name);
  const periodLabel = treePeriodPillLabel(item, focus);
  const metaLines = WS_TREE_COMPACT_COPY.actionPlanMeta({
    past,
    target: item.target_result,
  });
  const actionPlanStatusPill = statusPillProps(item.status);
  const childLevel = (level + 1) as 4 | 5;
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/action-plan/${item.id}`),
    [router, item.id],
  );
  // BL-04 — cascade initiative→action_plan (Performance) atau problem_statement→action_plan
  // (Development): induk yang belum cukup Rencana Aksi mengunci "+ Plan" di tiap Rencana Aksi-nya.
  const mbrGuarded = isMbrCascadeBlocked(parentCompliance);
  const addPlan = useCallback(() => {
    if (mbrGuarded && parentCompliance) {
      const { title, message } = mbrBreakdownGuardMessage(
        CARD_TYPE_LABEL[parentCardType],
        parentCompliance,
        'Plan',
      );
      Alert.alert(title, message);
      return;
    }
    if (past) {
      showPastPeriodAlert();
      return;
    }
    router.push(`/task/new?actionPlanId=${item.id}`);
  }, [mbrGuarded, parentCompliance, parentCardType, past, router, item.id]);
  const retryChildren = useCallback(() => refetch(), [refetch]);

  return (
    <View>
      <View
        className="gap-2"
        style={{ marginLeft: TREE_LEVEL_INDENT[level] }}>
        {/* Spec §6.7/§7.5 + §8: border kiri 5px warna Rencana Aksi (#14845c). */}
        <View
          className="gap-1.5 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderLeftWidth: 5, borderLeftColor: WORKSPACE_KIND_BORDER.action_plan }}>
          <TreeCardBody cardLabel={item.name} onPress={openDetail} overlayRightInset={52}>
            <View className="flex-1 gap-1.5">
              <CompactHeaderPills kind="action_plan" periodLabel={periodLabel} cardLabel={item.name} {...actionPlanStatusPill} />
              <Text
                className="text-sm font-medium text-black dark:text-white"
                numberOfLines={2}
                accessibilityLabel={`Rencana Aksi ${item.name}`}>
                {item.name}
              </Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="action_plan" value={progress} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Tugas ${item.name}`}
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
            onAddPress={canAddPlan ? addPlan : undefined}
            addDimmed={past || mbrGuarded}
            addLabel={`Tambah Tugas ke ${item.name}`}
            addButtonLabel="+ Plan"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : tasks.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Tugas. Tambah Tugas untuk eksekusi Rencana Aksi ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[5] - 10} />
              {tasks.map((ap) => (
                <TaskSubRow key={ap.id} item={ap} level={childLevel} />
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
 * Sub-row level 2: Problem Statement di bawah satu Development Area. Expandable → Rencana Aksi.
 * Symmetric dgn StrategySubRow di Performance pane.
 */
const ProblemStatementSubRow = memo(function ProblemStatementSubRow({
  ps,
  parentCompliance,
  parentCardType,
  progress,
}: MbrCascadeProps & {
  ps: ProblemStatement;
  progress: number | null;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { action_plans, isLoading, isError, refetch } = useProblemStatementActionPlans(ps.id, expanded);
  const actionPlanIds = useMemo(
    () => (expanded ? action_plans.map((i) => i.id) : EMPTY_IDS),
    [expanded, action_plans],
  );
  const { progressOf: initProgressOf } = useCardProgress(actionPlanIds);
  // BL-04 — kepatuhan problem_statement→action_plan milik PS ini; menjaga "+ Plan" di Rencana Aksi anak.
  const { compliance: ownCompliance } = useMbrCompliance(expanded ? 'problem_statement' : '', ps.id);
  const { focus, now } = usePeriodFocus();
  const past = isAddLocked(ps, focus, now);
  const canAddInit = can('create_action_plan');
  const rowActions = useTreeRowActions('problem_statement', ps.id, ps.name);
  const periodLabel = treePeriodPillLabel(ps, focus);
  const metaLines = WS_TREE_COMPACT_COPY.problemStatementMeta({
    past,
    impact: ps.impact,
    evidence: ps.initial_evidence,
  });
  const psStatusPill = statusPillProps(ps.status);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/problem-statement/${ps.id}`),
    [router, ps.id],
  );
  // BL-04 — cascade development_area→problem_statement: Development Area yang belum cukup Problem
  // Statement mengunci "+ Rencana Aksi" di tiap PS miliknya.
  const mbrGuarded = isMbrCascadeBlocked(parentCompliance);
  const addActionPlan = useCallback(() => {
    if (mbrGuarded && parentCompliance) {
      const { title, message } = mbrBreakdownGuardMessage(
        CARD_TYPE_LABEL[parentCardType],
        parentCompliance,
        'Rencana Aksi',
      );
      Alert.alert(title, message);
      return;
    }
    if (past) {
      showPastPeriodAlert();
      return;
    }
    router.push(`/action-plan/new?problemStatementId=${ps.id}`);
  }, [mbrGuarded, parentCompliance, parentCardType, past, router, ps.id]);
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
              <CompactHeaderPills kind="problem_statement" periodLabel={periodLabel} cardLabel={ps.name} {...psStatusPill} />
              <Text className="text-sm font-medium text-black dark:text-white" numberOfLines={2}>{ps.name}</Text>
              <CompactMeta lines={metaLines} />
            </View>
            <View className="items-center gap-1">
              <TreeOrbCell kind="problem_statement" value={progress} compact />
              <TreeToggleButton
                expanded={expanded}
                label={`Toggle Rencana Aksi ${ps.name}`}
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
            onAddPress={canAddInit ? addActionPlan : undefined}
            addDimmed={past || mbrGuarded}
            addLabel={`Tambah Rencana Aksi ke ${ps.name}`}
            addButtonLabel="+ Rencana Aksi"
          />
        </View>

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={retryChildren} />
          ) : action_plans.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Rencana Aksi. Tambah Rencana Aksi untuk eksekusi Problem Statement ini.
            </Text>
          ) : (
            <View className="gap-2" style={{ position: 'relative' }}>
              <SiblingTreeLine offsetLeft={TREE_LEVEL_INDENT[3] - 10} />
              {action_plans.map((i) => (
                <ActionPlanSubRow
                  key={i.id}
                  item={i}
                  level={3}
                  parentCompliance={ownCompliance}
                  parentCardType="problem_statement"
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
  // BL-04 — kepatuhan development_area→problem_statement; menjaga "+ Rencana Aksi" di PS anak.
  const { compliance: mbrCompliance } = useMbrCompliance(
    expanded ? 'development_area' : '',
    devArea.id,
  );

  const count = problemCountOf(devArea);
  const past = isAddLocked(devArea, focus, now);
  const canAddProblem = can('create_problem_statement'); // WSA-13 — key presisi (bukan proxy create_development_area)
  const rowActions = useTreeRowActions('development_area', devArea.id, devArea.name);
  const periodLabel = treePeriodPillLabel(devArea, focus);
  const metaLines = WS_TREE_COMPACT_COPY.developmentAreaMeta({
    past,
  });
  const devAreaStatusPill = statusPillProps(devArea.status);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openDetail = useCallback(
    () => router.push(`/development-area/${devArea.id}`),
    [router, devArea.id],
  );
  const addProblemStatement = useCallback(
    () => router.push(`/problem-statement/new?developmentAreaId=${devArea.id}`),
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
                <CompactHeaderPills kind="development_area" periodLabel={periodLabel} cardLabel={devArea.name} {...devAreaStatusPill} />
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
                <ProblemStatementSubRow
                  key={p.id}
                  ps={p}
                  parentCompliance={mbrCompliance}
                  parentCardType="development_area"
                  progress={psProgressOf(p.id)}
                />
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
          // Sprint 6 S6-5 — visual tinggi 32 tetap (compact prototype §6.3), tapi hitSlop 6
          // menaikkan touch area efektif ke 44px (DESIGN §4 rule 1). Pola sama = card-help-trigger.
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
          onPress={() => router.push('/search')}
          className="min-h-[44px] flex-row items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-950">
          <Text className="text-base text-neutral-400 dark:text-neutral-500">⌕</Text>
          <Text className="text-sm text-neutral-400 dark:text-neutral-500">
            Cari Goal, Strategi, Rencana Aksi, Tugas
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
              childStatLabel="Strategi"
              activeStatLabel="Aktif"
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
              activeStatLabel="Aktif"
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
  renderRow: (item: T, progress: number | null, isMeasured: boolean) => ReactNode;
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
  const { progressOf, measuredOf } = useCardProgress(items.map((i) => i.id));

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
          <Fragment key={item.id}>{config.renderRow(item, progressOf(item.id), measuredOf(item.id))}</Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

// WS-05 (Opsi A / PRD §11.1) — Goal & Development Area bersifat TAHUNAN: di-scope ke TAHUN fokus,
// bukan bulan/quarter. Mencegah kebocoran lintas-tahun (Goal 2025 bocor saat fokus 2026) tanpa
// menyempitkan ke sub-periode (goal tahunan tetap tampil di semua bulan dalam tahunnya). Hub lobby
// (HubView) sengaja TIDAK di-scope — ia memakai useGoals/useDevelopmentAreas langsung untuk ringkasan
// lintas-waktu, jadi hitungan hub-card tetap total (tak pecah oleh scoping pane ini).
function usePerformanceItems() {
  const q = useGoals();
  const { focus } = usePeriodFocus();
  const items = useMemo(
    () => q.goals.filter((g) => overlapsFocusYear(g, focus.year)),
    [q.goals, focus.year],
  );
  return { items, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
function useDevelopmentItems() {
  const q = useDevelopmentAreas();
  const { focus } = usePeriodFocus();
  const items = useMemo(
    () => q.developmentAreas.filter((d) => overlapsFocusYear(d, focus.year)),
    [q.developmentAreas, focus.year],
  );
  return {
    items,
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
  return <HubView onSelect={(t) => router.push(`/workspace/${t}`)} />;
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
      renderRow={(goal, progress, isMeasured) => <GoalRow goal={goal} progress={progress} isMeasured={isMeasured} />}
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
      renderRow={(d, progress, _isMeasured) => <DevelopmentAreaRow devArea={d} progress={progress} />}
    />
  );
}
