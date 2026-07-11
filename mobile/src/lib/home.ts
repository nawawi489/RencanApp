// Data layer Fase 3 — Home (Today Command Center). Per-section (retry granular AC-H11), tanggal
// "hari ini" dihitung di SERVER (org timezone) via RPC; klien tak pernah menghitung tanggal (CF-3).
// getOrgToday() hanya untuk label/orkestrasi UI — nilainya TIDAK dikirim balik ke RPC.
import { computeKpiGap } from './strategy-gap';
import { supabase } from './supabase';

/** Baris seragam section Home (one-time Task + Repeat Instance disatukan). */
export type HomeItem = {
  kind: 'task' | 'instance';
  id: string;
  task_id: string;
  name: string | null;
  due: string | null;
  status: string;
};

/** Tanggal hari ini pada timezone organisasi (sumber: server). Untuk dateLabel/orkestrasi UI saja. */
export async function getOrgToday(): Promise<string> {
  const { data, error } = await supabase.rpc('get_org_today');
  if (error) throw error;
  return data as string;
}

type SectionRpc =
  | 'get_today_repeat_instances'
  | 'get_overdue_items'
  | 'get_near_deadline_items';

async function callSection(fn: SectionRpc): Promise<HomeItem[]> {
  const { data, error } = await supabase.rpc(fn);
  if (error) throw error;
  return (data ?? []) as unknown as HomeItem[];
}

/** Repeat Instance jatuh tempo hari ini (server org-tz). */
export function listTodayRepeatInstances(): Promise<HomeItem[]> {
  return callSection('get_today_repeat_instances');
}

/** Terlewat: one-time deadline lewat + instance 'missed'. */
export function listOverdueItems(): Promise<HomeItem[]> {
  return callSection('get_overdue_items');
}

/** Deadline mendekat (≤3 hari). */
export function listNearDeadline(): Promise<HomeItem[]> {
  return callSection('get_near_deadline_items');
}

/**
 * Instance Repeat yang menunggu review user (status 'submitted', reviewer = user).
 * Pelengkap listPendingReviews (cards.ts) yang hanya melihat one-time tasks —
 * tanpa ini kartu "Butuh Review" Home menampilkan 0 padahal ada submission instance.
 */
export async function listPendingInstanceReviews(): Promise<HomeItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('task_instances')
    .select('id, task_id, instance_date, status, tasks(name)')
    .eq('reviewer_id', uid)
    .eq('status', 'submitted')
    .order('instance_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      task_id: string;
      instance_date: string;
      status: string;
      tasks: { name: string | null } | null;
    };
    return {
      kind: 'instance' as const,
      id: row.id,
      task_id: row.task_id,
      name: row.tasks?.name ?? null,
      due: row.instance_date,
      status: row.status,
    };
  });
}

/** Strategy aktif yang perlu dipantau di Home (snapshot tim). */
export type KpiAttentionItem = {
  id: string;
  name: string;
  /** % capaian vs target (null = KPI kualitatif tanpa target numerik). */
  percent: number | null;
  /** Sisa menuju target (null = kualitatif). */
  remaining: number | null;
  /** Satuan tampilan (null = kualitatif / tak diisi). */
  unit: string | null;
};

/**
 * Strategy aktif yang perlu dipantau (0032, override PRD §18):
 *   - Bertarget numerik (`target_numeric > 0`): masuk bila capaian < target (current/target via
 *     VIEW strategy_current_values.numeric_total). Membawa percent + remaining untuk "% gap" prototype.
 *   - Kualitatif (tanpa target numerik): masuk bila BELUM ada progres approved (absen dari view) —
 *     sinyal state-based lama, tanpa klasifikasi tanggal (CF-3).
 * RLS men-scope kedua query (org + visibility). supabase-js mengembalikan `numeric` sebagai string →
 * dikoersi `Number()` sebelum dihitung.
 */
export async function listKpiNeedsAttention(): Promise<KpiAttentionItem[]> {
  const [areas, values] = await Promise.all([
    supabase.from('strategies').select('id, name, target_numeric, target_unit').eq('status', 'active'),
    supabase.from('strategy_current_values').select('strategy_id, numeric_total'),
  ]);
  if (areas.error) throw areas.error;
  if (values.error) throw values.error;
  const currentById = new Map<string, number>();
  for (const v of values.data ?? []) {
    if (v.strategy_id) currentById.set(v.strategy_id, Number(v.numeric_total) || 0);
  }

  const out: KpiAttentionItem[] = [];
  for (const a of areas.data ?? []) {
    const current = currentById.get(a.id) ?? 0;
    const targetNumeric = a.target_numeric == null ? null : Number(a.target_numeric);
    const gap = computeKpiGap({ targetNumeric, current });
    if (gap.hasTarget) {
      if (!gap.reached) {
        out.push({ id: a.id, name: a.name, percent: gap.percent, remaining: gap.remaining, unit: a.target_unit });
      }
    } else if (!currentById.has(a.id)) {
      out.push({ id: a.id, name: a.name, percent: null, remaining: null, unit: null });
    }
  }
  return out;
}
