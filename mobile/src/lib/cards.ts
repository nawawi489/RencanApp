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
  link_generic: 'Link', // ER-9: whitelist DB sudah ada sejak migrasi 0015 — tambah ke UI mapping.
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
 * `null` = Initiative datar (tanpa Strategy, section "Tanpa Goal"); string = anak Strategy tertentu.
 * Fase 6: `opts.problemStatementId` memfilter berdasarkan induk Problem Statement (sama semantik).
 * Tanpa opts = semua (backward-compat Fase 1, pemanggil lama tak berubah).
 */
export async function listInitiatives(opts?: {
  strategyId?: string | null;
  problemStatementId?: string | null;
}): Promise<Initiative[]> {
  let query = supabase.from('initiatives').select('*');
  if (opts && opts.strategyId !== undefined) {
    query = opts.strategyId === null ? query.is('strategy_id', null) : query.eq('strategy_id', opts.strategyId);
  }
  if (opts && opts.problemStatementId !== undefined) {
    query =
      opts.problemStatementId === null
        ? query.is('problem_statement_id', null)
        : query.eq('problem_statement_id', opts.problemStatementId);
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

/** Resolusi satu profil jadi PersonRef (untuk prefill picker dari pic_id). null id → null. */
export async function getPersonRef(id: string | null | undefined): Promise<PersonRef> {
  if (!id) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as PersonRef;
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

/**
 * UI-S-PP2 — anggota org dengan role/position (subhead People list).
 * Sibling listOrgProfiles agar tidak memecah callers picker yang hanya butuh id/name/email.
 */
export type OrgProfileWithRole = NonNullable<PersonRef> & {
  position_title: string | null;
  role_name: string | null;
  role_level: string | null;
};

export async function listOrgProfilesWithRoles(): Promise<OrgProfileWithRole[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, position_title, role_templates(name, level)')
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (error) throw error;
  type Row = {
    id: string;
    full_name: string | null;
    email: string | null;
    position_title: string | null;
    role_templates: { name: string; level: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    position_title: r.position_title,
    role_name: r.role_templates?.name ?? null,
    role_level: r.role_templates?.level ?? null,
  }));
}

/** UI-S-PR1 — Detail profil satu user (untuk header rich chrome di people-profile). */
export type OrgProfileDetail = {
  id: string;
  full_name: string | null;
  email: string | null;
  position_title: string | null;
  is_active: boolean;
  created_at: string | null;
  role_name: string | null;
  role_level: string | null;
};

export async function getOrgProfileDetail(id: string): Promise<OrgProfileDetail | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, position_title, is_active, created_at, role_templates(name, level)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    full_name: string | null;
    email: string | null;
    position_title: string | null;
    is_active: boolean;
    created_at: string | null;
    role_templates: { name: string; level: string } | null;
  };
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    position_title: row.position_title,
    is_active: row.is_active,
    created_at: row.created_at,
    role_name: row.role_templates?.name ?? null,
    role_level: row.role_templates?.level ?? null,
  };
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

/**
 * UI-S-PR4 — Action plan di mana user TERTENTU adalah PIC (untuk people-profile).
 * RLS otomatis menyaring; statuses ke-aktif (assigned/in_progress/revision/submitted).
 */
export async function listActionPlansByPic(userId: string): Promise<ActionPlanWithPeople[]> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('pic_id', userId)
    .in('status', ['assigned', 'in_progress', 'submitted', 'revision'])
    .order('deadline', { ascending: true, nullsFirst: false });
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
  /** Fase 6: induk Problem Statement (jalur Development). Mutually exclusive dgn strategy_id (CHECK initiatives_single_parent). */
  problem_statement_id?: string | null;
  /** UI-S-I01 — PRD §21 "Tim" wajib. NULL diizinkan saat Draft. */
  team_id?: string | null;
};

export async function createInitiative(input: NewInitiative): Promise<Initiative> {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', uid)
    .single();
  if (profErr) throw profErr;
  if (!profile?.organization_id) throw new Error('Organization not found');
  const { data, error } = await supabase
    .from('initiatives')
    .insert({ ...input, organization_id: profile.organization_id, created_by: uid })
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
  /** PRD §22.9 "Jam Deadline" — wajib semua AP (HH:MM 24h). */
  deadline_time?: string | null;
  expected_output: string | null;
  definition_of_done: string | null;
  priority: string | null;
  evidence_required: boolean;
  result_value_required: boolean;
  /** PRD §22.5 "Bukti yang diminta" — deskripsi apa bukti yang diharapkan PIC sertakan. */
  evidence_description?: string | null;
  description?: string | null;
};

export async function createActionPlan(input: NewActionPlan): Promise<ActionPlan> {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', uid)
    .single();
  if (profErr) throw profErr;
  if (!profile?.organization_id) throw new Error('Organization not found');
  const { data, error } = await supabase
    .from('action_plans')
    .insert({ ...input, organization_id: profile.organization_id, created_by: uid })
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

/** Per addendum §10.2 ER-1: kpi_area_id wajib di RPC (kecuali OD-1 fallback Fase 1). */
export type ResultValueInput = {
  kpi_area_id: string | null; // null hanya valid bila OD-1 fallback (0 kandidat) — server validate.
  label: string | null;
  value_type: string;
  value_text: string | null;
  value_numeric?: number | null;
};

/** Kandidat KPI Area untuk picker (RPC list_kpi_area_candidates_for_action_plan). */
export type KpiAreaCandidate = { id: string; name: string };

/** Snapshot agregat dari VIEW kpi_area_current_values (untuk render "nilai lama"). */
export type KpiAreaCurrentValue = {
  numeric_total: number;
  text_count: number;
  last_approved_at: string | null;
};

/**
 * 2-phase commit step 1: create submission draft (Pre-upload).
 * Server validate: auth.uid()=PIC, attachment_count ≤5, AP status in_progress, no pending review.
 * Return draft id yang dipakai untuk path Storage upload.
 */
export async function createSubmissionDraft(
  actionPlanId: string,
  attachmentCount: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_submission_draft', {
    p_action_plan_id: actionPlanId,
    p_attachment_count: attachmentCount,
  });
  if (error) throw error;
  return data as string;
}

/**
 * 2-phase commit step 3: finalize draft → submitted.
 * Sekarang menerima `submissionDraftId` (BUKAN actionPlanId — signature lama BREAKING per OQ-4 deploy-atomic).
 * Server compute previous_value_text (ER-8 anti-TOCTOU).
 */
export async function finalizeSubmission(args: {
  submissionDraftId: string;
  note: string | null;
  evidence: EvidenceInput[];
  resultValues: ResultValueInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_action_plan', {
    p_submission_draft_id: args.submissionDraftId,
    p_note: args.note ?? '',
    p_evidence: args.evidence as never,
    p_result_values: args.resultValues as never,
  });
  if (error) throw error;
  return data as string;
}

/** List KPI Area kandidat untuk Action Plan ini (chain initiative→strategy→kpi_area).
 * 0 baris = Fase 1 fallback (OD-1 → UI hide section Nilai Hasil). */
export async function listKpiAreaCandidates(actionPlanId: string): Promise<KpiAreaCandidate[]> {
  const { data, error } = await supabase.rpc('list_kpi_area_candidates_for_action_plan', {
    p_action_plan_id: actionPlanId,
  });
  if (error) throw error;
  return (data ?? []) as KpiAreaCandidate[];
}

/**
 * @deprecated Pakai 2-phase: `createSubmissionDraft()` → upload via `uploadEvidenceFile()` → `finalizeSubmission()`.
 * Stub ini menjaga TS compile sebelum submit.tsx di-refactor di Fase E. Jangan dipanggil.
 */
export async function submitActionPlan(_args: {
  actionPlanId: string;
  note: string | null;
  evidence: EvidenceInput[];
  resultValues: ResultValueInput[];
}): Promise<string> {
  throw new Error(
    'submitActionPlan deprecated. Pakai createSubmissionDraft → uploadEvidenceFile → finalizeSubmission (2-phase commit, addendum §10.2 ER-2).',
  );
}

/** Read current aggregate value untuk KPI Area (sumber "nilai lama" di UI DeltaArrow). */
export async function getKpiAreaCurrentValue(kpiAreaId: string): Promise<KpiAreaCurrentValue | null> {
  const { data, error } = await supabase
    .from('kpi_area_current_values')
    .select('numeric_total, text_count, last_approved_at')
    .eq('kpi_area_id', kpiAreaId)
    .maybeSingle();
  if (error) throw error;
  return (data as KpiAreaCurrentValue | null) ?? null;
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
