// Hooks Fase 2 — data instance repeat + turunan aksi per peran.
// Compliance & progress dibedakan: hook mengekspos metrik compliance read-only dari server.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateHomeQueries } from '@/lib/home-queries';
import { getRepeatCompliance, listInstances, reviewInstanceSubmission, type InstanceWithSubmissions } from '@/lib/repeat';

export function useRepeatInstances(taskId: string, options?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const enabled = !!taskId && options?.enabled !== false;

  const instancesQ = useQuery({
    queryKey: ['repeat-instances', taskId],
    queryFn: () => listInstances(taskId),
    enabled,
  });

  const complianceQ = useQuery({
    queryKey: ['repeat-compliance', taskId],
    queryFn: () => getRepeatCompliance(taskId),
    enabled,
  });

  const compliance = complianceQ.data;
  // compliancePercent = tepat waktu ÷ total seharusnya; '—' (null) bila belum ada instance.
  const compliancePercent =
    compliance && compliance.expected_count > 0
      ? Math.round((compliance.on_time_count / compliance.expected_count) * 100)
      : null;

  function refresh() {
    qc.invalidateQueries({ queryKey: ['repeat-instances', taskId] });
    qc.invalidateQueries({ queryKey: ['repeat-compliance', taskId] });
  }

  return {
    instances: (instancesQ.data ?? []) as InstanceWithSubmissions[],
    isLoading: instancesQ.isLoading,
    // WS-3d — bedakan "gagal fetch" dari "benar-benar kosong": tanpa ini layar
    // menampilkan "Belum ada instance" saat listInstances error, padahal compliance
    // (query terpisah) bisa tetap menunjukkan angka → kontradiksi yang dilaporkan.
    isError: instancesQ.isError,
    compliance,
    compliancePercent,
    refresh,
  };
}

type InstanceLike = { pic_id: string | null; reviewer_id: string | null; status: string };

type ReviewableInstance = { task_id: string; current_submission_id: string | null };

// `null` diterima selain `undefined`: getInstance memakai maybeSingle, jadi instance di luar
// akses/tidak ada bernilai null (bukan lempar 406). Mutasi tetap di-guard oleh `enabled`/UI.
export function useInstanceReview(inst: ReviewableInstance | null | undefined, instanceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { decision: 'approve' | 'reject'; reason: string | null }) =>
      reviewInstanceSubmission({
        submissionId: inst!.current_submission_id!,
        decision: args.decision,
        reason: args.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instance', instanceId] });
      if (inst?.task_id) {
        qc.invalidateQueries({ queryKey: ['repeat-instances', inst.task_id] });
        qc.invalidateQueries({ queryKey: ['repeat-compliance', inst.task_id] });
      }
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
      // Review instance mengubah antrean "Butuh Review" + "hari ini"/terlewat di Home.
      invalidateHomeQueries(qc);
    },
  });
}

/** Aksi yang tersedia atas sebuah instance, ditentukan status + peran profil saat ini. */
export function useInstanceActions(instance: InstanceLike, profileId: string | null) {
  const isPic = !!profileId && profileId === instance.pic_id;
  const isReviewer = !!profileId && profileId === instance.reviewer_id;
  const isSelfApproval = !!instance.pic_id && instance.pic_id === instance.reviewer_id;

  return {
    isPic,
    isReviewer,
    isSelfApproval,
    canStart: isPic && instance.status === 'assigned',
    canSubmit: isPic && ['assigned', 'in_progress', 'revision'].includes(instance.status),
    canReview: isReviewer && instance.status === 'submitted' && !isSelfApproval,
  };
}
