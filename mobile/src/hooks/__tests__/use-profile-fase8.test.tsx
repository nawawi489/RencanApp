// Hooks Fase 8 — useProfile.can() untuk permission keys baru. Mock supabase + auth-provider.
// Mirror client HARUS cocok server has_permission (migration 0041): c_level/management default
// manage_teams/review_deadline_changes + create card; create_department kini admin-only (PRD
// §34.3, ISSUE-001) → butuh grant eksplisit. Key Fase 8 lain juga butuh grant eksplisit.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockGetUser = jest.fn();
const mockSingle = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => {
      const b: Record<string, unknown> = {};
      for (const k of ['select', 'eq']) b[k] = () => b;
      b.single = () => mockSingle();
      return b;
    },
  },
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));

// eslint-disable-next-line import/first
import { useProfile } from '../use-profile';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { wrapper };
}

function profileRow(level: string, grantedKeys: string[] = []) {
  return {
    data: {
      id: 'u1',
      full_name: 'U',
      email: 'u@x.id',
      organization_id: 'o1',
      created_at: null,
      role_templates: { name: 'R', level },
      organizations: { name: 'Org' },
      user_permissions: grantedKeys.map((k) => ({ granted: true, permissions: { key: k } })),
    },
    error: null,
  };
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockSingle.mockReset();
});

it('[F8-H30] can() mengenali create_department via permissionKeys (grant eksplisit staff)', async () => {
  mockSingle.mockResolvedValue(profileRow('staff', ['create_department']));
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useProfile(), { wrapper });
  await waitFor(() => expect(result.current.profile).toBeTruthy());
  expect(result.current.can('create_department')).toBe(true);
});

it('[F8-H31] no-leak: c_level TIDAK default manage_confidential_access / create_department (cocok server)', async () => {
  mockSingle.mockResolvedValue(profileRow('c_level', []));
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useProfile(), { wrapper });
  await waitFor(() => expect(result.current.profile).toBeTruthy());
  // key yang BUKAN default management → harus false tanpa grant eksplisit
  expect(result.current.can('manage_confidential_access')).toBe(false);
  expect(result.current.can('manage_positions')).toBe(false);
  expect(result.current.can('manage_video_briefs')).toBe(false);
  // create_department kini admin-only (ISSUE-001, PRD §34.3) → BUKAN default c_level
  expect(result.current.can('create_department')).toBe(false);
  // default management sah tetap berlaku
  expect(result.current.can('review_deadline_changes')).toBe(true);
});

it('[F8-H32] CEO bypass true untuk semua key Fase 8', async () => {
  mockSingle.mockResolvedValue(profileRow('ceo', []));
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useProfile(), { wrapper });
  await waitFor(() => expect(result.current.profile).toBeTruthy());
  for (const k of [
    'create_department', 'manage_positions', 'manage_teams', 'manage_confidential_access',
    'review_deadline_changes', 'manage_video_briefs', 'view_activity_log', 'view_governance_violation',
  ]) {
    expect(result.current.can(k)).toBe(true);
  }
});
