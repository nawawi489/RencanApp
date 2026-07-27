// Data layer Fase 3 — Notifications. Pemanggil tipis; RLS membatasi baris ke recipient = auth.uid(),
// semua tulis lewat RPC SECURITY DEFINER (append-only). Tipe baris di-hand-define s/d regen
// database.types.ts (ganti ke Tables<'notifications'> setelah migrasi 0008 diterapkan).
import { supabase } from './supabase';

export const NOTIFICATION_TYPES = [
  'review_request',
  'approved',
  'rejected',
  'deadline_reminder',
  'repeat_due',
  'instance_missed',
  'comment',
  'mention',
  'governance_warning',
  // DCR (migration 0014 + 0038) — dulu terkirim dari DB tapi tak dikenali client → Badge/ikon kosong.
  'deadline_change_requested',
  'deadline_change_approved',
  'deadline_change_rejected',
  'deadline_change_revision_requested',
  // B-1 score-period-end-nudge (migrasi 0081) — pengingat periode skoring akan/sudah berakhir.
  'period_closing_reminder',
  // BL-07 (migrasi 0084) — tiga jenis §28 yang sebelumnya tak punya emitter sama sekali.
  // 'evidence_submitted' HANYA menyala di jalur review_required = false (D-BL07-1); saat review
  // diperlukan, reviewer tetap menerima 'review_request' seperti biasa dan tidak dinotifikasi dua kali.
  'evidence_submitted',
  // 'deadline_overdue' = fakta turunan (deadline < org_today), BUKAN status kartu (D-BL07-2).
  'deadline_overdue',
  'permission_changed',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationResolution =
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'resubmitted'
  | 'superseded';

export type Notification = {
  id: string;
  organization_id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  entity_type: string;
  entity_id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  read_at: string | null;
  dedupe_date: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution: NotificationResolution | null;
};

// ---------------------------------------------------------------- label & tone

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  review_request: 'Permintaan Review',
  approved: 'Disetujui',
  rejected: 'Perlu Revisi',
  deadline_reminder: 'Deadline Mendekat',
  repeat_due: 'Tugas Rutin',
  instance_missed: 'Terlewat',
  comment: 'Komentar',
  mention: 'Sebutan',
  governance_warning: 'Peringatan Governance',
  deadline_change_requested: 'Permintaan Perubahan Deadline',
  deadline_change_approved: 'Perubahan Deadline Disetujui',
  deadline_change_rejected: 'Perubahan Deadline Ditolak',
  deadline_change_revision_requested: 'Perubahan Deadline Perlu Revisi',
  period_closing_reminder: 'Periode Skoring',
  evidence_submitted: 'Bukti Dikirim',
  deadline_overdue: 'Deadline Terlewat',
  permission_changed: 'Hak Akses Berubah',
};

export const NOTIFICATION_TYPE_TONE: Record<
  NotificationType,
  'neutral' | 'info' | 'warn' | 'success' | 'danger'
> = {
  review_request: 'warn',
  approved: 'success',
  rejected: 'danger',
  deadline_reminder: 'warn',
  repeat_due: 'info',
  instance_missed: 'danger',
  comment: 'info',
  mention: 'info',
  governance_warning: 'danger',
  deadline_change_requested: 'warn',
  deadline_change_approved: 'success',
  deadline_change_rejected: 'danger',
  deadline_change_revision_requested: 'warn',
  // 'warn', bukan 'danger': periode terlambat memang mendesak tapi bisa diperbaiki kapan saja
  // dengan menekan Finalisasi — bukan kondisi rusak.
  period_closing_reminder: 'warn',
  // 'info': bukti masuk pada jalur tanpa review adalah kabar netral bagi pembuat card —
  // tidak ada yang perlu ditindak, hanya perlu diketahui.
  evidence_submitted: 'info',
  // 'danger' sejajar instance_missed — keduanya berarti deadline sudah lewat.
  deadline_overdue: 'danger',
  permission_changed: 'info',
};

// ---------------------------------------------------------------- tabs

export type NotificationTab =
  | 'semua'
  | 'perlu_tindakan'
  | 'review'
  | 'deadline'
  | 'komentar'
  | 'terlewat'
  | 'repeat'
  | 'governance';

/**
 * Tipe yang ditampilkan per tab. null = tanpa filter (tab "Semua"). Setiap dari 9 tipe ter-map
 * ke ≥1 tab (tak ada orphan): review_request→review/perlu, approved→review, rejected→review/perlu,
 * deadline_reminder→deadline, repeat_due→repeat, instance_missed→terlewat, comment→komentar,
 * mention→komentar/perlu, governance_warning→governance.
 */
export function notificationTypesForTab(tab?: NotificationTab): NotificationType[] | null {
  switch (tab) {
    case undefined:
    case 'semua':
      return null;
    case 'perlu_tindakan':
      return [
        'review_request',
        'rejected',
        'mention',
        'deadline_change_requested',
        'deadline_change_revision_requested',
        // Butuh aksi admin (tekan Finalisasi) — bukan sekadar informasi.
        'period_closing_reminder',
        // Deadline sudah lewat → PIC memang harus bertindak.
        'deadline_overdue',
      ];
    case 'review':
      // evidence_submitted masuk sini, BUKAN 'perlu_tindakan': ia justru menandai submission
      // yang tidak memerlukan review, jadi tak ada aksi yang dituntut dari penerimanya.
      return ['review_request', 'approved', 'rejected', 'evidence_submitted'];
    case 'deadline':
      return [
        'deadline_reminder',
        'deadline_change_approved',
        'deadline_change_rejected',
        // Berbasis tanggal → wajar dicari di tab ini juga.
        'period_closing_reminder',
        'deadline_overdue',
      ];
    case 'komentar':
      return ['comment', 'mention'];
    case 'terlewat':
      // instance_missed = instance repeat yang terlewat (punya status 'missed');
      // deadline_overdue = tugas one-time yang lewat deadline (TANPA status — D-BL07-2).
      // Berbeda mekanisme, satu arti bagi user, jadi satu tab.
      return ['instance_missed', 'deadline_overdue'];
    case 'repeat':
      return ['repeat_due'];
    case 'governance':
      // permission_changed ditaruh di sini karena kontrol akses adalah domain governance.
      // Tab ini memfilter notifikasi milik user sendiri, jadi menempatkannya di sini tidak
      // membocorkan apa pun — penerimanya memang orang yang izinnya berubah.
      return ['governance_warning', 'permission_changed'];
  }
}

/** Jumlah notifikasi belum dibaca (is_read null/false dianggap belum dibaca). */
export function unreadCount(items: Pick<Notification, 'is_read'>[]): number {
  return items.filter((n) => !n.is_read).length;
}

// ---------------------------------------------------------------- queries

/**
 * Batas default halaman daftar notifikasi. Audit 2026-07-26 (S3-6): dulu
 * `select *` tanpa limit dipanggil DUA kali (list + unread count) tiap kunjungan
 * tab; membaca ratusan baris hanya untuk menghitung yang belum dibaca.
 * Nilai 100 cukup untuk 99% pengguna dalam satu sesi; halaman berikutnya
 * bisa ditambah kalau product analytics menunjukkan scroll melewati batas.
 */
export const NOTIFICATIONS_LIST_LIMIT = 100;

/** Daftar notifikasi penerima saat ini, terbaru dulu. tab memfilter per tipe. */
export async function listNotifications(tab?: NotificationTab): Promise<Notification[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const types = notificationTypesForTab(tab);
  let q = supabase.from('notifications').select('*').eq('recipient_id', uid);
  if (types) q = q.in('type', types);
  // Tab "Perlu Tindakan" hanya menampilkan yang masih actionable — notif yang RPC pemutus
  // sudah tandai `resolved_at` (ISSUE-005) tidak lagi menuntut aksi.
  if (tab === 'perlu_tindakan') q = q.is('resolved_at', null);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(NOTIFICATIONS_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as Notification[];
}

/**
 * S3-6: badge unread count — hanya HEAD request + `count: exact`, TIDAK menarik
 * baris. Sebelumnya badge diambil lewat `listNotifications()` (select *) lalu
 * filter di client — 100+ baris didownload hanya untuk menghasilkan 1 angka.
 */
export async function unreadNotificationsCount(): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { head: true, count: 'exact' })
    .eq('recipient_id', uid)
    .is('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------- mutations (RPC)

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
  return (data as number) ?? 0;
}
