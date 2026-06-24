// Data layer Fase 3 — Home (Today Command Center). Per-section (retry granular AC-H11), tanggal
// "hari ini" dihitung di SERVER (org timezone) via RPC; klien tak pernah menghitung tanggal (CF-3).
// getOrgToday() hanya untuk label/orkestrasi UI — nilainya TIDAK dikirim balik ke RPC.
import { supabase } from './supabase';

/** Baris seragam section Home (one-time Action Plan + Repeat Instance disatukan). */
export type HomeItem = {
  kind: 'action_plan' | 'instance';
  id: string;
  action_plan_id: string;
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
