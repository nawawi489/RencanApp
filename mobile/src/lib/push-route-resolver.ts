// Pure function: resolve entity push-data ke Expo Router path.
// null = tipe entity tidak dikenal → caller memutuskan fallback (lihat NOTIFICATIONS_FALLBACK_ROUTE).
import { ENTITY_ROUTE_SEGMENT } from './entity-routes';
import type { CardEntityType } from './governance-admin';

// Fallback saat resolver mengembalikan null (tipe push-worthy tanpa rute detail,
// mis. period_closing_reminder → entity_type 'period_snapshot'). Tap harus selalu
// mendarat di suatu tempat; tab Notifikasi adalah tujuan yang aman & selalu ada.
export const NOTIFICATIONS_FALLBACK_ROUTE = '/(app)/(tabs)/notifications';

export function resolveNotificationRoute(
  entityType: string | null | undefined,
  entityId: string,
): string | null {
  if (!entityType || !entityId) return null;

  if (entityType === 'task_instance') {
    return `/(app)/task/instance/${entityId}`;
  }

  const segment = ENTITY_ROUTE_SEGMENT[entityType as CardEntityType];
  if (segment) return `/(app)/${segment}/${entityId}`;

  return null;
}
