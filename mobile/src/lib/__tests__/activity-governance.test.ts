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
  GOVERNANCE_VIOLATION_TYPE_LABEL,
  governanceViolationTypeLabel,
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

describe('[BL-12] governanceViolationTypeLabel', () => {
  // Setiap tipe yang benar-benar ditulis fungsi DB harus punya label Indonesia.
  const DB_EMITTED_TYPES = [
    'deadline_change_self_approval',
    'finalize_non_submitter',
    'instance_missed',
    'kpi_area_mismatch',
    'orphan_cleanup_unauthorized',
    'reviewer_override',
    'self_approval_attempt',
    'self_evaluation',
    'settings_invalid_key',
    'strategy_mismatch',
    'submit_non_pic',
  ];

  it.each(DB_EMITTED_TYPES)('memetakan %s ke label Indonesia', (type) => {
    const label = governanceViolationTypeLabel(type);
    expect(GOVERNANCE_VIOLATION_TYPE_LABEL[type]).toBeDefined();
    expect(label).toBe(GOVERNANCE_VIOLATION_TYPE_LABEL[type]);
    // Bukan snake_case mentah.
    expect(label).not.toBe(type);
    expect(label).not.toMatch(/_/);
  });

  it('fallback ke nilai mentah untuk tipe tak dikenal', () => {
    expect(governanceViolationTypeLabel('tipe_baru_dari_db')).toBe('tipe_baru_dari_db');
  });

  it('tidak pernah render kosong untuk null/undefined/whitespace', () => {
    expect(governanceViolationTypeLabel(null)).toBe('—');
    expect(governanceViolationTypeLabel(undefined)).toBe('—');
    expect(governanceViolationTypeLabel('   ')).toBe('—');
  });

  it('trim nilai mentah sebelum lookup', () => {
    expect(governanceViolationTypeLabel('  self_approval_attempt  ')).toBe(
      GOVERNANCE_VIOLATION_TYPE_LABEL.self_approval_attempt,
    );
  });
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
