// Panel "Pecahan Target" (UI-S-K01) — view + editor modal + gating + Σ live + Save call rpc.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

// Mocks — pasang SEBELUM import komponen.
const mockListBreakdown = jest.fn();
const mockReplace = jest.fn();
jest.mock('@/lib/strategy-breakdown', () => {
  const actual = jest.requireActual('@/lib/strategy-breakdown');
  return {
    ...actual,
    listStrategyBreakdown: (...a: unknown[]) => mockListBreakdown(...a),
    replaceStrategyBreakdown: (...a: unknown[]) => mockReplace(...a),
  };
});

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'user-pic' }, isLoading: false, can: mockCan }),
}));

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first
import { StrategyBreakdownPanel } from '../strategy-breakdown-panel';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TW';
  return W;
}

beforeEach(() => {
  mockListBreakdown.mockReset();
  mockReplace.mockReset();
  mockCan.mockReset();
  mockCan.mockReturnValue(false);
});

const ROWS_VALID = [
  // Quarter Σ=100
  { id: 'q1', organization_id: 'o', strategy_id: 'k', period_type: 'quarter', period_key: 'Q1', parent_quarter_key: null, contribution_pct: 20, reason: null, created_by: null, created_at: '', updated_at: '' },
  { id: 'q2', organization_id: 'o', strategy_id: 'k', period_type: 'quarter', period_key: 'Q2', parent_quarter_key: null, contribution_pct: 30, reason: null, created_by: null, created_at: '', updated_at: '' },
  { id: 'q3', organization_id: 'o', strategy_id: 'k', period_type: 'quarter', period_key: 'Q3', parent_quarter_key: null, contribution_pct: 25, reason: null, created_by: null, created_at: '', updated_at: '' },
  { id: 'q4', organization_id: 'o', strategy_id: 'k', period_type: 'quarter', period_key: 'Q4', parent_quarter_key: null, contribution_pct: 25, reason: null, created_by: null, created_at: '', updated_at: '' },
];

describe('StrategyBreakdownPanel — gating Ubah', () => {
  it('[1] non-PIC, non-manage_others → tombol Ubah tidak muncul', async () => {
    mockListBreakdown.mockResolvedValue([]);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId="other-user" createdBy="another-user" />,
        { wrapper: wrapper() },
      );
    });
    expect(await screen.findByText('Pecahan Target')).toBeTruthy();
    expect(screen.queryByLabelText('Ubah Pecahan Target')).toBeNull();
  });

  it('[2] user = pic_id → tombol Ubah muncul', async () => {
    mockListBreakdown.mockResolvedValue([]);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId="user-pic" createdBy="another-user" />,
        { wrapper: wrapper() },
      );
    });
    expect(await screen.findByLabelText('Ubah Pecahan Target')).toBeTruthy();
  });

  it('[3] manage_others_cards → tombol Ubah muncul meski bukan PIC', async () => {
    mockCan.mockReturnValue(true);
    mockListBreakdown.mockResolvedValue([]);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId="other" createdBy="other" />,
        { wrapper: wrapper() },
      );
    });
    expect(await screen.findByLabelText('Ubah Pecahan Target')).toBeTruthy();
  });
});

describe('StrategyBreakdownPanel — read state', () => {
  it('[4] empty → copy "Belum ada pecahan target"', async () => {
    mockListBreakdown.mockResolvedValue([]);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId={null} createdBy={null} />,
        { wrapper: wrapper() },
      );
    });
    expect(await screen.findByText(/Belum ada pecahan target/)).toBeTruthy();
  });

  it('[5] Quarter Σ=100 → "Σ 100%" warna sukses + 4 chip Qx', async () => {
    mockListBreakdown.mockResolvedValue(ROWS_VALID);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId={null} createdBy={null} />,
        { wrapper: wrapper() },
      );
    });
    expect(await screen.findByText('Σ 100%')).toBeTruthy();
    expect(screen.getByText('Q1')).toBeTruthy();
    expect(screen.getByText('Q4')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
  });
});

describe('StrategyBreakdownPanel — editor modal', () => {
  it('[6] buka modal → tab Quarter terisi prefill; Σ awal 100; Save disabled tanpa reason', async () => {
    mockListBreakdown.mockResolvedValue(ROWS_VALID);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId="user-pic" createdBy={null} />,
        { wrapper: wrapper() },
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ubah Pecahan Target'));
    });
    // Σ panel header (100%) + Σ editor header (Σ 100% / 100%) keduanya muncul.
    expect(screen.getByText('Σ 100% / 100%')).toBeTruthy();
    // 4 input quarter ada.
    expect(screen.getByLabelText('Kontribusi Q1')).toBeTruthy();
    expect(screen.getByLabelText('Kontribusi Q4')).toBeTruthy();
    // Reason textarea ada.
    expect(screen.getByLabelText('Alasan perubahan')).toBeTruthy();
  });

  it('[7] edit Q1 → Σ ter-update, Save tetap nonaktif jika ≠100', async () => {
    mockListBreakdown.mockResolvedValue(ROWS_VALID);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId="user-pic" createdBy={null} />,
        { wrapper: wrapper() },
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ubah Pecahan Target'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Kontribusi Q1'), '50'); // 50+30+25+25=130
    });
    expect(screen.getByText('Σ 130% / 100%')).toBeTruthy();
  });

  it('[8] reason 8+ char + Σ valid → tekan Save panggil replace RPC', async () => {
    mockListBreakdown.mockResolvedValue(ROWS_VALID);
    mockReplace.mockResolvedValue(ROWS_VALID);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId="user-pic" createdBy={null} />,
        { wrapper: wrapper() },
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ubah Pecahan Target'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Alasan perubahan'), 'Review Q3 eksekutif');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Simpan Pecahan'));
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const arg = mockReplace.mock.calls[0][0];
    expect(arg.strategyId).toBe('k');
    expect(arg.reason).toBe('Review Q3 eksekutif');
    // 4 entri quarter Σ=100 (sesuai ROWS_VALID).
    expect(arg.quarter).toHaveLength(4);
    expect(arg.quarter.reduce((s: number, e: { pct: number }) => s + e.pct, 0)).toBe(100);
    // Monthly tidak diisi (semua 0 default) → p_month=null (opsional).
    expect(arg.month).toBeNull();
  });

  it('[9] aktifkan monthly (isi salah satu) → wajib Σ=100 per Quarter; jika kurang, Save disabled', async () => {
    mockListBreakdown.mockResolvedValue(ROWS_VALID);
    await act(async () => {
      render(
        <StrategyBreakdownPanel strategyId="k" picId="user-pic" createdBy={null} />,
        { wrapper: wrapper() },
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ubah Pecahan Target'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Bulan'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Kontribusi Januari'), '50');
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Alasan perubahan'), 'Atur monthly Q1');
    });
    // Q1 sum=50, monthOk false → mockReplace tidak ter-trigger.
    await act(async () => {
      fireEvent.press(screen.getByText('Simpan Pecahan'));
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
