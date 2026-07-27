// Pure function: resolve entity push-data ke Expo Router path.
// null = tipe entity tidak dikenal → caller memutuskan fallback (lihat
// NOTIFICATIONS_FALLBACK_ROUTE).
//
// Audit 2026-07-26 (S3-7): 4 dari 7 tipe entitas hidup me-resolve ke null
// karena resolver hanya menutup CardEntityType + `task_instance`. Migrasi
// aktif juga memancarkan `chat_message` (0008), `period_snapshot` (0081), dan
// `user_permission` (0084). Tes lama menyematkan literal rute + membangun
// input dari ENTITY_ROUTE_SEGMENT itu sendiri — jadi tak mungkin gagal ketika
// resolver rusak. Sekarang tes parse literal `emit_notification` dari
// migrations/ dan memaksa setiap entity_type live punya rute.
import { ENTITY_ROUTE_SEGMENT } from './entity-routes';
import type { CardEntityType } from './governance-admin';

// Fallback saat resolver mengembalikan null. Tab Notifikasi adalah tujuan
// aman & selalu ada.
export const NOTIFICATIONS_FALLBACK_ROUTE = '/(app)/(tabs)/notifications';

// Rute non-card, per entity_type. Untuk tipe yang punya "koleksi" tapi tidak
// ada layar detail per-id (period_snapshot: notif reminder tak menuju halaman
// snapshot spesifik; chat_message: entity_id = message_id, layar chat pakai
// room_id; user_permission: notif "permission_changed" untuk pemegang bergerak
// ke profil sendiri) — arahkan ke landing paling kontekstual.
const NON_CARD_ROUTE: Record<string, string> = {
  task_instance: '/(app)/task/instance',
  chat_message: '/(app)/(tabs)/inbox',
  period_snapshot: '/(app)/(tabs)/notifications',
  user_permission: '/(app)/settings-profile',
};

// Entity_type yang membutuhkan `${id}` appended (rute per-detail).
const NON_CARD_APPENDS_ID = new Set<string>(['task_instance']);

export function resolveNotificationRoute(
  entityType: string | null | undefined,
  entityId: string,
): string | null {
  if (!entityType || !entityId) return null;

  const segment = ENTITY_ROUTE_SEGMENT[entityType as CardEntityType];
  if (segment) return `/(app)/${segment}/${entityId}`;

  const nonCard = NON_CARD_ROUTE[entityType];
  if (nonCard) {
    return NON_CARD_APPENDS_ID.has(entityType) ? `${nonCard}/${entityId}` : nonCard;
  }

  return null;
}
