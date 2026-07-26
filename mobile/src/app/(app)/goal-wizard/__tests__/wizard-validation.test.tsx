// Goal Wizard (Fase 4) — test VALIDASI (blocking). Dipisah dari wizard.test.tsx karena RTL versi repo
// mendegradasi renderer setelah test multi-step berat (alur lengkap) bila berada di file yang sama
// dengan sibling lain di worker — terbukti: kedua test ini lulus selama tak didahului test berat.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/components/user-picker', () => ({ UserPicker: () => null }));

const mockTemplates = jest.fn();
const mockApplyTemplate = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoalTemplates: () => ({ templates: mockTemplates(), isLoading: false, isError: false }),
  useStrategyTemplates: () => ({ items: [], isLoading: false, isError: false }),
  useGoalActions: () => ({ applyTemplate: mockApplyTemplate, isPending: false }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
}));

const mockAlert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

// eslint-disable-next-line import/first
import GoalWizardScreen from '../../goal-wizard';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockTemplates.mockReset();
  mockApplyTemplate.mockReset();
  mockReplace.mockReset();
  mockAlert.mockClear();
  mockTemplates.mockReturnValue([{ id: 't1', name: 'Meningkatkan Omset Penjualan' }]);
  mockApplyTemplate.mockResolvedValue('g-new');
});

afterEach(() => {
  cleanup();
});

describe('GoalWizardScreen — validasi (blocking)', () => {
  it('[3] Generate diblok bila template belum dipilih (tak bisa lanjut dari step 1)', async () => {
    await render(<GoalWizardScreen />, { wrapper: wrapper() });
    await press(await screen.findByText('Lanjut'));
    expect(screen.getByText('Langkah 1 — Pilih Goal Template')).toBeTruthy();
    expect(mockApplyTemplate).not.toHaveBeenCalled();
  });

  it('[4] Generate diblok bila tanggal invalid', async () => {
    await render(<GoalWizardScreen />, { wrapper: wrapper() });

    await press(await screen.findByText('Meningkatkan Omset Penjualan'));
    await press(screen.getByText('Lanjut'));

    await screen.findByText('Langkah 2 — Periode, PIC & Target');
    const inputs = screen.getAllByPlaceholderText('Format: YYYY-MM-DD (mis. 2026-07-01)');
    fireEvent.changeText(inputs[0], '01-07-2026');
    fireEvent.changeText(inputs[1], 'bukan-tanggal');

    await press(screen.getByText('Lanjut'));
    await screen.findByText('Langkah 3 — Tinjau & Generate');
    await press(screen.getByText('Buat Goal'));

    expect(mockApplyTemplate).not.toHaveBeenCalled();
  });
});
