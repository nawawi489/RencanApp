// Pure function: resolve entity push-data ke Expo Router path.
// null = tipe entity tidak dikenal → caller TIDAK navigate.
import { ENTITY_ROUTE_SEGMENT } from './entity-routes';
import type { CardEntityType } from './governance-admin';

export function resolveNotificationRoute(
  entityType: string | null | undefined,
  entityId: string,
): string | null {
  if (!entityType || !entityId) return null;

  if (entityType === 'action_plan_instance') {
    return `/(app)/action-plan/instance/${entityId}`;
  }

  const segment = ENTITY_ROUTE_SEGMENT[entityType as CardEntityType];
  if (segment) return `/(app)/${segment}/${entityId}`;

  return null;
}
