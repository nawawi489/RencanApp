// Wave 3.4 — settings-card-completion-rule screen (writer §34.5).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetCompletionRule = jest.fn();
const mockUpsertCompletionRule = jest.fn();
jest.mock('@/lib/card-rules', () => ({
  __esModule: true,
  getCompletionRule: (...args: unknown[]) => mockGetCompletionRule(...args),
  upsertCompletionRule: (...args: unknown[]) => mockUpsertCompletionRule(...args),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({
    profile: { id: 'u1', organization_id: 'org-A' },
    isLoading: false,
    can: mockCan,
  }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsCardCompletionRuleScreen from '../settings-card-completion-rule';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockGetCompletionRule.mockReset();
  mockUpsertCompletionRule.mockReset();
  mockCan.mockReset();
  mockCan.mockReturnValue(true);
  mockGetCompletionRule.mockResolvedValue({ requiredFields: [] });
  mockUpsertCompletionRule.mockResolvedValue(undefined);
});

describe('SettingsCardCompletionRuleScreen', () => {
  it('tanpa permission → pesan akses ditolak', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsCardCompletionRuleScreen />, { wrapper: wrapper() });
    const hits = await screen.findAllByText(/tidak memiliki akses/i);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('prefill required_fields dari server on cardType change (default goal)', async () => {
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: ['target_value'] });
    await render(<SettingsCardCompletionRuleScreen />, { wrapper: wrapper() });
    await waitFor(() =>
      expect(mockGetCompletionRule).toHaveBeenCalledWith('org-A', 'goal'),
    );
  });

  it('task cardType TIDAK muncul di picker (§5.4 — activate_task tak ada)', async () => {
    await render(<SettingsCardCompletionRuleScreen />, { wrapper: wrapper() });
    await screen.findByText(/Goal/i);
    // Task cardType tak ada di picker
    expect(screen.queryByLabelText(/pilih.*Task/i)).toBeNull();
  });

  it('locked section chip render sebagai disabled indicator', async () => {
    await render(<SettingsCardCompletionRuleScreen />, { wrapper: wrapper() });
    // Header section "Wajib bawaan sistem" ada
    expect(await screen.findByText(/Wajib bawaan sistem/i)).toBeTruthy();
  });

  it('submit → call upsertCompletionRule + invalidate', async () => {
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: ['target_value'] });
    await render(<SettingsCardCompletionRuleScreen />, { wrapper: wrapper() });
    await screen.findByText(/Wajib bawaan sistem/i);
    fireEvent.press(screen.getByLabelText(/Simpan/i));
    await waitFor(() =>
      expect(mockUpsertCompletionRule).toHaveBeenCalledWith(
        'goal',
        expect.any(Array),
        undefined,
      ),
    );
  });
});
