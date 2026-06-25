// Fase 8 — Settings > Activity Log (read-only, append-only di DB). Gated view_activity_log.
import { Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { EmptyState, SectionCard, SkeletonList } from '@/components/ui';
import { useActivityLog } from '@/hooks/use-activity-governance';
import { useProfile } from '@/hooks/use-profile';

const ACTION_LABEL: Record<string, string> = {
  create: 'Dibuat',
  update: 'Diubah',
  activate: 'Diaktifkan',
  card_archived: 'Diarsipkan',
  card_cancelled: 'Dibatalkan',
  cancellation_requested: 'Pengajuan Pembatalan',
  deadline_change_requested: 'Pengajuan Perubahan Deadline',
  deadline_change_approved: 'Perubahan Deadline Disetujui',
  deadline_change_rejected: 'Perubahan Deadline Ditolak',
  evaluation_recorded: 'Evaluasi Dicatat',
  setting_updated: 'Pengaturan Diubah',
  confidential_access_granted: 'Akses Rahasia Diberikan',
  period_opened: 'Periode Dibuka',
  scores_calculated: 'Skor Dihitung',
};

export default function SettingsActivityLogScreen() {
  const { can } = useProfile();
  const { logs, isLoading } = useActivityLog();
  const allowed = can('view_activity_log');

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Activity Log' }} />
      <View className="gap-3 p-5">
        {!allowed ? (
          <AccessDenied message="Activity Log hanya untuk pemegang izin Lihat Activity Log." />
        ) : isLoading ? (
          <SkeletonList count={5} />
        ) : logs.length === 0 ? (
          <EmptyState title="Belum ada aktivitas" description="Aktivitas organisasi akan tampil di sini." />
        ) : (
          <>
            <Text className="text-xs text-neutral-400">
              Catatan ini bersifat permanen (append-only) dan tidak dapat diubah atau dihapus.
            </Text>
            {logs.map((log) => (
              <SectionCard key={log.id}>
                <Text className="text-base font-semibold text-black dark:text-white">
                  {ACTION_LABEL[log.action] ?? log.action}
                </Text>
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  {log.entity_type}
                  {' · '}
                  {log.actor_id ? 'Pengguna' : 'Sistem'}
                </Text>
              </SectionCard>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}
