// Fase 8 data layer — Activity Log & Governance Violation (read-only).
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a) },
}));

// eslint-disable-next-line import/first
import { makeQueryThenable, someCall } from '@/test-support/fase8-builders';
// eslint-disable-next-line import/first
import {
  GOVERNANCE_VIOLATION_SEVERITY_TONE,
  listActivityLog,
  listGovernanceViolations,
} from '../activity-governance';

beforeEach(() => {
  mockFrom.mockReset();
});

it('[4] GOVERNANCE_VIOLATION_SEVERITY_TONE memetakan 4 tier ke tone', () => {
  expect(GOVERNANCE_VIOLATION_SEVERITY_TONE.low).toBe('neutral');
  expect(GOVERNANCE_VIOLATION_SEVERITY_TONE.medium).toBe('warn');
  expect(GOVERNANCE_VIOLATION_SEVERITY_TONE.high).toBe('warn');
  expect(GOVERNANCE_VIOLATION_SEVERITY_TONE.critical).toBe('danger');
});

it('[27] listActivityLog order created_at desc + filter action', async () => {
  const { builder, calls } = makeQueryThenable({ data: [], error: null });
  mockFrom.mockReturnValue(builder);
  await listActivityLog({ action: 'create' });
  expect(mockFrom).toHaveBeenCalledWith('activity_logs');
  expect(someCall(calls, 'order', (a) => a[0] === 'created_at')).toBe(true);
  expect(someCall(calls, 'eq', (a) => a[0] === 'action' && a[1] === 'create')).toBe(true);
});

it('[28] listActivityLog tanpa opts tidak filter action', async () => {
  const { builder, calls } = makeQueryThenable({ data: [], error: null });
  mockFrom.mockReturnValue(builder);
  await listActivityLog();
  expect(someCall(calls, 'eq', (a) => a[0] === 'action')).toBe(false);
});

it('[28b] listActivityLog paginasi via range(page)', async () => {
  const { builder, calls } = makeQueryThenable({ data: [], error: null });
  mockFrom.mockReturnValue(builder);
  await listActivityLog({ page: 1, limit: 50 });
  // page 1 → range(50, 99)
  expect(someCall(calls, 'range', (a) => a[0] === 50 && a[1] === 99)).toBe(true);
});

it('[29] listGovernanceViolations order desc + filter severity', async () => {
  const { builder, calls } = makeQueryThenable({ data: [], error: null });
  mockFrom.mockReturnValue(builder);
  await listGovernanceViolations({ severity: 'critical' });
  expect(mockFrom).toHaveBeenCalledWith('governance_violations');
  expect(someCall(calls, 'order', (a) => a[0] === 'created_at')).toBe(true);
  expect(someCall(calls, 'eq', (a) => a[0] === 'severity' && a[1] === 'critical')).toBe(true);
});

it('[30] listGovernanceViolations propagasi error', async () => {
  const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
  mockFrom.mockReturnValue(builder);
  await expect(listGovernanceViolations()).rejects.toEqual({ message: 'boom' });
});
