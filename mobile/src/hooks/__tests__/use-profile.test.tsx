// Hooks Fase 3 / G0 — use-profile. Membuktikan profiles.created_at di-select & ter-map (cegah
// false-green onboarding AC-H12) + getProfileAgeInDays null-guard (CF-2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockGetUser = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return { eq: (...e: unknown[]) => {
          mockEq(...e);
          return { single: (...s: unknown[]) => mockSingle(...s) };
        } };
      },
    }),
  },
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { getProfileAgeInDays, useProfile } from '../use-profile';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockSingle.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockSingle.mockResolvedValue({
    data: {
      id: 'u1',
      full_name: 'Budi',
      email: 'budi@x.id',
      organization_id: 'org1',
      created_at: '2026-06-20T00:00:00Z',
      role_templates: { name: 'Staff', level: 'staff' },
      organizations: { name: 'Nyantuy' },
      user_permissions: [],
    },
    error: null,
  });
});

describe('getProfileAgeInDays (CF-2)', () => {
  it('[1] menghitung usia dalam hari dari created_at', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    expect(getProfileAgeInDays(fiveDaysAgo)).toBeGreaterThanOrEqual(4.9);
    expect(getProfileAgeInDays(fiveDaysAgo)).toBeLessThanOrEqual(5.1);
  });

  it('[2] null/undefined/invalid → Infinity (hint disembunyikan, tidak crash)', () => {
    expect(getProfileAgeInDays(null)).toBe(Infinity);
    expect(getProfileAgeInDays(undefined)).toBe(Infinity);
    expect(getProfileAgeInDays('bukan-tanggal')).toBe(Infinity);
  });
});

describe('useProfile select created_at', () => {
  it('[3] menyertakan created_at di kolom select (dependency gate AC-H12)', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(mockSelect).toHaveBeenCalled());
    expect(mockSelect.mock.calls[0][0]).toContain('created_at');
  });

  it('[4] memetakan created_at ke CurrentProfile', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.profile?.created_at).toBe('2026-06-20T00:00:00Z');
  });
});
