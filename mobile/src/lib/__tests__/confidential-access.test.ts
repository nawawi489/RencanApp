// Fase 8 data layer — Confidential Access Rules.
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// eslint-disable-next-line import/first
import { makeQueryThenable, someCall } from '@/test-support/fase8-builders';
// eslint-disable-next-line import/first
import { grantConfidentialAccess, listConfidentialAccessRules } from '../confidential-access';

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

it('[25] listConfidentialAccessRules eq entity_type DAN entity_id', async () => {
  const { builder, calls } = makeQueryThenable({ data: [], error: null });
  mockFrom.mockReturnValue(builder);
  await listConfidentialAccessRules('action_plan', 'i1');
  expect(mockFrom).toHaveBeenCalledWith('confidential_access_rules');
  expect(someCall(calls, 'eq', (a) => a[0] === 'entity_type' && a[1] === 'action_plan')).toBe(true);
  expect(someCall(calls, 'eq', (a) => a[0] === 'entity_id' && a[1] === 'i1')).toBe(true);
});

it('[25b] listConfidentialAccessRules propagasi error', async () => {
  const { builder } = makeQueryThenable({ data: null, error: { message: 'denied' } });
  mockFrom.mockReturnValue(builder);
  await expect(listConfidentialAccessRules('goal', 'g1')).rejects.toEqual({ message: 'denied' });
});

it('[26] grantConfidentialAccess memanggil rpc 5 params return uuid', async () => {
  mockRpc.mockResolvedValue({ data: 'r1', error: null });
  const id = await grantConfidentialAccess({
    entityType: 'action_plan',
    entityId: 'i1',
    userId: 'u2',
    accessLevel: 'confidential',
    reason: 'sensitif',
  });
  expect(mockRpc).toHaveBeenCalledWith('grant_confidential_access', {
    p_entity_type: 'action_plan',
    p_entity_id: 'i1',
    p_user_id: 'u2',
    p_access_level: 'confidential',
    p_reason: 'sensitif',
  });
  expect(id).toBe('r1');
});
