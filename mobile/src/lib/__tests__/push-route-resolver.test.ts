// Step 8 REFACTOR — Unit tests untuk resolveNotificationRoute (pure function).
import { ENTITY_ROUTE_SEGMENT } from '../entity-routes';
import { resolveNotificationRoute } from '../push-route-resolver';

describe('resolveNotificationRoute', () => {
  it('[PN-ROUTE-1] action_plan → "/(app)/action-plan/{id}"', () => {
    expect(resolveNotificationRoute('action_plan', 'ap-1')).toBe('/(app)/action-plan/ap-1');
  });

  it('[PN-ROUTE-2] action_plan_instance → "/(app)/action-plan/instance/{id}"', () => {
    expect(resolveNotificationRoute('action_plan_instance', 'inst-1')).toBe(
      '/(app)/action-plan/instance/inst-1',
    );
  });

  it('[PN-ROUTE-3] entity_type null/undefined/unknown → null', () => {
    expect(resolveNotificationRoute(null, 'x')).toBeNull();
    expect(resolveNotificationRoute(undefined, 'x')).toBeNull();
    expect(resolveNotificationRoute('unknown_entity', 'x')).toBeNull();
  });

  it('[PN-ROUTE-4] semua CardEntityType menghasilkan rute yang tidak null', () => {
    const cardTypes = Object.keys(ENTITY_ROUTE_SEGMENT);
    expect(cardTypes.length).toBeGreaterThan(0);
    for (const t of cardTypes) {
      const route = resolveNotificationRoute(t, 'some-id');
      expect(route).not.toBeNull();
      expect(route).toContain('some-id');
    }
  });
});
