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
 *  Sumber: insert langsung di body fungsi + helper `log_governance_violation()` (0019).
 *  Gunakan `governanceViolationTypeLabel()` agar tipe baru dari DB tetap tampil
 *  (fallback ke nilai mentah).
 *
 *  BL-13: peta ini di-gate oleh `governance-violation-types.contract.test.ts`, yang
 *  mem-parse `supabase/migrations/*.sql` dan memerah bila ada tipe ter-emit tanpa label
 *  (atau label tanpa emitter). Menambah tipe di migrasi ⇒ tambahkan entri di sini. */
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

/** Label Indonesia untuk `activity_logs.action` (BL-17).
 *  Bentuknya sengaja identik dengan `GOVERNANCE_VIOLATION_TYPE_LABEL` di atas: kolomnya
 *  `text` bebas tanpa CHECK constraint, jadi peta ini enumerasi nilai yang benar-benar
 *  ditulis migrasi — bukan kontrak yang dipaksakan schema.
 *
 *  Peta ini TIDAK ditaruh di SQL. `search_global` (0088) memproyeksikan `action` mentah dan
 *  menyerahkan pelabelan ke klien justru supaya tidak ada salinan kedua; menaruhnya di
 *  migrasi akan mengulang drift yang gate BL-13 pasang untuk dicegah.
 *
 *  BL-17: peta ini di-gate oleh `activity-log-actions.contract.test.ts`, yang mem-parse
 *  `supabase/migrations/*.sql` (tiga jalur emisi) dan memerah bila ada action ter-emit
 *  tanpa label — atau label tanpa emitter. Menambah action di migrasi ⇒ tambah entri di sini.
 *
 *  Gunakan `activityLogActionLabel()` agar action baru dari DB tetap tampil (fallback ke
 *  nilai mentah). */
export const ACTIVITY_LOG_ACTION_LABEL: Record<string, string> = {
  activate: 'Diaktifkan',
  activate_repeat: 'Repeat Diaktifkan',
  apply_template: 'Template Diterapkan',
  cancellation_requested: 'Pengajuan Pembatalan',
  card_archived: 'Diarsipkan',
  card_cancelled: 'Dibatalkan',
  card_completion_rule_updated: 'Aturan Penyelesaian Card Diubah',
  card_guidance_updated: 'Panduan Card Diubah',
  card_restored: 'Dipulihkan',
  confidential_access_granted: 'Akses Rahasia Diberikan',
  create: 'Dibuat',
  deadline_change_approved: 'Perubahan Deadline Disetujui',
  deadline_change_rejected: 'Perubahan Deadline Ditolak',
  deadline_change_requested: 'Pengajuan Perubahan Deadline',
  deadline_change_resubmitted: 'Perubahan Deadline Diajukan Ulang',
  deadline_change_revision_requested: 'Revisi Perubahan Deadline Diminta',
  department_activated: 'Departemen Diaktifkan',
  department_deactivated: 'Departemen Dinonaktifkan',
  evaluation_recorded: 'Evaluasi Dicatat',
  instance_marked_overdue: 'Instance Terlewat',
  instances_generated: 'Instance Digenerate',
  organization_updated: 'Organisasi Diubah',
  period_closed: 'Periode Ditutup',
  period_opened: 'Periode Dibuka',
  permission_scope_updated: 'Scope Permission Diubah',
  profile_active_changed: 'Status Aktif Profil Diubah',
  profile_org_changed: 'Organisasi Profil Dipindah',
  profile_role_changed: 'Role Profil Diubah',
  profile_updated: 'Profil Diubah',
  push_token_transferred: 'Token Push Dipindahkan',
  reporting_line_cleared: 'Atasan Dilepas',
  reporting_line_set: 'Atasan Ditetapkan',
  review_approve: 'Review Disetujui',
  review_instance_approve: 'Review Instance Disetujui',
  review_instance_reject: 'Review Instance Ditolak',
  review_reject: 'Review Ditolak',
  score_formula_activated: 'Formula Diaktifkan',
  score_formula_changed: 'Formula Diubah',
  score_formula_draft_created: 'Draft Formula Dibuat',
  score_formula_weights_updated: 'Bobot Formula Diubah',
  score_override_applied: 'Override Skor Diterapkan',
  scores_calculated: 'Skor Dihitung',
  set_repeat_rule: 'Jadwal Repeat Diatur',
  setting_updated: 'Pengaturan Diubah',
  settings_legacy_purged: 'Pengaturan Warisan Dibersihkan',
  start: 'Dimulai',
  submit: 'Bukti Disubmit',
  submit_instance: 'Bukti Instance Disubmit',
  target_breakdown_updated: 'Target Breakdown Diubah',
  team_member_assigned: 'Anggota Tim Ditambahkan',
  team_member_removed: 'Anggota Tim Dilepas',
  update: 'Diubah',
  user_permission_granted: 'Hak Akses Diberikan',
  user_permission_revoked: 'Hak Akses Dicabut',
  violation_resolved: 'Pelanggaran Diselesaikan',
};

/** Label aman untuk satu `action`. Tidak pernah mengembalikan string kosong:
 *  action tak dikenal / nilai kosong jatuh balik ke nilai mentah, lalu ke '—'. */
export function activityLogActionLabel(action: string | null | undefined): string {
  const raw = (action ?? '').trim();
  if (raw === '') return '—';
  return ACTIVITY_LOG_ACTION_LABEL[raw] ?? raw;
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
