// Data layer Fase 8 — Activity Log & Governance Violation pages (read-only, append-only di DB).
// RLS: activity_logs/governance_violations sudah ada sejak Fase 1; halaman ini hanya membaca.
import type { Tables } from './database.types';
import { supabase } from './supabase';
import type { Tone } from '@/components/ui';

export type ActivityLog = Tables<'activity_logs'> & {
  actor?: { id: string; full_name: string | null; email: string | null } | null;
};
export type GovernanceViolation = Tables<'governance_violations'>;

/** Severity 4-tier → tone semantik Badge. */
export const GOVERNANCE_VIOLATION_SEVERITY_TONE: Record<string, Tone> = {
  low: 'neutral',
  medium: 'warn',
  high: 'warn',
  critical: 'danger',
};

export const GOVERNANCE_VIOLATION_SEVERITY_LABEL: Record<string, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
};

/** Label Indonesia untuk `governance_violations.violation_type`.
 *  Kolom di DB adalah `text` bebas (tanpa CHECK constraint), jadi peta ini enumerasi
 *  nilai yang benar-benar ditulis fungsi DB — bukan kontrak yang dipaksakan schema.
 *  Sumber: insert langsung (0005/0007/0008/0014/0038/0040/0046/0063/0064) dan
 *  `log_governance_violation()` (0019/0046). Gunakan `governanceViolationTypeLabel()`
 *  agar tipe baru dari DB tetap tampil (fallback ke nilai mentah). */
export const GOVERNANCE_VIOLATION_TYPE_LABEL: Record<string, string> = {
  deadline_change_self_approval: 'Menyetujui perubahan deadline sendiri',
  finalize_non_submitter: 'Finalisasi oleh bukan pengirim',
  instance_missed: 'Pekerjaan terlewat',
  kpi_area_mismatch: 'KPI Area tidak sesuai',
  minimum_breakdown_not_met: 'Minimum breakdown belum terpenuhi',
  orphan_cleanup_unauthorized: 'Pembersihan data yatim tanpa izin',
  reviewer_override: 'Review di luar Reviewer yang ditunjuk',
  self_approval_attempt: 'Percobaan menyetujui pekerjaan sendiri',
  self_evaluation: 'Evaluasi pekerjaan sendiri',
  settings_invalid_key: 'Kunci pengaturan tidak valid',
  strategy_mismatch: 'Strategi tidak sesuai',
  submit_non_pic: 'Pengiriman oleh bukan PIC',
};

/** Label aman untuk satu `violation_type`. Tidak pernah mengembalikan string kosong:
 *  tipe tak dikenal / nilai kosong jatuh balik ke nilai mentah, lalu ke '—'. */
export function governanceViolationTypeLabel(type: string | null | undefined): string {
  const raw = (type ?? '').trim();
  if (raw === '') return '—';
  return GOVERNANCE_VIOLATION_TYPE_LABEL[raw] ?? raw;
}

export const ACTIVITY_LOG_PAGE_SIZE = 30;
const PAGE_SIZE = 50;

/** Kunci filter chip UI-S-AL1 — dipetakan ke ekspresi PostgREST oleh `CHIP_FILTER`.
 *  Server-side agar hasil filter tidak terbatas pada halaman yg sudah dimuat. */
export type ActivityLogChipKey =
  | 'semua'
  | 'create'
  | 'update'
  | 'archive_cancel'
  | 'review'
  | 'periode'
  | 'permission';

/** Peta chip → filter server. `in` = whitelist action; `or` = ekspresi PostgREST `.or()`.
 *  Nilai `null` = tanpa filter (chip "Semua"). */
const CHIP_FILTER: Record<ActivityLogChipKey, { in?: string[]; or?: string } | null> = {
  semua: null,
  create: { in: ['create', 'activate'] },
  update: { in: ['update', 'setting_updated'] },
  archive_cancel: { or: 'action.ilike.%archive%,action.ilike.%cancell%' },
  review: { or: 'action.ilike.%deadline_change%,action.eq.evaluation_recorded' },
  periode: { or: 'action.ilike.period_%,action.ilike.%score%' },
  permission: { or: 'action.ilike.user_permission_%,action.eq.confidential_access_granted' },
};

/** Sanitasi teks pencarian: buang karakter yg konflik dgn sintaks PostgREST
 *  (`,` `(` `)` `%` `*` `.`) — kita tetap wildcard sendiri via `%...%`. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*.:]/g, '').trim();
}

/**
 * UI-S-AR1 — metadata arsip (kapan & oleh siapa) dari activity_logs.
 * Mengambil entri TERBARU dgn action 'card_archived' utk satu (entity_type, entity_id).
 * Returns null bila belum ada (mis. record arsip lama sebelum logging).
 */
export type ArchiveMetadata = {
  archived_at: string;
  archived_by: string | null;
};

export async function getArchiveMetadata(
  entityType: string,
  entityId: string,
): Promise<ArchiveMetadata | null> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('actor_id, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('action', 'card_archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { archived_at: data.created_at, archived_by: data.actor_id ?? null };
}

/** UI-G-002 — activity log untuk satu entity (entity_type + entity_id). RLS aktif (org-scoped). */
export async function listEntityActivityLog(
  entityType: string,
  entityId: string,
): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, actor:actor_id(id, full_name, email)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function listActivityLog(opts?: {
  /** Legacy — filter action exact match. Baru: pakai `chip`. */
  action?: string;
  /** Kunci filter chip UI (server-side). */
  chip?: ActivityLogChipKey;
  /** Free-text search: cocokkan `action ILIKE %q%` OR `entity_type ILIKE %q%` (server-side). */
  q?: string;
  limit?: number;
  page?: number;
}): Promise<ActivityLog[]> {
  const limit = opts?.limit ?? PAGE_SIZE;
  const page = opts?.page ?? 0;
  let query = supabase
    .from('activity_logs')
    .select('*, actor:actor_id(id, full_name, email)')
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1);
  if (opts?.action) query = query.eq('action', opts.action);
  const chipDef = opts?.chip ? CHIP_FILTER[opts.chip] : null;
  if (chipDef?.in) query = query.in('action', chipDef.in);
  if (chipDef?.or) query = query.or(chipDef.or);
  if (opts?.q) {
    const needle = sanitizeSearch(opts.q);
    if (needle.length > 0) {
      query = query.or(`action.ilike.%${needle}%,entity_type.ilike.%${needle}%`);
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function listGovernanceViolations(opts?: {
  severity?: string;
  limit?: number;
  page?: number;
}): Promise<GovernanceViolation[]> {
  const limit = opts?.limit ?? PAGE_SIZE;
  const page = opts?.page ?? 0;
  let q = supabase
    .from('governance_violations')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1);
  if (opts?.severity) q = q.eq('severity', opts.severity);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as GovernanceViolation[];
}
