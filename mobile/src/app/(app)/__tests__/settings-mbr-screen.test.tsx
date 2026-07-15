// UI Fase 5 — layar Settings Minimum Breakdown Rule. Gated permission manage_minimum_breakdown_rule.
// Daftar rule (label "Parent → Child"), edit mode + min_count via setRule; goal→strategy terkunci.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseMbrRules = jest.fn();
const mockSetRule = jest.fn();
jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrRules: () => mockUseMbrRules(),
  useMbrRuleActions: () => ({ setRule: mockSetRule, isSubmitting: false }),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: mockCan }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsMbrScreen from '../settings-mbr';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const RULES = [
  {
    id: 'sys-goal',
    organization_id: null,
    parent_card_type: 'goal',
    child_card_type: 'strategy',
    min_count: 1,
    enforcement_mode: 'blokir_aktivasi',
    created_at: null,
    updated_at: null,
    updated_by: null,
  },
  {
    id: 'sys-kpi',
    organization_id: null,
    parent_card_type: 'strategy',
    child_card_type: 'initiative',
    min_count: 2,
    enforcement_mode: 'hanya_peringatan',
    created_at: null,
    updated_at: null,
    updated_by: null,
  },
];

beforeEach(() => {
  mockUseMbrRules.mockReset();
  mockSetRule.mockReset();
  mockCan.mockReset();
  mockSetRule.mockResolvedValue('rule-id');
  mockUseMbrRules.mockReturnValue({ rules: RULES, isLoading: false, isError: false, refetch: jest.fn() });
});

describe('SettingsMbrScreen', () => {
  it('[1] tanpa permission → pesan akses ditolak, daftar rule TIDAK dirender', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsMbrScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
    expect(screen.queryByText('Strategi → Inisiatif')).toBeNull();
  });

  it('[2] dengan permission → menampilkan rule sebagai "Parent → Child" + mode + minimum', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsMbrScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Strategi → Inisiatif')).toBeTruthy();
    expect(screen.getByText('Goal → Strategi')).toBeTruthy();
    // mode saat ini terlihat (badge + tombol picker keduanya berlabel sama → >=1)
    expect(screen.getAllByText('Hanya Peringatan').length).toBeGreaterThanOrEqual(1);
    // minimum saat ini (2) terlihat
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('[3] menaikkan minimum memanggil setRule dengan min_count+1 & mode saat ini', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsMbrScreen />, { wrapper: wrapper() });
    await screen.findByText('Strategi → Inisiatif');
    fireEvent.press(screen.getByLabelText('Tambah minimum Strategi → Inisiatif'));
    await waitFor(() =>
      expect(mockSetRule).toHaveBeenCalledWith({
        parentCardType: 'strategy',
        childCardType: 'initiative',
        minCount: 3,
        enforcementMode: 'hanya_peringatan',
      }),
    );
  });

  it('[4] memilih mode Blokir Aktivasi memanggil setRule dengan mode baru & min saat ini', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsMbrScreen />, { wrapper: wrapper() });
    await screen.findByText('Strategi → Inisiatif');
    fireEvent.press(screen.getByLabelText('Set Blokir Aktivasi untuk Strategi → Inisiatif'));
    await waitFor(() =>
      expect(mockSetRule).toHaveBeenCalledWith({
        parentCardType: 'strategy',
        childCardType: 'initiative',
        minCount: 2,
        enforcementMode: 'blokir_aktivasi',
      }),
    );
  });

  it('[5] rule goal→strategy terkunci: kontrol edit tidak tersedia (tampil indikator Terkunci)', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsMbrScreen />, { wrapper: wrapper() });
    await screen.findByText('Goal → Strategi');
    expect(screen.getByText('Terkunci')).toBeTruthy();
    // kontrol tambah minimum untuk goal→strategy tidak ada
    expect(screen.queryByLabelText('Tambah minimum Goal → Strategi')).toBeNull();
  });
});
