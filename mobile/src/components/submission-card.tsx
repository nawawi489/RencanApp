// Kartu submission bersama (one-time & repeat-instance). Diekstrak dari action-plan/[id].tsx
// agar layar instance (action-plan/instance/[id].tsx) memakai render identik tanpa duplikasi.
import { Text, View } from 'react-native-css/components';

import { SectionCard, Badge } from '@/components/ui';
import { EVIDENCE_KIND_LABEL, RESULT_VALUE_TYPE_LABEL, personLabel, type EvidenceFile, type ResultValue, type SubmissionDetail } from '@/lib/cards';

export function formatDateTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}

export const REVIEW_STATUS: Record<string, { label: string; tone: 'warn' | 'success' | 'danger' }> = {
  pending: { label: 'Menunggu Review', tone: 'warn' },
  approved: { label: 'Disetujui', tone: 'success' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};

function EvidenceItem({ ev }: { ev: EvidenceFile }) {
  const detail = ev.text_content || ev.url || ev.file_name || '—';
  return (
    <View className="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
      <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
        {EVIDENCE_KIND_LABEL[ev.kind] ?? ev.kind}
      </Text>
      <Text className="text-sm text-black dark:text-white">{detail}</Text>
    </View>
  );
}

function ResultValueItem({ rv }: { rv: ResultValue }) {
  return (
    <View className="flex-row justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
      <Text className="text-sm text-neutral-600 dark:text-neutral-300">
        {rv.label || RESULT_VALUE_TYPE_LABEL[rv.value_type] || 'Nilai'}
      </Text>
      <Text className="text-sm font-semibold text-black dark:text-white">{rv.value_text ?? '—'}</Text>
    </View>
  );
}

export function SubmissionCard({ s }: { s: SubmissionDetail }) {
  const status = REVIEW_STATUS[s.review_status] ?? REVIEW_STATUS.pending;
  return (
    <SectionCard>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-black dark:text-white">Versi {s.version_number}</Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Oleh {s.submitter ? personLabel(s.submitter) : '—'} · {formatDateTime(s.submitted_at)}
      </Text>
      {s.note ? <Text className="text-sm text-black dark:text-white">{s.note}</Text> : null}

      {s.evidence_files.length > 0 ? (
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Bukti</Text>
          {s.evidence_files.map((ev) => (
            <EvidenceItem key={ev.id} ev={ev} />
          ))}
        </View>
      ) : null}

      {s.action_plan_result_values.length > 0 ? (
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Nilai Hasil</Text>
          {s.action_plan_result_values.map((rv) => (
            <ResultValueItem key={rv.id} rv={rv} />
          ))}
        </View>
      ) : null}

      {s.review_status === 'rejected' && s.review_reason ? (
        <View className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/40">
          <Text className="text-xs font-semibold text-red-700 dark:text-red-300">Alasan ditolak</Text>
          <Text className="text-sm text-red-700 dark:text-red-300">{s.review_reason}</Text>
        </View>
      ) : null}
      {s.reviewed_at ? (
        <Text className="text-xs text-neutral-400">
          Direview {s.reviewer ? `oleh ${personLabel(s.reviewer)} ` : ''}· {formatDateTime(s.reviewed_at)}
        </Text>
      ) : null}
    </SectionCard>
  );
}
