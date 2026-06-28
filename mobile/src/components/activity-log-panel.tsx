// UI-G-002 — Panel "Log Aktivitas" sistemik (collapsible) di setiap layar detail.
// Membaca `activity_logs` per (entity_type, entity_id) — RLS sudah append-only & org-scoped.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';

import { SectionCard, SkeletonList } from '@/components/ui';
import { useEntityActivityLog } from '@/hooks/use-activity-governance';

/** Label aksi human-readable (cocok dgn ENUM action di DB). */
const ACTION_LABEL: Record<string, string> = {
  create: 'Dibuat',
  update: 'Diubah',
  activate: 'Diaktifkan',
  card_archived: 'Diarsipkan',
  card_cancelled: 'Dibatalkan',
  card_restored: 'Dipulihkan',
  cancellation_requested: 'Pengajuan Pembatalan',
  cancellation_approved: 'Pembatalan Disetujui',
  deadline_change_requested: 'Pengajuan Perubahan Deadline',
  deadline_change_approved: 'Perubahan Deadline Disetujui',
  deadline_change_rejected: 'Perubahan Deadline Ditolak',
  evaluation_recorded: 'Evaluasi Dicatat',
  submission_created: 'Bukti Diserahkan',
  submission_reviewed: 'Bukti Direview',
  target_breakdown_updated: 'Target Breakdown Diubah',
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Panel "Log Aktivitas" collapsible untuk satu entity card.
 * Default collapsed — fetch hanya saat user expand (lazy via `enabled`).
 * `maxItems` membatasi tampilan (sisanya bisa dilihat di `/settings-activity-log`).
 */
export function ActivityLogPanel({
  entityType,
  entityId,
  maxItems = 10,
}: {
  entityType: string;
  entityId: string | null | undefined;
  maxItems?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { logs, isLoading, isError } = useEntityActivityLog(entityType, entityId, expanded);

  if (!entityId) return null;
  const shown = logs.slice(0, maxItems);
  const truncated = logs.length > maxItems;

  return (
    <SectionCard>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Tutup Log Aktivitas' : 'Buka Log Aktivitas'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        className="min-h-[44px] flex-row items-center justify-between gap-2 active:opacity-70">
        <Text className="text-base font-semibold text-black dark:text-white">Log Aktivitas</Text>
        <Text className="text-sm text-brand-dark">{expanded ? 'Tutup ▾' : 'Buka ▸'}</Text>
      </Pressable>

      {expanded ? (
        isLoading ? (
          <SkeletonList count={2} />
        ) : isError ? (
          <Text className="text-sm text-red-600" accessibilityRole="alert">
            Gagal memuat log aktivitas.
          </Text>
        ) : shown.length === 0 ? (
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            Belum ada aktivitas tercatat untuk item ini.
          </Text>
        ) : (
          <View className="gap-2">
            {shown.map((log) => (
              <View
                key={log.id}
                className="gap-0.5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-sm font-medium text-black dark:text-white">
                    {ACTION_LABEL[log.action] ?? log.action}
                  </Text>
                  <Text className="text-[11px] text-neutral-400">
                    {formatTimestamp(log.created_at)}
                  </Text>
                </View>
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  {log.actor_id ? 'Oleh pengguna' : 'Oleh sistem'}
                </Text>
              </View>
            ))}
            {truncated ? (
              <Text className="px-1 text-xs text-neutral-400">
                {logs.length - maxItems} entri lain tersembunyi — buka Activity Log di Pengaturan untuk
                melihat semua.
              </Text>
            ) : null}
          </View>
        )
      ) : null}
    </SectionCard>
  );
}
