// Data layer Fase 1 — Card Engine + Loop Eksekusi.
// Semua otorisasi ditegakkan di server (RLS + RPC); fungsi di sini hanya pemanggil tipis.
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type Initiative = Tables<'initiatives'>;
export type ActionPlan = Tables<'action_plans'>;
export type Submission = Tables<'action_plan_submissions'>;
export type EvidenceFile = Tables<'evidence_files'>;
export type ResultValue = Tables<'action_plan_result_values'>;

export type PersonRef = { id: string; full_name: string | null; email: string | null } | null;

export type ActionPlanWithPeople = ActionPlan & {
  pic: PersonRef;
  reviewer: PersonRef;
};

export type SubmissionDetail = Submission & {
  evidence_files: EvidenceFile[];
  action_plan_result_values: ResultValue[];
  submitter: PersonRef;
  reviewer: PersonRef;
};

// ---------------------------------------------------------------- label maps

export const INITIATIVE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Aktif',
  done: 'Selesai',
  archived: 'Diarsipkan',
};

export const ACTION_PLAN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  assigned: 'Ditugaskan',
  in_progress: 'Dikerjakan',
  submitted: 'Menunggu Review',
  done: 'Selesai',
  revision: 'Revisi Diperlukan',
  archived: 'Diarsipkan',
};

/** Warna semantik (key → kelas teks/border/bg Tailwind). */
export const STATUS_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'success' | 'danger'> = {
  draft: 'neutral',
  active: 'info',
  assigned: 'info',
  in_progress: 'info',
  submitted: 'warn',
  done: 'success',
  revision: 'danger',
  archived: 'neutral',
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  urgent: 'Mendesak',
};

export const EVIDENCE_KIND_LABEL: Record<string, string> = {
  file: 'File',
  photo: 'Foto',
  screenshot: 'Screenshot',
  pdf: 'PDF',
  link_gdrive: 'Link Google Drive',
  link_doc: 'Link Dokumen',
  text_note: 'Catatan Teks',
  report: 'Rekap Laporan',
};

export const RESULT_VALUE_TYPE_LABEL: Record<string, string> = {
  number: 'Angka',
  currency: 'Rupiah',
  percentage: 'Persentase',
  boolean: 'Ya/Tidak',
  text: 'Teks',
  option: 'Pilihan',
  link: 'Link',
};

// ---------------------------------------------------------------- queries

/**
 * Daftar Initiative. Fase 4: `opts.strategyId` memfilter berdasarkan induk Strategy —
 * `null` = Initiative datar (tanpa Strategy, section "Tanpa Goal"); string = anak Strategy tertentu;
 * tanpa opts = semua (backward-compat Fase 1, pemanggil lama tak berubah).
 */
export async function listInitiatives(opts?: { strategyId?: string | null }): Promise<Initiative[]> {
  let query = supabase.from('initiatives').select('*');
  if (opts && opts.strategyId !== undefined) {
    query = opts.strategyId === null ? query.is('strategy_id', null) : query.eq('strategy_id', opts.strategyId);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getInitiative(id: string): Promise<Initiative> {
  const { data, error } = await supabase.from('initiatives').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listActionPlans(initiativeId: string): Promise<ActionPlanWithPeople[]> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('initiative_id', initiativeId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as ActionPlanWithPeople[];
}

export async function getActionPlan(id: string): Promise<ActionPlanWithPeople> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as ActionPlanWithPeople;
}

export async function listSubmissions(actionPlanId: string): Promise<SubmissionDetail[]> {
  const { data, error } = await supabase
    .from('action_plan_submissions')
    .select(
      '*, evidence_files(*), action_plan_result_values(*), submitter:submitted_by(id, full_name, email), reviewer:reviewed_by(id, full_name, email)',
    )
    .eq('action_plan_id', actionPlanId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return data as unknown as SubmissionDetail[];
}

/** Anggota org untuk picker PIC/Reviewer. */
export async function listOrgProfiles(): Promise<NonNullable<PersonRef>[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data as NonNullable<PersonRef>[];
}

export type Guidance = Tables<'card_guidance_contents'>;
export async function getGuidance(cardType: string): Promise<Guidance | null> {
  const { data, error } = await supabase
    .from('card_guidance_contents')
    .select('*')
    .eq('card_type', cardType)
    .order('organization_id', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Action plan di mana user adalah Reviewer & status menunggu review (untuk Home). */
export async function listPendingReviews(): Promise<ActionPlanWithPeople[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('action_plans')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('reviewer_id', uid)
    .eq('status', 'submitted')
    .order('deadline', { ascending: true });
  if (error) throw error;
  return data as unknown as ActionPlanWithPeople[];
}

/** Action plan di mana user adalah PIC & masih harus dikerjakan (untuk Home). */
export async function listMyActionPlans(): Promise<ActionPlanWithPeople[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('action_plans')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('pic_id', uid)
    .in('status', ['assigned', 'in_progress', 'revision'])
    .order('deadline', { ascending: true });
  if (error) throw error;
  return data as unknown as ActionPlanWithPeople[];
}

// ---------------------------------------------------------------- mutations

export type NewInitiative = {
  name: string;
  target_result: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
  description?: string | null;
  /** Fase 4: induk Strategy. null/absen = Initiative datar (backward-compat Fase 1). */
  strategy_id?: string | null;
};

export async function createInitiative(input: NewInitiative): Promise<Initiative> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', uid!)
    .single();
  const { data, error } = await supabase
    .from('initiatives')
    .insert({ ...input, organization_id: profile!.organization_id!, created_by: uid! })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type NewActionPlan = {
  initiative_id: string;
  name: string;
  pic_id: string | null;
  reviewer_id: string | null;
  start_date: string | null;
  deadline: string | null;
  expected_output: string | null;
  definition_of_done: string | null;
  priority: string | null;
  evidence_required: boolean;
  result_value_required: boolean;
  description?: string | null;
};

export async function createActionPlan(input: NewActionPlan): Promise<ActionPlan> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', uid!)
    .single();
  const { data, error } = await supabase
    .from('action_plans')
    .insert({ ...input, organization_id: profile!.organization_id!, created_by: uid! })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle & loop)

export async function activateInitiative(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_initiative', { p_initiative_id: id });
  if (error) throw error;
}

export async function activateActionPlan(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_action_plan', { p_action_plan_id: id });
  if (error) throw error;
}

export async function startActionPlan(id: string): Promise<void> {
  const { error } = await supabase.rpc('start_action_plan', { p_action_plan_id: id });
  if (error) throw error;
}

export type EvidenceInput = {
  kind: string;
  storage_path?: string | null;
  url?: string | null;
  text_content?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
};

export type ResultValueInput = {
  label: string | null;
  value_type: string;
  value_text: string | null;
};

export async function submitActionPlan(args: {
  actionPlanId: string;
  note: string | null;
  evidence: EvidenceInput[];
  resultValues: ResultValueInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_action_plan', {
    p_action_plan_id: args.actionPlanId,
    // RPC memakai nullif(trim(...),'') → string kosong setara null.
    p_note: args.note ?? '',
    p_evidence: args.evidence as never,
    p_result_values: args.resultValues as never,
  });
  if (error) throw error;
  return data as string;
}

export async function reviewSubmission(args: {
  submissionId: string;
  decision: 'approve' | 'reject';
  reason: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('review_action_plan_submission', {
    p_submission_id: args.submissionId,
    p_decision: args.decision,
    p_reason: args.reason ?? '',
  });
  if (error) throw error;
}
