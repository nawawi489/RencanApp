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
// eslint-disable-next-line import/first
import { MGR_DEFAULT_KEYS } from '@/lib/permission-defaults';

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

// K4 — guard regresi cermin client-side dari public.has_permission.
// can() di use-profile.ts HANYA mirror; penegak akhir tetap server (RLS/RPC),
// diuji terpisah di supabase/tests contract (A-INS). Test ini menjaga agar
// ROLE_DEFAULTS + grant eksplisit tidak bocor (mis. create_goal/create_kpi_area
// TIDAK boleh tersedia ke c_level default).
describe('K4 — permission create planning card', () => {
  // Helper: bentuk profil mengikuti ProfileRow (lihat use-profile.ts).
  function profileRow(
    level: string,
    userPermissions: { granted: boolean; permissions: { key: string } }[],
  ) {
    return {
      data: {
        id: 'u1',
        full_name: 'Budi',
        email: 'budi@x.id',
        organization_id: 'org1',
        created_at: '2026-06-20T00:00:00Z',
        role_templates: { name: level, level },
        organizations: { name: 'Nyantuy' },
        user_permissions: userPermissions,
      },
      error: null,
    };
  }

  it('[K4-1] CEO bypass: semua planning card boleh', async () => {
    mockSingle.mockResolvedValue(profileRow('ceo', []));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.can('create_goal')).toBe(true);
    expect(result.current.can('create_kpi_area')).toBe(true);
    expect(result.current.can('create_strategy')).toBe(true);
  });

  it('[K4-2] C-Level default: strategy boleh, goal/kpi_area tidak (tidak bocor)', async () => {
    mockSingle.mockResolvedValue(profileRow('c_level', []));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.can('create_goal')).toBe(false);
    expect(result.current.can('create_kpi_area')).toBe(false);
    expect(result.current.can('create_strategy')).toBe(true);
  });

  it('[K4-3] grant eksplisit: hanya key yang di-grant yang boleh', async () => {
    mockSingle.mockResolvedValue(
      profileRow('staff', [{ granted: true, permissions: { key: 'create_goal' } }]),
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.can('create_goal')).toBe(true);
    expect(result.current.can('create_kpi_area')).toBe(false);
  });

  // Fase 6 — create_development_area mirror server (CN-7). Server-side test ada di
  // supabase/tests/fase6_development_workspace_contract.sql TEST4.
  it('[F6-K4-4] CEO bypass: create_development_area boleh', async () => {
    mockSingle.mockResolvedValue(profileRow('ceo', []));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.can('create_development_area')).toBe(true);
  });

  it('[F6-K4-5] C-Level default: create_development_area TIDAK boleh (tidak bocor)', async () => {
    mockSingle.mockResolvedValue(profileRow('c_level', []));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.can('create_development_area')).toBe(false);
  });

  it('[F6-K4-6] Management default: create_development_area TIDAK boleh', async () => {
    mockSingle.mockResolvedValue(profileRow('management', []));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.can('create_development_area')).toBe(false);
  });

  it('[F6-K4-7] grant eksplisit C-Level: create_development_area boleh', async () => {
    mockSingle.mockResolvedValue(
      profileRow('c_level', [
        { granted: true, permissions: { key: 'create_development_area' } },
      ]),
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.profile).toBeTruthy());
    expect(result.current.can('create_development_area')).toBe(true);
  });

  // K6 — anti-drift 3-arah (#35): MGR_DEFAULT_KEYS (klien) WAJIB identik dengan default
  // server has_permission (0016) & is_default (0017). Test mengunci sisi klien: konstanta + can().
  describe('K6 — anti-drift default role (#35)', () => {
    it('[K6-1] MGR_DEFAULT_KEYS = 6 key kanonik (sumber tunggal klien)', () => {
      expect([...MGR_DEFAULT_KEYS].sort()).toEqual(
        [
          'create_action_plan',
          'create_department',
          'create_initiative',
          'create_strategy',
          'manage_teams',
          'review_deadline_changes',
        ].sort(),
      );
    });

    it('[K6-2] c_level default: tiap MGR_DEFAULT_KEYS → can() true', async () => {
      mockSingle.mockResolvedValue(profileRow('c_level', []));
      const { wrapper } = makeWrapper();
      const { result } = await renderHook(() => useProfile(), { wrapper });
      await waitFor(() => expect(result.current.profile).toBeTruthy());
      for (const key of MGR_DEFAULT_KEYS) {
        expect(result.current.can(key)).toBe(true);
      }
    });

    it('[K6-3] non-default (manage_users_permissions) TIDAK default ke management', async () => {
      mockSingle.mockResolvedValue(profileRow('management', []));
      const { wrapper } = makeWrapper();
      const { result } = await renderHook(() => useProfile(), { wrapper });
      await waitFor(() => expect(result.current.profile).toBeTruthy());
      expect(result.current.can('manage_users_permissions')).toBe(false);
    });
  });
});
