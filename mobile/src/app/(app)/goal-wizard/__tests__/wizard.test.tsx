// Goal Wizard (Fase 4) — test alur langkah berurutan: pilih template → periode → Generate.
// Memock data layer (use-workspace) & expo-router; TIDAK menyentuh supabase asli.
// CATATAN: render & renderHook di RTL versi repo ini WAJIB di-await. Selain itu, re-render
// setelah fireEvent.press perlu di-flush (act/await query) sebelum press berikutnya.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// UserPicker (Layer-3, react-query) di luar cakupan wizard & timer query-nya bocor antar test →
// mock jadi tombol dummy yang men-set PIC. PIC kini WAJIB di wizard, jadi alur lengkap memilihnya.
jest.mock('@/components/user-picker', () => ({
  UserPicker: ({ onChange }: { onChange: (p: unknown) => void }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return React.createElement(
      Pressable,
      { onPress: () => onChange({ id: 'pic1', full_name: 'PIC Dummy', email: null }) },
      React.createElement(Text, null, 'Pilih PIC Dummy'),
    );
  },
}));

const mockTemplates = jest.fn();
const mockApplyTemplate = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoalTemplates: () => ({ templates: mockTemplates(), isLoading: false, isError: false }),
  useKpiAreaTemplates: () => ({ items: [], isLoading: false, isError: false }),
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

let activeClient: QueryClient | null = null;
function wrapper() {
  activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: activeClient! }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

/** Tekan elemen lalu flush re-render + microtask async (cegah act tertinggal bocor ke test berikut). */
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

// Unmount + flush async tiap test sebelum berikutnya — cegah act tertinggal merusak render
// test selanjutnya saat suite penuh (terbukti: lulus terisolasi, gagal bila ada async test sebelumnya).
afterEach(async () => {
  cleanup();
  activeClient?.clear();
  await act(async () => {
    await Promise.resolve();
  });
});

describe('GoalWizardScreen', () => {
  it('smoke: render step awal dengan judul wizard + minimal satu template', async () => {
    await render(<GoalWizardScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Langkah 1 — Pilih Goal Template')).toBeTruthy();
    expect(screen.getByText('Meningkatkan Omset Penjualan')).toBeTruthy();
  });

  it('alur lengkap: pilih template → periode valid → Generate → applyTemplate + router.replace', async () => {
    await render(<GoalWizardScreen />, { wrapper: wrapper() });

    await press(await screen.findByText('Meningkatkan Omset Penjualan')); // pilih template
    await press(screen.getByText('Lanjut')); // → step periode

    await screen.findByText('Langkah 2 — Periode, PIC & Target');
    const inputs = screen.getAllByPlaceholderText('Format: YYYY-MM-DD (mis. 2026-07-01)');
    fireEvent.changeText(inputs[0], '2026-07-01');
    fireEvent.changeText(inputs[1], '2026-12-31');
    await press(screen.getByText('Pilih PIC Dummy')); // PIC wajib

    await press(screen.getByText('Lanjut')); // → step generate
    await screen.findByText('Langkah 3 — Tinjau & Generate');
    await press(screen.getByText('Generate Goal'));

    expect(mockApplyTemplate).toHaveBeenCalledTimes(1);
    expect(mockApplyTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        goalTemplateId: 't1',
        picId: 'pic1',
        periodStart: '2026-07-01',
        periodEnd: '2026-12-31',
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/goal/g-new');
  });
});
// Test validasi (blocking) ada di wizard-validation.test.tsx — dipisah agar tak didahului
// test multi-step berat yang mendegradasi renderer RTL versi repo ini.
