// Hooks Fase 8 — Governance & Admin lifecycle (DCR, Cancellation, Evaluation, Archive).
// Query keys: ['deadline_change_requests', entityId], ['cancellations', entityId],
// ['evaluations', initiativeId]. Mutasi invalidate key terkait via mutation variables.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approveCancellation,
  archiveCard,
  cancelCard,
  createDeadlineChangeRequest,
  getEvaluation,
  listCancellations,
  listDeadlineChangeRequests,
  recordEvaluation,
  reviewDeadlineChange,
  type CardEntityType,
  type Cancellation,
  type DeadlineChangeRequest,
  type Evaluation,
  type NewDeadlineChangeRequest,
  type NewEvaluation,
} from '@/lib/governance-admin';

// ---------------------------------------------------------------- Deadline Change Request

export function useDeadlineChangeRequests(entityId: string | null | undefined) {
  const enabled = !!entityId;
  const q = useQuery({
    queryKey: ['deadline_change_requests', entityId],
    queryFn: () => listDeadlineChangeRequests(entityId as string),
    enabled,
  });
  return {
    requests: (q.data ?? []) as DeadlineChangeRequest[],
    isLoading: q.isLoading,
    isError: q.isError,
    enabled,
  };
}

export function useDeadlineChangeActions() {
  const qc = useQueryClient();
  const createM = useMutation({
    mutationFn: (input: NewDeadlineChangeRequest) => createDeadlineChangeRequest(input),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['deadline_change_requests', vars.entityId] }),
  });
  const reviewM = useMutation({
    mutationFn: (input: { requestId: string; decision: 'approved' | 'rejected'; reason?: string; entityId?: string }) =>
      reviewDeadlineChange(input.requestId, input.decision, input.reason),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['deadline_change_requests', vars.entityId] }),
  });
  return {
    createRequest: (input: NewDeadlineChangeRequest) => createM.mutateAsync(input),
    reviewRequest: (input: { requestId: string; decision: 'approved' | 'rejected'; reason?: string; entityId?: string }) =>
      reviewM.mutateAsync(input),
    isPending: createM.isPending || reviewM.isPending,
  };
}

// ---------------------------------------------------------------- Cancellation

export function useCancellations(entityId: string | null | undefined) {
  const enabled = !!entityId;
  const q = useQuery({
    queryKey: ['cancellations', entityId],
    queryFn: () => listCancellations(entityId as string),
    enabled,
  });
  return { cancellations: (q.data ?? []) as Cancellation[], isLoading: q.isLoading, enabled };
}

export function useCancellationActions() {
  const qc = useQueryClient();
  const cancelM = useMutation({
    mutationFn: (input: { entityType: CardEntityType; entityId: string; reason: string }) =>
      cancelCard(input.entityType, input.entityId, input.reason),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cancellations', vars.entityId] }),
  });
  const approveM = useMutation({
    mutationFn: (input: { cancellationId: string; entityId?: string }) => approveCancellation(input.cancellationId),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cancellations', vars.entityId] }),
  });
  return {
    cancel: (input: { entityType: CardEntityType; entityId: string; reason: string }) => cancelM.mutateAsync(input),
    approveCancellation: (input: { cancellationId: string; entityId?: string }) => approveM.mutateAsync(input),
    isPending: cancelM.isPending || approveM.isPending,
  };
}

// ---------------------------------------------------------------- Evaluation

export function useEvaluation(initiativeId: string | null | undefined) {
  const enabled = !!initiativeId;
  const q = useQuery({
    queryKey: ['evaluations', initiativeId],
    queryFn: () => getEvaluation(initiativeId as string),
    enabled,
  });
  return {
    evaluation: (q.data ?? null) as Evaluation | null,
    isLoading: q.isLoading,
    isError: q.isError,
    enabled,
  };
}

export function useEvaluationActions() {
  const qc = useQueryClient();
  const recordM = useMutation({
    mutationFn: (input: NewEvaluation) => recordEvaluation(input),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['evaluations', vars.initiativeId] }),
  });
  return {
    record: (input: NewEvaluation) => recordM.mutateAsync(input),
    isPending: recordM.isPending,
  };
}

// ---------------------------------------------------------------- Archive

export function useArchiveActions() {
  const qc = useQueryClient();
  const archiveM = useMutation({
    mutationFn: (input: { entityType: CardEntityType; entityId: string }) =>
      archiveCard(input.entityType, input.entityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['initiatives'] });
    },
  });
  return {
    archive: (input: { entityType: CardEntityType; entityId: string }) => archiveM.mutateAsync(input),
    isPending: archiveM.isPending,
  };
}
