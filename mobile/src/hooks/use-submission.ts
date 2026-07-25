// Hooks Fase 4 ext — UI-S-AP5 + UI-S-AP6 submission flow.
// Tiga hook:
//   1. useKpiCandidates(taskId) — list kandidat Strategi untuk picker. 0 hasil = OD-1 fallback.
//   2. useKpiCurrentValue(strategyId) — agregat "nilai lama" untuk DeltaArrow.
//   3. useSubmissionFlow(taskId) — state machine 2-phase commit dgn anti double-tap + parallel uploads
//      + cleanup orphan saat gagal. Single mutation hook untuk submit.tsx.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import {
  createSubmissionDraft,
  finalizeSubmission,
  getStrategyCurrentValue,
  listStrategyCandidates,
  type EvidenceInput,
  type StrategyCandidate,
  type StrategyCurrentValue,
  type ResultValueInput,
} from '@/lib/cards';
import { invalidateHomeQueries } from '@/lib/home-queries';
import { cleanupOrphanUpload, uploadEvidenceFile, type LocalFile } from '@/lib/storage';

export function useKpiCandidates(taskId: string | undefined) {
  const q = useQuery({
    queryKey: ['kpi_candidates', taskId],
    queryFn: () => listStrategyCandidates(taskId!),
    enabled: !!taskId,
  });
  return {
    candidates: (q.data ?? []) as StrategyCandidate[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

export function useKpiCurrentValue(strategyId: string | undefined | null) {
  const q = useQuery({
    queryKey: ['kpi_current_value', strategyId],
    queryFn: () => getStrategyCurrentValue(strategyId!),
    enabled: !!strategyId,
  });
  return {
    value: (q.data ?? null) as StrategyCurrentValue | null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export type SubmissionFlowInput = {
  orgId: string;
  pendingFiles: LocalFile[]; // file lokal dari picker
  staticEvidence: EvidenceInput[]; // text_note / link tetap (tanpa upload)
  resultValues: ResultValueInput[];
  note: string | null;
};

/**
 * State machine 2-phase commit:
 *   idle → drafting → uploading → finalizing → done/error
 * Anti double-tap: in-flight promise di-cache; tap kedua return promise yg sama.
 * Cleanup orphan: bila finalize gagal SETELAH ada file ter-upload, cleanup path-path tsb.
 */
export function useSubmissionFlow(taskId: string | undefined) {
  const qc = useQueryClient();
  const inFlight = useRef<Promise<string> | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: SubmissionFlowInput): Promise<string> => {
      if (!taskId) throw new Error('Tugas ID tidak valid.');

      const attachmentCount = input.pendingFiles.length;
      // Phase 1: create draft.
      const draftId = await createSubmissionDraft(taskId, attachmentCount);

      const uploadedPaths: string[] = [];
      try {
        // Phase 2: parallel uploads (per addendum §7.1 A5 — bukan sequential).
        const uploadedEvidence = await Promise.all(
          input.pendingFiles.map((file) =>
            uploadEvidenceFile({
              orgId: input.orgId,
              taskId,
              submissionDraftId: draftId,
              file,
            }).then(({ path, mimeType }) => {
              uploadedPaths.push(path);
              return {
                kind: classifyKindFromMime(mimeType),
                storage_path: path,
                file_name: file.name,
                mime_type: mimeType,
              } as EvidenceInput;
            }),
          ),
        );

        // Phase 3: finalize.
        const allEvidence = [...input.staticEvidence, ...uploadedEvidence];
        const submissionId = await finalizeSubmission({
          submissionDraftId: draftId,
          note: input.note,
          evidence: allEvidence,
          resultValues: input.resultValues,
        });
        return submissionId;
      } catch (err) {
        // Cleanup orphan: HANYA untuk path yg sudah ter-upload (Critic §7.2 H_HM3 — bukan array kosong).
        if (uploadedPaths.length > 0) {
          await Promise.allSettled(uploadedPaths.map((p) => cleanupOrphanUpload(p)));
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', taskId] });
      qc.invalidateQueries({ queryKey: ['action-plan-submissions', taskId] });
      qc.invalidateQueries({ queryKey: ['kpi_candidates', taskId] });
      qc.invalidateQueries({ queryKey: ['kpi_current_value'] });
      // Submit memindah Tugas keluar dari "todo" & masuk antrean reviewer → segarkan Home.
      invalidateHomeQueries(qc);
    },
  });

  // Anti double-tap (Critic §7.2 H_HM2): guard di API surface, BUKAN di mutationFn.
  // useMutation tidak share in-flight promise antar invocation; guard ini memastikan tap kedua
  // saat tap pertama masih in-flight return promise yang sama (createDraft cuma 1x).
  const runSubmission = (input: SubmissionFlowInput): Promise<string> => {
    if (inFlight.current) return inFlight.current;
    const p = mutation.mutateAsync(input);
    inFlight.current = p;
    return p.finally(() => {
      inFlight.current = null;
    });
  };

  return {
    runSubmission,
    isSubmitting: mutation.isPending,
    error: mutation.error,
  };
}

function classifyKindFromMime(mime: string): 'photo' | 'pdf' | 'file' {
  if (mime.startsWith('image/')) return 'photo';
  if (mime === 'application/pdf') return 'pdf';
  return 'file';
}
