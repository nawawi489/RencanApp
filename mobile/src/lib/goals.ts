// Data layer Fase 4 — Goals & Perencanaan Strategis (Goal → Strategi → Inisiatif).
// Pemanggil tipis: otorisasi ditegakkan di server (RLS untuk INSERT, RPC SECURITY DEFINER untuk
// lifecycle & template). Mirror pola createActionPlan (cards.ts) byte-for-byte.
import { STATUS_TONE, type PersonRef } from './cards';
import type { Tables } from './database.types';
import { getOrgContext } from './org-context';
import { supabase } from './supabase';

export type Goal = Tables<'goals'>;
export type GoalTemplate = Tables<'goal_templates'>;
export type StrategyTemplate = Tables<'strategy_templates'>;
/** Goal + jumlah Strategi (embedded count via PostgREST) — satu query, hindari N+1 per baris. */
export type GoalWithKpiCount = Goal & { strategies: { count: number }[] };

/** Ekstrak jumlah Strategi dari hasil embedded; null bila tak tersedia (tampil '—'). */
export function kpiCountOf(goal: GoalWithKpiCount): number | null {
  return goal.strategies?.[0]?.count ?? null;
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
  // Embedded aggregate strategies(count): jumlah Strategi ikut dalam SATU query (cegah N+1 per Goal).
  const { data, error } = await supabase
    .from('goals')
    .select('*, strategies(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as GoalWithKpiCount[];
}

export async function getGoal(id: string): Promise<Goal | null> {
  // maybeSingle, BUKAN single: id di luar akses/tidak ada → RLS menyaring jadi 0 baris.
  // single() membalas 406 dan React Query terus retry → skeleton tak pernah selesai.
  const { data, error } = await supabase.from('goals').select('*').eq('id', id).maybeSingle();
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

export async function listStrategyTemplates(goalTemplateId: string): Promise<StrategyTemplate[]> {
  if (!goalTemplateId) return [];
  const { data, error } = await supabase
    .from('strategy_templates')
    .select('*')
    .eq('goal_template_id', goalTemplateId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

/** UI-S-KT1 — semua Strategi Template join nama Goal Template (proxy "divisi"). */
export type StrategyTemplateWithParent = StrategyTemplate & {
  goal_templates: { id: string; name: string } | null;
};

export async function listAllStrategyTemplates(): Promise<StrategyTemplateWithParent[]> {
  const { data, error } = await supabase
    .from('strategy_templates')
    .select('*, goal_templates(id, name)')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as StrategyTemplateWithParent[];
}

// ---------------------------------------------------------------- strategy template CRUD (§19)

export type NewStrategyTemplate = {
  goal_template_id: string;
  name: string;
  division: string;
  division_label: string;
  target_hint?: string | null;
  expected_outcome_hint?: string | null;
  sort_order?: number;
};

export async function createStrategyTemplate(input: NewStrategyTemplate): Promise<StrategyTemplate> {
  const { data, error } = await supabase
    .from('strategy_templates')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type UpdateStrategyTemplate = Partial<
  Pick<StrategyTemplate, 'name' | 'division' | 'division_label' | 'target_hint' | 'expected_outcome_hint' | 'sort_order'>
> & { is_active?: boolean };

export async function updateStrategyTemplate(id: string, patch: UpdateStrategyTemplate): Promise<StrategyTemplate> {
  const { data, error } = await supabase
    .from('strategy_templates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStrategyTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('strategy_templates')
    .delete()
    .eq('id', id);
  if (error) throw error;
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
  const { uid, orgId } = await getOrgContext();
  const { data, error } = await supabase
    .from('goals')
    .insert({ ...input, organization_id: orgId, created_by: uid })
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

/** Instansiasi goal + strategi dari template; mengembalikan goal_id baru. */
export async function applyGoalTemplate(args: {
  goalTemplateId: string;
  picId: string;
  periodStart: string;
  periodEnd: string;
  /** Target per Strategi template, key = nama Strategi (PRD §49 step 5). Kosong → null di server. */
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

/** Pulihkan item template (strategi) yang dihapus pada goal; mengembalikan jumlah item dipulihkan. */
export async function restoreGoalTemplateItems(goalId: string): Promise<number> {
  const { data, error } = await supabase.rpc('restore_goal_template_items', {
    p_goal_id: goalId,
  });
  if (error) throw error;
  return data as number;
}
