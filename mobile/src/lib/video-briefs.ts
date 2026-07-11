// Data layer Fase 8 — Video Brief + Brief Understanding (DDL wajib; UI opsional).
// video_briefs: SELECT via can_access_action_plan. brief_understanding_records: user menulis
// langsung (RLS insert/update user_id=auth.uid()), upsert idempoten via unique(video_brief_id,user_id).
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type VideoBrief = Tables<'video_briefs'>;
export type BriefUnderstandingRecord = Tables<'brief_understanding_records'>;

export async function listVideoBriefs(actionPlanId: string): Promise<VideoBrief[]> {
  const { data, error } = await supabase
    .from('video_briefs')
    .select('*')
    .eq('action_plan_id', actionPlanId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VideoBrief[];
}

export async function getVideoBrief(actionPlanId: string): Promise<VideoBrief | null> {
  const { data, error } = await supabase
    .from('video_briefs')
    .select('*')
    .eq('action_plan_id', actionPlanId)
    .maybeSingle();
  if (error) throw error;
  return data as VideoBrief | null;
}

export type MarkBriefUnderstoodInput = {
  videoBriefId: string;
  organizationId: string;
  userId: string;
  timestampSeconds?: number;
  isUnderstood?: boolean;
};

/** Upsert idempoten — menonton ulang tidak menggandakan record (unique video_brief_id+user_id). */
export async function markBriefUnderstood(input: MarkBriefUnderstoodInput): Promise<void> {
  const { error } = await supabase.from('brief_understanding_records').upsert(
    {
      video_brief_id: input.videoBriefId,
      organization_id: input.organizationId,
      user_id: input.userId,
      timestamp_seconds: input.timestampSeconds ?? null,
      is_understood: input.isUnderstood ?? true,
    },
    { onConflict: 'video_brief_id,user_id' },
  );
  if (error) throw error;
}
