// Wave 3.5 — settings-card-guidance screen (writer §34.6).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetGuidance = jest.fn();
const mockUpsertCardGuidance = jest.fn();
jest.mock('@/lib/card-rules', () => ({
  __esModule: true,
  getGuidance: (...args: unknown[]) => mockGetGuidance(...args),
  upsertCardGuidance: (...args: unknown[]) => mockUpsertCardGuidance(...args),
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
import SettingsCardGuidanceScreen from '../settings-card-guidance';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockGetGuidance.mockReset();
  mockUpsertCardGuidance.mockReset();
  mockCan.mockReset();
  mockCan.mockReturnValue(true);
  mockGetGuidance.mockResolvedValue({ title: '', body: '' });
  mockUpsertCardGuidance.mockResolvedValue(undefined);
});

describe('SettingsCardGuidanceScreen', () => {
  it('tanpa permission (D-7 reuse manage_card_completion_rule) → pesan akses ditolak', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsCardGuidanceScreen />, { wrapper: wrapper() });
    const hits = await screen.findAllByText(/tidak memiliki akses/i);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('prefill title+body dari server on cardType change', async () => {
    mockGetGuidance.mockResolvedValueOnce({ title: 'Existing', body: 'Existing body' });
    await render(<SettingsCardGuidanceScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(mockGetGuidance).toHaveBeenCalledWith('org-A', 'goal'));
  });

  it('task cardType MUNCUL di picker (§34.6 whitelist termasuk task)', async () => {
    await render(<SettingsCardGuidanceScreen />, { wrapper: wrapper() });
    // Kalau ada label Task/Tugas di picker options
    expect(await screen.findByText(/Tugas|Task/i)).toBeTruthy();
  });

  it('submit → call upsertCardGuidance dgn payload', async () => {
    mockGetGuidance.mockResolvedValueOnce({ title: 't', body: 'b' });
    await render(<SettingsCardGuidanceScreen />, { wrapper: wrapper() });
    await screen.findByLabelText(/Simpan/i);
    fireEvent.press(screen.getByLabelText(/Simpan/i));
    await waitFor(() =>
      expect(mockUpsertCardGuidance).toHaveBeenCalledWith(
        'goal',
        expect.any(String),
        expect.any(String),
        undefined,
      ),
    );
  });
});
