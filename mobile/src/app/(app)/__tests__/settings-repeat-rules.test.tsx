// UI — Settings > Repeat Setting. Inventory read-only repeat-rule + navigasi ke AP induk.
// PRD §31 (Menu > Pengaturan) + §23 (jadwal di edit per-AP).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListAll = jest.fn();
jest.mock('@/lib/repeat', () => {
  const actual = jest.requireActual('@/lib/repeat');
  return {
    __esModule: true,
    ...actual,
    listAllRepeatRules: (...a: unknown[]) => mockListAll(...a),
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));

// eslint-disable-next-line import/first
import SettingsRepeatRulesScreen from '../settings-repeat-rules';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockListAll.mockReset();
  mockPush.mockReset();
});

describe('Settings > Repeat Setting (inventory)', () => {
  it('empty state — tidak ada repeat rule', async () => {
    mockListAll.mockResolvedValue([]);
    await render(<SettingsRepeatRulesScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText(/Belum ada Tugas repeat/i)).toBeTruthy());
  });

  it('list — render frequency + range + status badge', async () => {
    mockListAll.mockResolvedValue([
      {
        id: 'r1',
        task_id: 'ap1',
        frequency: 'daily',
        weekdays: null,
        month_days: null,
        custom_dates: null,
        repeat_start_date: '2026-06-01',
        repeat_end_date: '2026-12-31',
        time_of_day: '17:00:00',
        missed_rule: 'strict',
        grace_period_minutes: null,
        organization_id: 'o1',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-15T00:00:00Z',
        created_by: 'u1',
        task: { id: 'ap1', name: 'Cek performa outlet harian', status: 'in_progress' },
      },
    ]);
    await render(<SettingsRepeatRulesScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Cek performa outlet harian')).toBeTruthy());
    expect(screen.getByText(/Harian · 17:00/)).toBeTruthy();
    expect(screen.getByText(/2026-06-01 → 2026-12-31/)).toBeTruthy();
  });

  it('tap row → push /task/<id>', async () => {
    mockListAll.mockResolvedValue([
      {
        id: 'r1',
        task_id: 'ap1',
        frequency: 'weekly',
        weekdays: [1, 3, 5],
        month_days: null,
        custom_dates: null,
        repeat_start_date: '2026-06-01',
        repeat_end_date: '2026-09-30',
        time_of_day: '09:00:00',
        missed_rule: 'tolerant',
        grace_period_minutes: 60,
        organization_id: 'o1',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
        created_by: 'u1',
        task: { id: 'ap1', name: 'Standup mingguan', status: 'assigned' },
      },
    ]);
    await render(<SettingsRepeatRulesScreen />, { wrapper: wrapper() });
    const row = await screen.findByText('Standup mingguan');
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith('/task/ap1');
  });
});
