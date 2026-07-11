// Data layer Fase 1 — Card Engine + Loop Eksekusi.
// Semua otorisasi ditegakkan di server (RLS + RPC); fungsi di sini hanya pemanggil tipis.
import type { Tables } from './database.types';
import { getOrgContext } from './org-context';
import { supabase } from './supabase';

export type ActionPlan = Tables<'action_plans'>;
export type Task = Tables<'tasks'>;
export type Submission = Tables<'task_submissions'>;
export type EvidenceFile = Tables<'evidence_files'>;
export type ResultValue = Tables<'task_result_values'>;

export type PersonRef = { id: string; full_name: string | null; email: string | null } | null;

/** Nama tampil orang — full_name → email → fallback. Aman untuk PersonRef nullable. */
export function personLabel(p: PersonRef | undefined, fallback = 'Tanpa nama'): string {
  return p?.full_name?.trim() || p?.email || fallback;
}

export type TaskWithPeople = Task & {
  pic: PersonRef;
  reviewer: PersonRef;
};

export type SubmissionDetail = Submission & {
  evidence_files: EvidenceFile[];
  task_result_values: ResultValue[];
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
 * Daftar Action Plan. Fase 4: `opts.initiativeId` memfilter berdasarkan induk Initiative —
 * `null` = Action Plan datar (tanpa Initiative, section "Tanpa Goal"); string = anak Initiative tertentu.
 * Fase 6: `opts.problemStatementId` memfilter berdasarkan induk Problem Statement (sama semantik).
 * Tanpa opts = semua (backward-compat Fase 1, pemanggil lama tak berubah).
 */
export async function listActionPlans(opts?: {
  initiativeId?: string | null;
  problemStatementId?: string | null;
}): Promise<ActionPlan[]> {
  let query = supabase.from('action_plans').select('*');
  if (opts && opts.initiativeId !== undefined) {
    query = opts.initiativeId === null ? query.is('initiative_id', null) : query.eq('initiative_id', opts.initiativeId);
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

/** UI-S-DA2 — hitung Action Plan di bawah beberapa Problem Statement sekaligus (satu query, hindari N+1). */
export async function listActionPlansByProblemStatementIds(ids: string[]): Promise<ActionPlan[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('action_plans').select('*').in('problem_statement_id', ids);
  if (error) throw error;
  return data;
}

export async function getActionPlan(id: string): Promise<ActionPlan> {
  const { data, error } = await supabase.from('action_plans').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listTasks(actionPlanId: string): Promise<TaskWithPeople[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('action_plan_id', actionPlanId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as TaskWithPeople[];
}

export async function getTask(id: string): Promise<TaskWithPeople | null> {
  // maybeSingle, BUKAN single: id di luar akses/tidak ada → RLS menyaring jadi 0 baris.
  // single() membalas 406 dan React Query terus retry → skeleton tak pernah selesai.
  const { data, error } = await supabase
    .from('tasks')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as TaskWithPeople | null;
}

export async function listSubmissions(taskId: string): Promise<SubmissionDetail[]> {
  const { data, error } = await supabase
    .from('task_submissions')
    .select(
      '*, evidence_files(*), task_result_values(*), submitter:submitted_by(id, full_name, email), reviewer:reviewed_by(id, full_name, email)',
    )
    .eq('task_id', taskId)
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

/** Action plan di mana user adalah Reviewer & status menunggu review (untuk Home). */
export async function listPendingReviews(): Promise<TaskWithPeople[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('reviewer_id', uid)
    .eq('status', 'submitted')
    .order('deadline', { ascending: true });
  if (error) throw error;
  return data as unknown as TaskWithPeople[];
}

/**
 * UI-S-PR4 — Action plan di mana user TERTENTU adalah PIC (untuk people-profile).
 * RLS otomatis menyaring; statuses ke-aktif (assigned/in_progress/revision/submitted).
 */
export async function listTasksByPic(userId: string): Promise<TaskWithPeople[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('pic_id', userId)
    .in('status', ['assigned', 'in_progress', 'submitted', 'revision'])
    .order('deadline', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as unknown as TaskWithPeople[];
}

/** Action plan di mana user adalah PIC & masih harus dikerjakan (untuk Home). */
export async function listMyTasks(): Promise<TaskWithPeople[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email)')
    .eq('pic_id', uid)
    .in('status', ['assigned', 'in_progress', 'revision'])
    .order('deadline', { ascending: true });
  if (error) throw error;
  return data as unknown as TaskWithPeople[];
}

// ---------------------------------------------------------------- mutations

export type NewActionPlan = {
  name: string;
  target_result: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
  description?: string | null;
  /** Fase 4: induk Initiative. null/absen = Action Plan datar (backward-compat Fase 1). */
  initiative_id?: string | null;
  /** Fase 6: induk Problem Statement (jalur Development). Mutually exclusive dgn initiative_id (CHECK action_plans_single_parent). */
  problem_statement_id?: string | null;
  /** UI-S-I01 — PRD §21 "Tim" wajib. NULL diizinkan saat Draft. */
  team_id?: string | null;
};

export async function createActionPlan(input: NewActionPlan): Promise<ActionPlan> {
  const { uid, orgId } = await getOrgContext();
  const { data, error } = await supabase
    .from('action_plans')
    .insert({ ...input, organization_id: orgId, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type NewTask = {
  action_plan_id: string;
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

export async function createTask(input: NewTask): Promise<Task> {
  const { uid, orgId } = await getOrgContext();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, organization_id: orgId, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle & loop)

export async function activateActionPlan(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_action_plan', { p_action_plan_id: id });
  if (error) throw error;
}

export async function activateTask(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_task', { p_action_plan_id: id });
  if (error) throw error;
}

export async function startTask(id: string): Promise<void> {
  const { error } = await supabase.rpc('start_task', { p_action_plan_id: id });
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

/** Per addendum §10.2 ER-1: strategy_id wajib di RPC (kecuali OD-1 fallback Fase 1). */
export type ResultValueInput = {
  strategy_id: string | null; // null hanya valid bila OD-1 fallback (0 kandidat) — server validate.
  label: string | null;
  value_type: string;
  value_text: string | null;
  value_numeric?: number | null;
};

/** Kandidat Strategy untuk picker (RPC list_strategy_candidates_for_task). */
export type StrategyCandidate = { id: string; name: string };

/** Snapshot agregat dari VIEW strategy_current_values (untuk render "nilai lama"). */
export type StrategyCurrentValue = {
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
  taskId: string,
  attachmentCount: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_submission_draft', {
    p_action_plan_id: taskId,
    p_attachment_count: attachmentCount,
  });
  if (error) throw error;
  return data as string;
}

/**
 * 2-phase commit step 3: finalize draft → submitted.
 * Sekarang menerima `submissionDraftId` (BUKAN taskId — signature lama BREAKING per OQ-4 deploy-atomic).
 * Server compute previous_value_text (ER-8 anti-TOCTOU).
 */
export async function finalizeSubmission(args: {
  submissionDraftId: string;
  note: string | null;
  evidence: EvidenceInput[];
  resultValues: ResultValueInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_task', {
    p_submission_draft_id: args.submissionDraftId,
    p_note: args.note ?? '',
    p_evidence: args.evidence as never,
    p_result_values: args.resultValues as never,
  });
  if (error) throw error;
  return data as string;
}

/** List Strategy kandidat untuk Task ini (chain action_plan→initiative→strategy).
 * 0 baris = Fase 1 fallback (OD-1 → UI hide section Nilai Hasil). */
export async function listStrategyCandidates(taskId: string): Promise<StrategyCandidate[]> {
  const { data, error } = await supabase.rpc('list_strategy_candidates_for_task', {
    p_action_plan_id: taskId,
  });
  if (error) throw error;
  return (data ?? []) as StrategyCandidate[];
}

/** Read current aggregate value untuk Strategy (sumber "nilai lama" di UI DeltaArrow). */
export async function getStrategyCurrentValue(strategyId: string): Promise<StrategyCurrentValue | null> {
  const { data, error } = await supabase
    .from('strategy_current_values')
    .select('numeric_total, text_count, last_approved_at')
    .eq('strategy_id', strategyId)
    .maybeSingle();
  if (error) throw error;
  return (data as StrategyCurrentValue | null) ?? null;
}

/** UI-S-KD2/KD3 — satu submission yang menyumbang Nilai Hasil ke Strategy ini (approved/pending/rejected). */
export type KpiResultValueSource = {
  id: string;
  value_numeric: number | null;
  value_text: string | null;
  created_at: string;
  submission: {
    id: string;
    task_id: string;
    review_status: string;
    submitted_at: string;
    task: { id: string; name: string } | null;
  } | null;
};

/**
 * Daftar Nilai Hasil (result value) yang menunjuk ke Strategy ini, lintas Task, terurut terbaru.
 * Dipakai untuk kartu "Nilai Hasil" (proposed vs current) dan panel "Sumber Nilai Hasil".
 */
export async function listStrategyResultValueSources(strategyId: string): Promise<KpiResultValueSource[]> {
  const { data, error } = await supabase
    .from('task_result_values')
    .select(
      'id, value_numeric, value_text, created_at, submission:submission_id(id, task_id, review_status, submitted_at, task:task_id(id, name))',
    )
    .eq('strategy_id', strategyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as KpiResultValueSource[];
}

export async function reviewSubmission(args: {
  submissionId: string;
  decision: 'approve' | 'reject';
  reason: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('review_task_submission', {
    p_submission_id: args.submissionId,
    p_decision: args.decision,
    p_reason: args.reason ?? '',
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- PPL-06 Kontribusi (OQ-6)

/**
 * Jumlah Task yang telah selesai (status='done') oleh PIC pada rentang periode aktif.
 * PPL-06 / OQ-6 diputuskan 2026-07-05: metrik "Kontribusi bulan ini" = count AP done PIC pada periode.
 *
 * SEMANTIK APPROKSIMASI: idealnya filter pakai kolom `completed_at`, tapi schema tak punya kolom
 * itu dan spec §NG-5 tidak mengizinkan migrasi baru untuk bug UI. Pakai `updated_at` sebagai
 * approksimasi — untuk AP `done` yang tidak diedit setelahnya, updated_at ≈ completed_at.
 *
 * RLS `tasks` menyaring visibility per organisasi + permission. Viewer di luar scope →
 * `[]` graceful (count=0, bukan error). Konsumen UI HARUS membedakan 0-nyata vs RLS-hidden.
 *
 * Guard: userId kosong atau period null → 0 tanpa fetch (dan tanpa auth.getUser).
 */
export async function countCompletedTasksInPeriod(
  userId: string,
  period: { period_start: string; period_end: string } | null | undefined,
): Promise<number> {
  if (!userId || !period) return 0;
  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('pic_id', userId)
    .eq('status', 'done')
    .gte('updated_at', period.period_start)
    .lte('updated_at', period.period_end);
  if (error) throw error;
  return (data ?? []).length;
}
