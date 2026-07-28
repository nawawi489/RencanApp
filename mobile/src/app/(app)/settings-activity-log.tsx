// Fase 8 — Settings > Activity Log (read-only, append-only di DB). Gated view_activity_log.
// UI-S-AL1: search + filter chip + grouping per-hari.
// UX pass 2026-07-17:
//   - Virtualisasi via SectionList (bukan ScrollView) — daftar panjang tetap enteng.
//   - Infinite scroll (onEndReached) memuat 30 entri per halaman lewat useInfiniteQuery.
//   - Filter chip & pencarian dipush ke server → hasil tak terbatas halaman yg sudah dimuat.
//   - Pencarian di-debounce 300ms agar tidak spam query per keystroke.
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, TextInput } from 'react-native';
import { Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { EmptyState, ErrorState, SkeletonList, TabBar, usePlaceholderColor } from '@/components/ui';
import { useActivityLog } from '@/hooks/use-activity-governance';
import { useProfile } from '@/hooks/use-profile';
import type { ActivityLog, ActivityLogChipKey } from '@/lib/activity-governance';
import { activityLogActionLabel } from '@/lib/activity-governance';
import { personLabel } from '@/lib/cards';

const LIST_CONTENT_STYLE = { padding: 20, gap: 8, paddingBottom: 40 };

const ENTITY_LABEL: Record<string, string> = {
  goal: 'Goal',
  kpi_area: 'KPI Area',
  strategy: 'Strategi',
  initiative: 'Initiative',
  action_plan: 'Action Plan',
  task: 'Task',
  task_instance: 'Instance Tugas',
  development_area: 'Development Area',
  problem_statement: 'Problem Statement',
  score_formula_version: 'Formula Skor',
  minimum_breakdown_rule: 'Aturan Breakdown Minimum',
  settings: 'Pengaturan',
  organization: 'Organisasi',
  department: 'Departemen',
  team: 'Tim',
  profile: 'Profil',
  user_permission: 'Hak Akses',
  role_template: 'Template Peran',
  period: 'Periode',
  score_override: 'Override Skor',
  confidential_access_rule: 'Aturan Akses Rahasia',
  governance_violation: 'Pelanggaran Governance',
  chat_message: 'Pesan Chat',
  chat_room: 'Ruang Chat',
  notification_rule: 'Aturan Notifikasi',
};

function humanizeEntity(t: string | null | undefined): string {
  if (!t) return '—';
  if (ENTITY_LABEL[t]) return ENTITY_LABEL[t];
  return t
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const CHIP_DEFS: { key: ActivityLogChipKey; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'create', label: 'Dibuat' },
  { key: 'update', label: 'Diubah' },
  { key: 'archive_cancel', label: 'Arsip/Batal' },
  { key: 'review', label: 'Review' },
  { key: 'periode', label: 'Periode/Skor' },
  { key: 'permission', label: 'Permission' },
];

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function dateKey(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateGroupLabel(key: string, today: Date): string {
  if (key === '—') return 'Tanpa tanggal';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  const dt = new Date(y, m - 1, d);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((t.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Debounce nilai — mencegah query berubah tiap keystroke saat user mengetik pencarian. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function SettingsActivityLogScreen() {
  const { can } = useProfile();
  const allowed = can('view_activity_log');
  const placeholderColor = usePlaceholderColor();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<ActivityLogChipKey>('semua');
  const qDebounced = useDebouncedValue(q, 300);

  const {
    logs,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useActivityLog(allowed ? { q: qDebounced, chip } : undefined);

  /** Grup entri per-hari, mempertahankan urutan desc dari server. */
  const sections = useMemo(() => {
    const groups: { key: string; title: string; data: ActivityLog[] }[] = [];
    const today = new Date();
    for (const log of logs) {
      const key = dateKey(log.created_at);
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, title: dateGroupLabel(key, today), data: [] };
        groups.push(g);
      }
      g.data.push(log);
    }
    return groups;
  }, [logs]);

  if (!allowed) {
    return (
      <View className="flex-1 bg-neutral-50 p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Log Aktivitas' }} />
        <AccessDenied message="Activity Log hanya untuk pemegang izin Lihat Activity Log." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Log Aktivitas' }} />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={LIST_CONTENT_STYLE}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <View className="gap-1">
              <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Log Aktivitas</Text>
              <Text className="text-base text-neutral-500 dark:text-neutral-400">
                Riwayat perubahan yang tercatat sistem.
              </Text>
            </View>
            <TextInput
              accessibilityLabel="Cari activity log"
              placeholder="Cari aksi / entity (mis. goal, archive)…"
              placeholderTextColor={placeholderColor}
              value={q}
              onChangeText={setQ}
              className="min-h-[44px] rounded-xl border border-neutral-300 bg-white px-4 text-base text-black dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
            <TabBar
              tabs={CHIP_DEFS.map((c) => ({ key: c.key, label: c.label }))}
              active={chip}
              onChange={setChip}
              showsScrollIndicator
            />
            {isLoading ? null : logs.length > 0 ? (
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Menampilkan {logs.length} entri{hasNextPage ? '+' : ''} (append-only — tidak dapat
                diubah atau dihapus).
              </Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View className="pb-1 pt-3">
            <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const actorLabel = item.actor_id
            ? personLabel(item.actor ?? null, 'Pengguna')
            : 'Sistem';
          return (
            <View
              className={`gap-0.5 border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950 ${
                isFirst ? 'rounded-t-2xl' : ''
              } ${isLast ? 'rounded-b-2xl' : 'border-b-0'}`}>
              <View className="flex-row items-start justify-between gap-3">
                <Text className="flex-1 text-sm font-semibold text-black dark:text-white">
                  {activityLogActionLabel(item.action)}
                </Text>
                <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {formatTime(item.created_at)}
                </Text>
              </View>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                {humanizeEntity(item.entity_type)}
                {' · '}
                {actorLabel}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList count={5} />
          ) : isError ? (
            // S4-6 — sebelumnya fetch gagal jatuh ke EmptyState "Belum ada aktivitas",
            // membuat admin percaya log kosong dan menutup insiden tanpa jejak.
            <ErrorState
              title="Gagal memuat log aktivitas"
              description="Tidak bisa mengambil riwayat aktivitas organisasi. Periksa koneksi lalu coba lagi."
              onRetry={() => refetch()}
            />
          ) : (
            <EmptyState
              title={qDebounced || chip !== 'semua' ? 'Tidak ada yang cocok' : 'Belum ada aktivitas'}
              description={
                qDebounced || chip !== 'semua'
                  ? 'Hapus pencarian / ubah filter untuk melihat semua aktivitas.'
                  : 'Aktivitas organisasi akan tampil di sini.'
              }
            />
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-4" accessibilityLabel="Memuat lebih banyak">
              <ActivityIndicator />
            </View>
          ) : !hasNextPage && logs.length > 0 ? (
            <Text className="pt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
              — akhir riwayat —
            </Text>
          ) : null
        }
      />
    </View>
  );
}
