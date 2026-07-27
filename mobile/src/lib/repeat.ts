// Data layer Fase 2 — Tugas Repeat.
// Semua otorisasi & generasi instance ditegakkan di server (RLS + RPC SECURITY DEFINER);
// fungsi di sini hanya pemanggil tipis. Label/tone instance TERPISAH dari label parent tasks
// karena enum instance punya status 'missed' (Terlewat) yang tidak ada di tasks.
import type { Tables } from './database.types';
import type { EvidenceInput, PersonRef, ResultValueInput, SubmissionDetail } from './cards';
import { supabase } from './supabase';

export type RepeatRule = Tables<'task_repeat_rules'>;
export type Instance = Tables<'task_instances'>;

export type InstanceWithSubmissions = Instance & {
  pic: PersonRef;
  reviewer: PersonRef;
  task_submissions: SubmissionDetail[];
};

export type RepeatCompliance = {
  expected_count: number;
  on_time_count: number;
  missed_count: number;
  done_count: number;
  compliance: number | null;
};

// ---------------------------------------------------------------- label & tone maps

export const INSTANCE_STATUS_LABEL: Record<string, string> = {
  assigned: 'Ditugaskan',
  in_progress: 'Dikerjakan',
  submitted: 'Menunggu Review',
  done: 'Selesai',
  revision: 'Revisi Diperlukan',
  missed: 'Terlewat',
  archived: 'Diarsipkan',
};

/** Tone semantik per status instance (Terlewat = danger). */
export const INSTANCE_STATUS_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'success' | 'danger'> = {
  assigned: 'info',
  in_progress: 'info',
  submitted: 'warn',
  done: 'success',
  revision: 'danger',
  missed: 'danger',
  archived: 'neutral',
};

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  custom: 'Kustom',
};

export const MISSED_RULE_LABEL: Record<string, string> = {
  strict: 'Ketat (langsung Terlewat)',
  grace_period: 'Masa Tenggang',
  overdue_allowed: 'Boleh Terlambat',
};

// ---------------------------------------------------------------- queries

// Embed submissions HARUS disambiguasi via nama FK: task_instances kini punya DUA
// relasi ke task_submissions — daftar (task_instance_id) + balikan
// current_submission_id. Tanpa `!fk` PostgREST balas 300 PGRST201 (ambiguous embedding),
// membuat getInstance/listInstances gagal & layar instance blank. Pakai relasi daftar.
const INSTANCE_SELECT =
  '*, pic:pic_id(id, full_name, email), reviewer:reviewer_id(id, full_name, email), ' +
  'task_submissions!task_submissions_task_instance_id_fkey(' +
  '*, evidence_files(*), task_result_values(*), ' +
  'submitter:submitted_by(id, full_name, email), reviewer:reviewed_by(id, full_name, email))';

export async function listInstances(taskId: string): Promise<InstanceWithSubmissions[]> {
  const { data, error } = await supabase
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .eq('task_id', taskId)
    .order('instance_date', { ascending: true });
  if (error) throw error;
  return data as unknown as InstanceWithSubmissions[];
}

export async function getInstance(id: string): Promise<InstanceWithSubmissions | null> {
  // maybeSingle, BUKAN single: id di luar akses/tidak ada → RLS menyaring jadi 0 baris.
  // single() membalas 406 dan React Query terus retry → skeleton tak pernah selesai.
  const { data, error } = await supabase
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as InstanceWithSubmissions | null;
}

// Inventory layar Settings > Repeat Setting (PRD §31). Read-only daftar seluruh repeat-rule
// yang user boleh lihat (RLS). Dipakai untuk navigasi cepat ke Tugas induk.
export type RepeatRuleWithContext = RepeatRule & {
  task: { id: string; name: string; status: string } | null;
};

export async function listAllRepeatRules(): Promise<RepeatRuleWithContext[]> {
  const { data, error } = await supabase
    .from('task_repeat_rules')
    .select('*, task:tasks(id, name, status)')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RepeatRuleWithContext[];
}

// ---------------------------------------------------------------- mutations (RPC)

export type RepeatRuleInput = {
  frequency: string;
  weekdays: number[] | null;
  monthDays: number[] | null;
  customDates: string[] | null;
  repeatStartDate: string;
  repeatEndDate: string;
  timeOfDay: string;
  missedRule: string;
  gracePeriodMinutes: number | null;
};

/**
 * S4-8 — ambil aturan repeat aktif untuk satu Tugas (untuk prefill layar edit).
 * `maybeSingle()` supaya Tugas repeat yg belum punya rule (edge case) tidak
 * error 406.
 */
export async function getRepeatRule(taskId: string): Promise<RepeatRule | null> {
  const { data, error } = await supabase
    .from('task_repeat_rules')
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle();
  if (error) throw error;
  return data as RepeatRule | null;
}

/**
 * S4-8 — cek apakah Tugas sudah punya instance ter-generate. Repeat rule
 * dikunci oleh RPC `set_task_repeat_rule` begitu instance pertama ada
 * (`0067:336`). UI pakai ini untuk menampilkan form editable vs read-only.
 * Pakai `count: 'exact'` + `head: true` supaya tak menarik payload baris.
 */
export async function hasRepeatInstances(taskId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('task_instances')
    .select('*', { count: 'exact', head: true })
    .eq('task_id', taskId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function setRepeatRule(taskId: string, input: RepeatRuleInput): Promise<string> {
  const { data, error } = await supabase.rpc('set_task_repeat_rule', {
    p_action_plan_id: taskId,
    p_frequency: input.frequency,
    p_weekdays: input.weekdays as never,
    p_month_days: input.monthDays as never,
    p_custom_dates: input.customDates as never,
    p_repeat_start_date: input.repeatStartDate,
    p_repeat_end_date: input.repeatEndDate,
    p_time_of_day: input.timeOfDay,
    p_missed_rule: input.missedRule,
    p_grace_period_minutes: input.gracePeriodMinutes as never,
  });
  if (error) throw error;
  return data as string;
}

export async function submitInstance(args: {
  instanceId: string;
  note: string | null;
  evidence: EvidenceInput[];
  resultValues: ResultValueInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_task_instance', {
    p_instance_id: args.instanceId,
    // RPC memakai nullif(trim(...),'') → string kosong setara null (paritas Fase 1).
    p_note: args.note ?? '',
    p_evidence: args.evidence as never,
    p_result_values: args.resultValues as never,
  });
  if (error) throw error;
  return data as string;
}

export async function reviewInstanceSubmission(args: {
  submissionId: string;
  decision: 'approve' | 'reject';
  reason: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('review_task_instance_submission', {
    p_submission_id: args.submissionId,
    p_decision: args.decision,
    p_reason: args.reason ?? '',
  });
  if (error) throw error;
}

export async function getRepeatCompliance(taskId: string): Promise<RepeatCompliance> {
  const { data, error } = await supabase.rpc('get_repeat_compliance', {
    p_action_plan_id: taskId,
  });
  if (error) throw error;
  const rows = (data ?? []) as RepeatCompliance[];
  // RPC mengembalikan tabel; one_time / tak ada → kosong → compliance NULL.
  return (
    rows[0] ?? { expected_count: 0, on_time_count: 0, missed_count: 0, done_count: 0, compliance: null }
  );
}
