// Data layer Fase 4 — Goals & Perencanaan Strategis (Goal → KPI Area → Strategy).
// Pemanggil tipis: otorisasi ditegakkan di server (RLS untuk INSERT, RPC SECURITY DEFINER untuk
// lifecycle & template). Mirror pola createInitiative (cards.ts) byte-for-byte.
import { STATUS_TONE, type PersonRef } from './cards';
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type Goal = Tables<'goals'>;
export type GoalTemplate = Tables<'goal_templates'>;
export type KpiAreaTemplate = Tables<'kpi_area_templates'>;
/** Goal + jumlah KPI Area (embedded count via PostgREST) — satu query, hindari N+1 per baris. */
export type GoalWithKpiCount = Goal & { kpi_areas: { count: number }[] };

/** Ekstrak jumlah KPI Area dari hasil embedded; null bila tak tersedia (tampil '—'). */
export function kpiCountOf(goal: GoalWithKpiCount): number | null {
  return goal.kpi_areas?.[0]?.count ?? null;
}

// Re-export agar konsumen UI tidak perlu impor dari dua modul; nilai TIDAK diduplikasi.
export { STATUS_TONE, type PersonRef };

// ---------------------------------------------------------------- label maps

export const PLANNING_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Aktif',
  done: 'Selesai',
  archived: 'Diarsipkan',
};

// ---------------------------------------------------------------- queries

export async function listGoals(): Promise<GoalWithKpiCount[]> {
  // Embedded aggregate kpi_areas(count): jumlah KPI Area ikut dalam SATU query (cegah N+1 per Goal).
  const { data, error } = await supabase
    .from('goals')
    .select('*, kpi_areas(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as GoalWithKpiCount[];
}

export async function getGoal(id: string): Promise<Goal> {
  const { data, error } = await supabase.from('goals').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listGoalTemplates(): Promise<GoalTemplate[]> {
  const { data, error } = await supabase
    .from('goal_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listKpiAreaTemplates(goalTemplateId: string): Promise<KpiAreaTemplate[]> {
  if (!goalTemplateId) return [];
  const { data, error } = await supabase
    .from('kpi_area_templates')
    .select('*')
    .eq('goal_template_id', goalTemplateId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

/** UI-S-KT1 — semua KPI Area Template join nama Goal Template (proxy "divisi"). */
export type KpiAreaTemplateWithParent = KpiAreaTemplate & {
  goal_templates: { id: string; name: string } | null;
};

export async function listAllKpiAreaTemplates(): Promise<KpiAreaTemplateWithParent[]> {
  const { data, error } = await supabase
    .from('kpi_area_templates')
    .select('*, goal_templates(id, name)')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as KpiAreaTemplateWithParent[];
}

// ---------------------------------------------------------------- mutations (INSTANT ber-RLS)

export type NewGoal = {
  name: string;
  description?: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
  /** UI-S-G01 — PRD §17 "Target Tahunan" wajib (free-form, satuan tak dipaksa). */
  target_value?: string | null;
};

export async function createGoal(input: NewGoal): Promise<Goal> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', uid)
    .single();
  if (!profile?.organization_id) throw new Error('Organization not found');
  const { data, error } = await supabase
    .from('goals')
    .insert({ ...input, organization_id: profile.organization_id, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle & template)

export async function activateGoal(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_goal', { p_goal_id: id });
  if (error) throw error;
}

/** Instansiasi goal + KPI area dari template; mengembalikan goal_id baru. */
export async function applyGoalTemplate(args: {
  goalTemplateId: string;
  picId: string;
  periodStart: string;
  periodEnd: string;
  /** Target per KPI Area template, key = nama KPI Area (PRD §49 step 5). Kosong → null di server. */
  targets?: Record<string, string>;
}): Promise<string> {
  const { data, error } = await supabase.rpc('apply_goal_template', {
    p_goal_template_id: args.goalTemplateId,
    p_pic_id: args.picId,
    p_period_start: args.periodStart,
    p_period_end: args.periodEnd,
    p_targets: (args.targets ?? {}) as never,
  });
  if (error) throw error;
  return data as string;
}

/** Pulihkan item template (KPI area) yang dihapus pada goal; mengembalikan jumlah item dipulihkan. */
export async function restoreGoalTemplateItems(goalId: string): Promise<number> {
  const { data, error } = await supabase.rpc('restore_goal_template_items', {
    p_goal_id: goalId,
  });
  if (error) throw error;
  return data as number;
}
