// §19 Strategy Template CRUD — 4-state + CRUD operations.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListAllStrategyTemplates = jest.fn();
const mockListGoalTemplates = jest.fn();
const mockCreateStrategyTemplate = jest.fn();
const mockUpdateStrategyTemplate = jest.fn();
const mockDeleteStrategyTemplate = jest.fn();
jest.mock('@/lib/goals', () => ({
  __esModule: true,
  listAllStrategyTemplates: (...a: unknown[]) => mockListAllStrategyTemplates(...a),
  listGoalTemplates: (...a: unknown[]) => mockListGoalTemplates(...a),
  createStrategyTemplate: (...a: unknown[]) => mockCreateStrategyTemplate(...a),
  updateStrategyTemplate: (...a: unknown[]) => mockUpdateStrategyTemplate(...a),
  deleteStrategyTemplate: (...a: unknown[]) => mockDeleteStrategyTemplate(...a),
}));

jest.mock('@/lib/errors', () => ({
  __esModule: true,
  surfaceServerError: (_ctx: string, _e: unknown, fallback: string) => fallback,
}));

const mockUseProfile = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: (...a: unknown[]) => mockUseProfile(...a),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsScreen from '../settings-strategy-templates';

function mkWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  W.displayName = 'W';
  return W;
}

const GT_OMSET = { id: 'gt-1', key: 'omset', name: 'Omset', sort_order: 1 };
const TPL_SALES = {
  id: 'st-1',
  name: 'Sales Revenue',
  division: 'sales',
  division_label: 'Sales',
  goal_template_id: 'gt-1',
  goal_templates: { id: 'gt-1', name: 'Omset' },
  target_hint: 'Rp 500jt',
  expected_outcome_hint: null,
  sort_order: 1,
  is_active: true,
  created_at: '2026-01-01',
};

function setupAdmin() {
  mockUseProfile.mockReturnValue({
    profile: { id: 'me' },
    isLoading: false,
    can: (k: string) => k === 'manage_kpi_area_templates' || k === 'manage_goal_templates',
  });
  mockListGoalTemplates.mockResolvedValue([GT_OMSET]);
}

beforeEach(() => {
  mockListAllStrategyTemplates.mockReset();
  mockListGoalTemplates.mockReset();
  mockCreateStrategyTemplate.mockReset();
  mockUpdateStrategyTemplate.mockReset();
  mockDeleteStrategyTemplate.mockReset();
  mockUseProfile.mockReset();
});

describe('§19 — 4 state fondasi', () => {
  it('loading → skeleton', async () => {
    setupAdmin();
    mockListAllStrategyTemplates.mockReturnValue(new Promise(() => {}));
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('empty → EmptyState + CTA "Buat Strategy Template"', async () => {
    setupAdmin();
    mockListAllStrategyTemplates.mockResolvedValue([]);
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    expect(await screen.findByText('Belum ada Strategy Template')).toBeTruthy();
    expect(screen.getByText('Buat Strategy Template')).toBeTruthy();
  });

  it('data → template rows with division', async () => {
    setupAdmin();
    mockListAllStrategyTemplates.mockResolvedValue([TPL_SALES]);
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    expect(await screen.findByText('Sales Revenue')).toBeTruthy();
    expect(screen.getByText(/Divisi: Sales/)).toBeTruthy();
  });

  it('no permission → AccessDenied', async () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'me' }, isLoading: false, can: () => false,
    });
    mockListGoalTemplates.mockResolvedValue([]);
    mockListAllStrategyTemplates.mockResolvedValue([]);
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    expect(await screen.findByText(/memerlukan izin/)).toBeTruthy();
  });
});

describe('§19 — edit', () => {
  it('opens modal pre-filled and saves changes', async () => {
    setupAdmin();
    mockListAllStrategyTemplates.mockResolvedValue([TPL_SALES]);
    mockUpdateStrategyTemplate.mockResolvedValue({ ...TPL_SALES, name: 'Updated' });
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    expect(await screen.findByText('Sales Revenue')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Edit Sales Revenue'));
    await screen.findByText('Edit Strategy Template');

    const nameInput = screen.getByLabelText('Nama');
    expect(nameInput.props.value).toBe('Sales Revenue');

    fireEvent.changeText(nameInput, 'Edited Name');
    await waitFor(() => expect(screen.getByLabelText('Nama').props.value).toBe('Edited Name'));

    fireEvent.press(screen.getByText('Simpan'));
    await waitFor(() => {
      expect(mockUpdateStrategyTemplate).toHaveBeenCalledWith(
        'st-1',
        expect.objectContaining({ name: 'Edited Name' }),
      );
    });
  });
});

describe('§19 — toggle active', () => {
  it('toggle → calls updateStrategyTemplate with is_active: false', async () => {
    setupAdmin();
    mockListAllStrategyTemplates.mockResolvedValue([TPL_SALES]);
    mockUpdateStrategyTemplate.mockResolvedValue({ ...TPL_SALES, is_active: false });
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    expect(await screen.findByText('Sales Revenue')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Nonaktifkan Sales Revenue'));
    await waitFor(() => {
      expect(mockUpdateStrategyTemplate).toHaveBeenCalledWith('st-1', { is_active: false });
    });
  });

  it('inactive template shows "Nonaktif" badge', async () => {
    setupAdmin();
    mockListAllStrategyTemplates.mockResolvedValue([{ ...TPL_SALES, is_active: false }]);
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    expect(await screen.findByText('Sales Revenue')).toBeTruthy();
    expect(screen.getByText('Nonaktif')).toBeTruthy();
    expect(screen.getByLabelText('Aktifkan Sales Revenue')).toBeTruthy();
  });
});

// Create test runs last — its mutation + invalidation cycle generates async leaks
// that corrupt RNTL's screen singleton if subsequent tests try to render.
describe('§19 — create', () => {
  it('"+ Buat" opens modal and validates required fields', async () => {
    setupAdmin();
    mockListAllStrategyTemplates.mockResolvedValue([]);
    mockCreateStrategyTemplate.mockResolvedValue({ ...TPL_SALES, id: 'st-new' });
    await render(<SettingsScreen />, { wrapper: mkWrapper() });
    await screen.findByText('Belum ada Strategy Template');

    fireEvent.press(screen.getByText('+ Buat'));
    await screen.findByLabelText('Modal buat template');

    // Save without filling → validation error
    const saveButtons = screen.getAllByText('Buat');
    fireEvent.press(saveButtons[saveButtons.length - 1]);
    expect(await screen.findByText('Nama wajib diisi.')).toBeTruthy();

    // Fill required fields
    fireEvent.changeText(screen.getByLabelText('Nama'), 'New Template');
    fireEvent.changeText(screen.getByLabelText('Kode Divisi'), 'ops');
    fireEvent.changeText(screen.getByLabelText('Label Divisi'), 'Operations');

    // Flush React state so handleSave reads current form values
    await waitFor(() => {
      expect(screen.getByLabelText('Nama').props.value).toBe('New Template');
    });

    // Re-query the save button from the re-rendered tree and press
    const saveBtns = screen.getAllByText('Buat');
    fireEvent.press(saveBtns[saveBtns.length - 1]);

    await waitFor(() => {
      expect(mockCreateStrategyTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Template',
          division: 'ops',
          division_label: 'Operations',
          goal_template_id: 'gt-1',
        }),
      );
    });
  });
});
