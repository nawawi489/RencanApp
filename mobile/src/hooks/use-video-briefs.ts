// Hooks Fase 8 — Video Brief (opsional UI). enabled saat initiativeId terisi.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getVideoBrief,
  listVideoBriefs,
  markBriefUnderstood,
  type MarkBriefUnderstoodInput,
  type VideoBrief,
} from '@/lib/video-briefs';

export function useVideoBrief(initiativeId: string | null | undefined) {
  const enabled = !!initiativeId;
  const q = useQuery({
    queryKey: ['video_briefs', initiativeId],
    queryFn: () => getVideoBrief(initiativeId as string),
    enabled,
  });
  return {
    brief: (q.data ?? null) as VideoBrief | null,
    isLoading: q.isLoading,
    enabled,
  };
}

export function useVideoBriefs(initiativeId: string | null | undefined) {
  const enabled = !!initiativeId;
  const q = useQuery({
    queryKey: ['video_briefs', 'list', initiativeId],
    queryFn: () => listVideoBriefs(initiativeId as string),
    enabled,
  });
  return { briefs: (q.data ?? []) as VideoBrief[], isLoading: q.isLoading, enabled };
}

export function useBriefUnderstandingActions() {
  const qc = useQueryClient();
  const markM = useMutation({
    mutationFn: (input: MarkBriefUnderstoodInput) => markBriefUnderstood(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video_briefs'] }),
  });
  return {
    markUnderstood: (input: MarkBriefUnderstoodInput) => markM.mutateAsync(input),
    isPending: markM.isPending,
  };
}
