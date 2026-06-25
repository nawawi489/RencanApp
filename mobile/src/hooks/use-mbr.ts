// Hooks Fase 5 — MBR (rules + compliance) + mutasi rule. Query keys baru ['mbr_rules'] dan
// ['mbr_compliance', parentType, parentId]; sengaja TIDAK menyentuh key Fase 4 agar mutasi
// kartu existing tetap aman (invalidasi ['mbr_compliance', ...] ditambahkan terpisah di
// mutasi kartu bila diperlukan).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  checkMbrCompliance,
  listMbrRules,
  setMbrRule,
  type CardType,
  type MbrCompliance,
  type MbrRule,
  type SetMbrRuleInput,
} from '@/lib/settings-mbr';

export function useMbrRules() {
  const q = useQuery({
    queryKey: ['mbr_rules'],
    queryFn: () => listMbrRules(),
  });
  return {
    rules: (q.data ?? []) as MbrRule[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Kepatuhan MBR untuk satu kartu induk + jenisnya.
 * - Fail-open di klien: bila data belum/tak ada → isCompliant true (jangan blokir UX);
 *   server tetap penegak akhir saat aktivasi.
 */
export function useMbrCompliance(parentType: CardType | '', parentId: string) {
  const enabled = !!parentType && !!parentId;
  const q = useQuery({
    queryKey: ['mbr_compliance', parentType, parentId],
    queryFn: () => checkMbrCompliance(parentType as CardType, parentId),
    enabled,
  });
  const compliance = q.data as MbrCompliance | undefined;
  return {
    compliance,
    isLoading: q.isLoading,
    isError: q.isError,
    isCompliant: compliance?.is_compliant ?? true,
    refetch: q.refetch,
  };
}

export function useMbrRuleActions() {
  const qc = useQueryClient();
  const setRuleM = useMutation({
    mutationFn: (input: SetMbrRuleInput) => setMbrRule(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mbr_rules'] });
    },
  });
  return {
    setRule: (input: SetMbrRuleInput) => setRuleM.mutateAsync(input),
    isSubmitting: setRuleM.isPending,
  };
}
