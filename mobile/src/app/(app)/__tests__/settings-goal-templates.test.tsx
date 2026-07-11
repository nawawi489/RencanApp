// UI — Goal Template Library. Browse template + nested Strategi (lazy expand) + CTA gated create_goal.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseGoalTemplates = jest.fn();
const mockUseStrategyTemplates = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoalTemplates: (...a: unknown[]) => mockUseGoalTemplates(...a),
  useStrategyTemplates: (...a: unknown[]) => mockUseStrategyTemplates(...a),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'me' }, isLoading: false, can: mockCan }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));

// eslint-disable-next-line import/first
import SettingsGoalTemplatesScreen from '../settings-goal-templates';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockUseGoalTemplates.mockReset();
  mockUseStrategyTemplates.mockReset();
  mockCan.mockReset();
  mockPush.mockReset();
  mockUseStrategyTemplates.mockReturnValue({ items: [], isLoading: false, isError: false });
  mockCan.mockReturnValue(true);
});

describe('SettingsGoalTemplatesScreen', () => {
  it('[1] loading → skeleton "Memuat…"', async () => {
    mockUseGoalTemplates.mockReturnValue({ templates: [], isLoading: true, isError: false });
    await render(<SettingsGoalTemplatesScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('[2] data + create_goal → nama template + CTA', async () => {
    mockUseGoalTemplates.mockReturnValue({
      templates: [{ id: 't1', name: 'Pertumbuhan Omset', description: 'Blueprint sales', sort_order: 1 }],
      isLoading: false,
      isError: false,
    });
    await render(<SettingsGoalTemplatesScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Pertumbuhan Omset')).toBeTruthy();
    expect(screen.getByLabelText('Buat Goal dari Template')).toBeTruthy();
  });

  it('[3] tanpa create_goal → CTA tidak muncul', async () => {
    mockCan.mockReturnValue(false);
    mockUseGoalTemplates.mockReturnValue({
      templates: [{ id: 't1', name: 'Pertumbuhan Omset', description: null, sort_order: 1 }],
      isLoading: false,
      isError: false,
    });
    await render(<SettingsGoalTemplatesScreen />, { wrapper: wrapper() });
    await screen.findByText('Pertumbuhan Omset');
    expect(screen.queryByLabelText('Buat Goal dari Template')).toBeNull();
  });

  it('[4] expand → Strategi template muncul (lazy)', async () => {
    mockUseGoalTemplates.mockReturnValue({
      templates: [{ id: 't1', name: 'Pertumbuhan Omset', description: null, sort_order: 1 }],
      isLoading: false,
      isError: false,
    });
    mockUseStrategyTemplates.mockReturnValue({
      items: [{ id: 'k1', name: 'Revenue', division_label: 'Sales', goal_template_id: 't1' }],
      isLoading: false,
      isError: false,
    });
    await render(<SettingsGoalTemplatesScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Lihat Strategi template'));
    });
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('Sales')).toBeTruthy();
  });

  it('[5] kosong → EmptyState', async () => {
    mockUseGoalTemplates.mockReturnValue({ templates: [], isLoading: false, isError: false });
    await render(<SettingsGoalTemplatesScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Belum ada template')).toBeTruthy();
  });
});
