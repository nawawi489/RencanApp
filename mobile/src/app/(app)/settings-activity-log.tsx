// Fase 8 — Settings > Activity Log (read-only, append-only di DB). Gated view_activity_log.
// UI-S-AL1: search (q vs entity_type/action) + filter chips per-kategori aksi + timestamp.
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { TextInput } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { EmptyState, SectionCard, SkeletonList, TabBar, usePlaceholderColor } from '@/components/ui';
import { useActivityLog } from '@/hooks/use-activity-governance';
import { useProfile } from '@/hooks/use-profile';

const ACTION_LABEL: Record<string, string> = {
  create: 'Dibuat',
  update: 'Diubah',
  activate: 'Diaktifkan',
  start: 'Dimulai',
  card_archived: 'Diarsipkan',
  card_cancelled: 'Dibatalkan',
  card_restored: 'Dipulihkan',
  cancellation_requested: 'Pengajuan Pembatalan',
  apply_template: 'Template Diterapkan',
  deadline_change_requested: 'Pengajuan Perubahan Deadline',
  deadline_change_approved: 'Perubahan Deadline Disetujui',
  deadline_change_rejected: 'Perubahan Deadline Ditolak',
  deadline_change_resubmitted: 'Perubahan Deadline Diajukan Ulang',
  deadline_change_revision_requested: 'Revisi Perubahan Deadline Diminta',
  evaluation_recorded: 'Evaluasi Dicatat',
  setting_updated: 'Pengaturan Diubah',
  confidential_access_granted: 'Akses Rahasia Diberikan',
  period_opened: 'Periode Dibuka',
  scores_calculated: 'Skor Dihitung',
  score_override_applied: 'Override Skor Diterapkan',
  period_closed: 'Periode Ditutup',
  score_formula_draft_created: 'Draft Formula Dibuat',
  score_formula_weights_updated: 'Bobot Formula Diubah',
  score_formula_activated: 'Formula Diaktifkan',
  score_formula_changed: 'Formula Diubah',
  user_permission_granted: 'Hak Akses Diberikan',
  user_permission_revoked: 'Hak Akses Dicabut',
  permission_scope_updated: 'Scope Permission Diubah',
  submit: 'Bukti Disubmit',
  submit_instance: 'Bukti Instance Disubmit',
  review_approve: 'Review Disetujui',
  review_reject: 'Review Ditolak',
  review_instance_approve: 'Review Instance Disetujui',
  review_instance_reject: 'Review Instance Ditolak',
  instance_marked_overdue: 'Instance Terlewat',
  instance_missed: 'Instance Terlewat',
  instances_generated: 'Instance Digenerate',
  activate_repeat: 'Repeat Diaktifkan',
  set_repeat_rule: 'Jadwal Repeat Diatur',
  violation_resolved: 'Pelanggaran Diselesaikan',
};

type ChipKey = 'semua' | 'create' | 'update' | 'archive_cancel' | 'review' | 'periode' | 'permission';

const CHIP_DEFS: { key: ChipKey; label: string; match: (action: string) => boolean }[] = [
  { key: 'semua', label: 'Semua', match: () => true },
  { key: 'create', label: 'Dibuat', match: (a) => a === 'create' || a === 'activate' },
  { key: 'update', label: 'Diubah', match: (a) => a === 'update' || a === 'setting_updated' },
  { key: 'archive_cancel', label: 'Arsip/Batal', match: (a) => a.includes('archive') || a.includes('cancell') },
  { key: 'review', label: 'Review', match: (a) => a.includes('deadline_change') || a === 'evaluation_recorded' },
  { key: 'periode', label: 'Periode/Skor', match: (a) => a.startsWith('period_') || a.includes('score') },
  { key: 'permission', label: 'Permission', match: (a) => a.startsWith('user_permission_') || a === 'confidential_access_granted' },
];

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SettingsActivityLogScreen() {
  const { can } = useProfile();
  const { logs, isLoading } = useActivityLog();
  const allowed = can('view_activity_log');
  const placeholderColor = usePlaceholderColor();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<ChipKey>('semua');

  const filtered = useMemo(() => {
    const chipDef = CHIP_DEFS.find((c) => c.key === chip) ?? CHIP_DEFS[0];
    const needle = q.trim().toLowerCase();
    return logs.filter((log) => {
      if (!chipDef.match(log.action)) return false;
      if (!needle) return true;
      const hay = `${log.action} ${log.entity_type ?? ''} ${ACTION_LABEL[log.action] ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [logs, q, chip]);

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Log Aktivitas' }} />
      <View className="gap-3 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Log Aktivitas</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Riwayat perubahan yang tercatat sistem.
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Activity Log hanya untuk pemegang izin Lihat Activity Log." />
        ) : isLoading ? (
          <SkeletonList count={5} />
        ) : (
          <>
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
            />

            {filtered.length === 0 ? (
              <EmptyState
                title={logs.length === 0 ? 'Belum ada aktivitas' : 'Tidak ada yang cocok'}
                description={logs.length === 0
                  ? 'Aktivitas organisasi akan tampil di sini.'
                  : 'Hapus pencarian / ubah filter untuk melihat semua aktivitas.'}
              />
            ) : (
              <>
                <Text className="text-xs text-neutral-400">
                  {filtered.length} entri (append-only — tidak dapat diubah atau dihapus).
                </Text>
                {filtered.map((log) => (
                  <SectionCard key={log.id}>
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="flex-1 text-base font-semibold text-black dark:text-white">
                        {ACTION_LABEL[log.action] ?? log.action}
                      </Text>
                      <Text className="text-[11px] text-neutral-400">
                        {formatTimestamp(log.created_at)}
                      </Text>
                    </View>
                    <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                      {log.entity_type ?? '—'}
                      {' · '}
                      {log.actor_id ? 'Pengguna' : 'Sistem'}
                    </Text>
                  </SectionCard>
                ))}
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
