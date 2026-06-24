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
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

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
      return ['review_request', 'rejected', 'mention'];
    case 'review':
      return ['review_request', 'approved', 'rejected'];
    case 'deadline':
      return ['deadline_reminder'];
    case 'komentar':
      return ['comment', 'mention'];
    case 'terlewat':
      return ['instance_missed'];
    case 'repeat':
      return ['repeat_due'];
    case 'governance':
      return ['governance_warning'];
  }
}

/** Jumlah notifikasi belum dibaca (is_read null/false dianggap belum dibaca). */
export function unreadCount(items: Pick<Notification, 'is_read'>[]): number {
  return items.filter((n) => !n.is_read).length;
}

// ---------------------------------------------------------------- queries

/** Daftar notifikasi penerima saat ini, terbaru dulu. tab memfilter per tipe. */
export async function listNotifications(tab?: NotificationTab): Promise<Notification[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const types = notificationTypesForTab(tab);
  let q = supabase.from('notifications').select('*').eq('recipient_id', uid);
  if (types) q = q.in('type', types);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Notification[];
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
