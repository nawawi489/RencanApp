// Hooks Fase 2 — data instance repeat + turunan aksi per peran.
// Compliance & progress dibedakan: hook mengekspos metrik compliance read-only dari server.
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getRepeatCompliance, listInstances, type InstanceWithSubmissions } from '@/lib/repeat';

export function useRepeatInstances(actionPlanId: string, options?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const enabled = !!actionPlanId && options?.enabled !== false;

  const instancesQ = useQuery({
    queryKey: ['repeat-instances', actionPlanId],
    queryFn: () => listInstances(actionPlanId),
    enabled,
  });

  const complianceQ = useQuery({
    queryKey: ['repeat-compliance', actionPlanId],
    queryFn: () => getRepeatCompliance(actionPlanId),
    enabled,
  });

  const compliance = complianceQ.data;
  // compliancePercent = tepat waktu ÷ total seharusnya; '—' (null) bila belum ada instance.
  const compliancePercent =
    compliance && compliance.expected_count > 0
      ? Math.round((compliance.on_time_count / compliance.expected_count) * 100)
      : null;

  function refresh() {
    qc.invalidateQueries({ queryKey: ['repeat-instances', actionPlanId] });
    qc.invalidateQueries({ queryKey: ['repeat-compliance', actionPlanId] });
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
