// UI Fase 8 — layar Settings: index SECTIONS, org-structure, activity-log, governance-violation,
// confidential-access, card-completion-rule, card-guidance, notifications-rule, archive.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.single = async () => ({ data: null, error: { message: 'skip' } });
      return b;
    },
  },
}));

const mockUpsertSettings = jest.fn();
jest.mock('@/lib/governance-admin', () => ({
  ...jest.requireActual('@/lib/governance-admin'),
  upsertSettings: (...a: unknown[]) => mockUpsertSettings(...a),
}));

const mockPush = jest.fn();
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1', email: 'e@x.id' } }, signOut: jest.fn() }),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1', role_level: 'ceo' }, isLoading: false, can: mockCan }),
}));

const mockUseOrgStructure = jest.fn();
const mockCreateDepartment = jest.fn();
jest.mock('@/hooks/use-org-structure', () => ({
  __esModule: true,
  useOrgStructure: () => mockUseOrgStructure(),
  useOrgActions: () => ({ createDepartment: mockCreateDepartment, createTeam: jest.fn(), assignTeamMember: jest.fn(), isPending: false }),
}));

const mockUseActivityLog = jest.fn();
const mockUseGovViolations = jest.fn();
jest.mock('@/hooks/use-activity-governance', () => ({
  __esModule: true,
  useActivityLog: () => mockUseActivityLog(),
  useGovernanceViolations: () => mockUseGovViolations(),
}));

const mockUseConfRules = jest.fn();
jest.mock('@/hooks/use-confidential-access', () => ({
  __esModule: true,
  useConfidentialAccessRules: () => mockUseConfRules(),
  useConfidentialAccessActions: () => ({ grantAccess: jest.fn(), isPending: false }),
}));

const mockUseSearch = jest.fn();
jest.mock('@/hooks/use-search', () => ({
  __esModule: true,
  useSearchCards: () => mockUseSearch(),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ entityType: 'action_plan', entityId: 'i1' }),
}));

// eslint-disable-next-line import/first
import SettingsOrgStructureScreen from '../settings-org-structure';
// eslint-disable-next-line import/first
import SettingsActivityLogScreen from '../settings-activity-log';
// eslint-disable-next-line import/first
import SettingsGovernanceViolationScreen from '../settings-governance-violation';
// eslint-disable-next-line import/first
import SettingsConfidentialAccessScreen from '../settings-confidential-access';
// eslint-disable-next-line import/first
import SettingsCardCompletionRuleScreen from '../settings-card-completion-rule';
// eslint-disable-next-line import/first
import SettingsCardGuidanceScreen from '../settings-card-guidance';
// eslint-disable-next-line import/first
import SettingsNotificationsRuleScreen from '../settings-notifications-rule';
// eslint-disable-next-line import/first
import SettingsArchiveScreen from '../settings-archive';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TestWrapper';
  return W;
}

beforeEach(() => {
  mockCan.mockReset().mockReturnValue(true);
  mockUpsertSettings.mockReset().mockResolvedValue(undefined);
  mockCreateDepartment.mockReset().mockResolvedValue('d1');
  mockPush.mockReset();
  mockUseOrgStructure.mockReset().mockReturnValue({ departments: [{ id: 'd1', name: 'Operasi', is_active: true }], isLoading: false });
  mockUseActivityLog.mockReset().mockReturnValue({ logs: [], isLoading: false });
  mockUseGovViolations.mockReset().mockReturnValue({ violations: [], isLoading: false });
  mockUseConfRules.mockReset().mockReturnValue({ rules: [], isLoading: false, isAccessGranted: false });
  mockUseSearch.mockReset().mockReturnValue({ results: [], isLoading: false, enabled: false });
});

describe('settings-org-structure', () => {
  it('[F8-UI-03] tanpa permission → akses ditolak', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
  });

  it('[F8-UI-04] dengan permission → daftar departemen + tombol tambah', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Operasi')).toBeTruthy();
    expect(screen.getByLabelText('+ Departemen Baru')).toBeTruthy();
  });

  it('[F8-UI-05] loading → SkeletonList', async () => {
    mockCan.mockReturnValue(true);
    mockUseOrgStructure.mockReturnValue({ departments: [], isLoading: true });
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Memuat…')).toBeTruthy();
  });
});

describe('settings-activity-log', () => {
  it('[F8-UI-06] tanpa permission → akses ditolak', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsActivityLogScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
  });

  it('[F8-UI-07] read-only: tanpa tombol hapus/edit (filter chip diizinkan)', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivityLog.mockReturnValue({
      logs: [{ id: 'a1', action: 'create', entity_type: 'goal', actor_id: 'u1' }],
      isLoading: false,
    });
    await render(<SettingsActivityLogScreen />, { wrapper: wrapper() });
    // C2 UI-S-AL1 menambah filter chip "Dibuat" → cek log entry via accessibilityLabel cari.
    expect(await screen.findByLabelText('Cari activity log')).toBeTruthy();
    // tidak ada tombol mutasi (hapus/edit) — yang ada hanya chip filter (role=radio, bukan button).
    expect(screen.queryByLabelText(/hapus/i)).toBeNull();
    expect(screen.queryByLabelText(/edit/i)).toBeNull();
  });

  it('[F8-UI-08] actor_id null → "Sistem"', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivityLog.mockReturnValue({
      logs: [{ id: 'a1', action: 'setting_updated', entity_type: 'settings', actor_id: null }],
      isLoading: false,
    });
    await render(<SettingsActivityLogScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Sistem/)).toBeTruthy();
  });
});

describe('settings-governance-violation', () => {
  it('[F8-UI-09] tanpa permission → akses ditolak', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsGovernanceViolationScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
  });

  it('[F8-UI-10] severity badge menampilkan label teks (bukan hanya warna)', async () => {
    mockCan.mockReturnValue(true);
    mockUseGovViolations.mockReturnValue({
      violations: [{ id: 'v1', violation_type: 'self_evaluation', severity: 'high', entity_type: 'action_plan' }],
      isLoading: false,
    });
    await render(<SettingsGovernanceViolationScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tinggi')).toBeTruthy();
  });
});

describe('settings-confidential-access', () => {
  it('[F8-UI-21] tanpa permission → akses ditolak', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsConfidentialAccessScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
  });

  it('[F8-UI-22] dengan permission → daftar rule (entity_type, user, access_level)', async () => {
    mockCan.mockReturnValue(true);
    mockUseConfRules.mockReturnValue({
      rules: [{ id: 'r1', entity_type: 'action_plan', user_id: 'u2', access_level: 'confidential' }],
      isLoading: false,
      isAccessGranted: true,
    });
    await render(<SettingsConfidentialAccessScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rahasia')).toBeTruthy();
    expect(screen.getByText(/u2/)).toBeTruthy();
  });
});

// F8-UI-23/24/28: SUPERSEDED by Wave 3 tests (migration 0078 pivot ke tabel dedicated):
// - src/app/(app)/__tests__/settings-card-completion-rule-screen.test.tsx (5 tests)
// - src/app/(app)/__tests__/settings-card-guidance-screen.test.tsx (4 tests)
// Legacy `upsertSettings` untuk kedua screen dihapus per spec settings-consumers §4.7.
// Blocks di sini dihapus untuk menghindari coverage ganda + false-negative.

describe('settings-notifications-rule', () => {
  it('[F8-UI-26] submit key valid; RPC reject → pesan error inline', async () => {
    mockCan.mockReturnValue(true);
    mockUpsertSettings.mockRejectedValueOnce(new Error('Kunci pengaturan tidak valid.'));
    await render(<SettingsNotificationsRuleScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Simpan Aturan Notifikasi'));
    expect(await screen.findByText(/tidak valid/i)).toBeTruthy();
    expect(mockUpsertSettings).toHaveBeenCalledWith('notification_rule_deadline_reminder', expect.any(Object));
  });
});

describe('settings-archive', () => {
  it('[F8-UI-27] daftar archived + tombol Pulihkan (UI-S-AR1) tanpa hapus permanen', async () => {
    mockUseSearch.mockReturnValue({
      results: [{ id: 'g1', entity_type: 'goal', name: 'Goal Lama', status: 'archived' }],
      isLoading: false,
      enabled: true,
    });
    await render(<SettingsArchiveScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Goal Lama')).toBeTruthy();
    // tidak ada tombol hapus permanen — tetap absen.
    expect(screen.queryByLabelText(/hapus/i)).toBeNull();
    // C5 UI-S-AR1: tombol Pulihkan tampil per row (governance-safe: restore_card → status 'draft').
    expect(screen.getByLabelText('Pulihkan ke Draft')).toBeTruthy();
  });
});
