// Fase 3 TDD plan (specs/score-ranking-finalization-tdd-plan.md) — greenfield modal test.
// Menguji 9-state machine FinalizePeriodModal + kontrak copy §6.4 spec.
//
// Pola mock: jest.mock('@/lib/supabase') memblokir Supabase asli; jest.mock('@/hooks/use-people-score')
// mengganti 3 hook (useCalculatePeriodScores, useClosePeriod, usePreviewFinalization) dengan
// factory yang dapat dikontrol per-test.

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseCalc = jest.fn();
const mockUseClose = jest.fn();
const mockUsePreview = jest.fn();

jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useCalculatePeriodScores: (...a: unknown[]) => mockUseCalc(...a),
  useClosePeriod: (...a: unknown[]) => mockUseClose(...a),
  usePreviewFinalization: (...a: unknown[]) => mockUsePreview(...a),
}));

// eslint-disable-next-line import/first
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { FinalizePeriodModal } from '../finalize-period-modal';

const activePeriod = {
  id: 'p1',
  period_name: 'Juli 2026',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
};

// Copy terkunci spec §6.4. Pernyataan-paham kini di checkbox body (DESIGN §7 `AckCheckbox`),
// bukan di label tombol — tombol destruktif terkunci sampai checkbox dicentang.
const CONFIRM_LABEL = 'Finalisasi Periode';
const ACK_LABEL = 'Saya paham periode ini tidak dapat dibuka kembali.';

/**
 * Alur konfirmasi lengkap: centang pernyataan-paham, lalu tekan tombol destruktif.
 * Dua `act` TERPISAH — wajib: tombol baru lepas dari `disabled` setelah re-render
 * akibat centang. Digabung dalam satu act, press kedua mengenai tombol yang masih
 * terkunci dan diam-diam tidak melakukan apa-apa.
 */
async function konfirmasi() {
  await act(async () => {
    fireEvent.press(await screen.findByLabelText(ACK_LABEL));
  });
  await act(async () => {
    fireEvent.press(await screen.findByLabelText(CONFIRM_LABEL));
  });
}

type MutationOverrides = {
  calculatePeriod?: jest.Mock;
  closePeriod?: jest.Mock;
  isPending?: boolean;
};
type PreviewOverrides = {
  isLoading?: boolean;
  isError?: boolean;
  refetch?: jest.Mock;
};

function factoryCalc(overrides: MutationOverrides = {}) {
  return {
    calculatePeriod: overrides.calculatePeriod ?? jest.fn().mockResolvedValue(5),
    isPending: overrides.isPending ?? false,
  };
}
function factoryClose(overrides: MutationOverrides = {}) {
  return {
    closePeriod: overrides.closePeriod ?? jest.fn().mockResolvedValue(5),
    isPending: overrides.isPending ?? false,
  };
}
function factoryPreview(
  data: { eligibleUsers: number; activeOverrides: number } | undefined,
  overrides: PreviewOverrides = {},
) {
  return {
    preview: data,
    isLoading: overrides.isLoading ?? !data,
    isError: overrides.isError ?? false,
    refetch: overrides.refetch ?? jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePreview.mockReturnValue(factoryPreview({ eligibleUsers: 5, activeOverrides: 1 }));
  mockUseCalc.mockReturnValue(factoryCalc());
  mockUseClose.mockReturnValue(factoryClose());
});

describe('FinalizePeriodModal — Fase 3 TDD plan', () => {
  it('[T-M-1] preview loaded (N>0) → step1 dengan copy pratinjau + confirm button', async () => {
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/5 pengguna akan diperingkat/)).toBeTruthy(),
    );
    expect(screen.getByText(/1 Manual Override aktif akan efektif/)).toBeTruthy();
    expect(
      screen.getByLabelText(CONFIRM_LABEL),
    ).toBeTruthy();
  });

  it('[T-M-2] N=0 → warning kuning + tombol confirm tetap ada', async () => {
    mockUsePreview.mockReturnValue(factoryPreview({ eligibleUsers: 0, activeOverrides: 0 }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Belum ada pengguna dengan template role/)).toBeTruthy(),
    );
    expect(
      screen.getByLabelText(CONFIRM_LABEL),
    ).toBeTruthy();
  });

  it('[T-M-3] preview error → state error-preview + refetch dari factory', async () => {
    const refetch = jest.fn();
    mockUsePreview.mockReturnValue(
      factoryPreview(undefined, { isLoading: false, isError: true, refetch }),
    );
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Gagal memuat pratinjau/)).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText('Coba lagi memuat pratinjau'));
    expect(refetch).toHaveBeenCalled();
  });

  it('[T-M-4/5/6] konfirmasi → calculating → locking → done (N>0) memakai nama periode', async () => {
    const calcAsync = jest.fn().mockResolvedValue(5);
    const closeAsync = jest.fn().mockResolvedValue(5);
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: calcAsync }));
    mockUseClose.mockReturnValue(factoryClose({ closePeriod: closeAsync }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByLabelText(CONFIRM_LABEL),
      ).toBeTruthy(),
    );
    await konfirmasi();
    expect(calcAsync).toHaveBeenCalledWith('p1');
    expect(closeAsync).toHaveBeenCalledWith('p1');
    await waitFor(() =>
      expect(screen.getByText(/Periode Juli 2026 difinalisasi\./)).toBeTruthy(),
    );
    expect(screen.getByText(/5 pengguna masuk peringkat\./)).toBeTruthy();
  });

  it('[T-M-7] N=0 done copy menyebut kemungkinan template role', async () => {
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: jest.fn().mockResolvedValue(0) }));
    mockUseClose.mockReturnValue(factoryClose({ closePeriod: jest.fn().mockResolvedValue(0) }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await konfirmasi();
    await waitFor(() =>
      expect(
        screen.getByText(/0 pengguna diperingkat.*template role belum dipetakan/i),
      ).toBeTruthy(),
    );
  });

  it('[T-M-8a] calc E1 → error-calc + copy Indonesia + retry HANYA calc (close belum dipanggil)', async () => {
    const calcAsync = jest.fn().mockRejectedValueOnce(
      new Error('Periode ini sudah ditutup dan tidak bisa diubah.'),
    );
    const closeAsync = jest.fn();
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: calcAsync }));
    mockUseClose.mockReturnValue(factoryClose({ closePeriod: closeAsync }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await konfirmasi();
    await waitFor(() =>
      expect(screen.getByText('Periode ini sudah ditutup dan tidak bisa diubah.')).toBeTruthy(),
    );
    expect(closeAsync).not.toHaveBeenCalled();

    // Retry: mock calc sukses + close sukses; tombol "Coba lagi" memicu calc + close.
    calcAsync.mockResolvedValueOnce(5);
    closeAsync.mockResolvedValueOnce(5);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Coba lagi menghitung skor'));
    });
    expect(calcAsync).toHaveBeenCalledTimes(2);
    expect(closeAsync).toHaveBeenCalledTimes(1);
  });

  it('[T-M-9a] close E1 setelah calc sukses → error-lock + retry mengulang calc + close', async () => {
    const calcAsync = jest.fn().mockResolvedValue(5);
    const closeAsync = jest
      .fn()
      .mockRejectedValueOnce(new Error('Periode ini sudah ditutup dan tidak bisa diubah.'))
      .mockResolvedValueOnce(5);
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: calcAsync }));
    mockUseClose.mockReturnValue(factoryClose({ closePeriod: closeAsync }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await konfirmasi();
    await waitFor(() =>
      expect(screen.getByText('Periode ini sudah ditutup dan tidak bisa diubah.')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Coba lagi finalisasi peringkat'));
    });
    expect(calcAsync).toHaveBeenCalledTimes(2);
    expect(closeAsync).toHaveBeenCalledTimes(2);
  });

  it('[T-M-9b] close 23505 → copy Indonesia bukan raw PG duplicate key', async () => {
    const pgErr = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "ranking_snapshots_period_snapshot_id_user_id_key"',
      ),
      { code: '23505' },
    );
    mockUseClose.mockReturnValue(
      factoryClose({ closePeriod: jest.fn().mockRejectedValueOnce(pgErr) }),
    );
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await konfirmasi();
    await waitFor(() =>
      expect(
        screen.getByText(/Perhitungan sedang berjalan di sesi lain/),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/duplicate key value/)).toBeNull();
  });

  it('[T-M-11] confirm button disabled saat calc.isPending=true (meski sudah dicentang)', async () => {
    mockUseCalc.mockReturnValue(factoryCalc({ isPending: true }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText(ACK_LABEL));
    const btn = await screen.findByLabelText(CONFIRM_LABEL);
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  // AckCheckbox (DESIGN §7) — pernyataan-paham wajib sebelum aksi ireversibel.
  it('[T-M-17] tombol destruktif TERKUNCI sebelum checkbox dicentang; RPC tidak dipanggil', async () => {
    const calcAsync = jest.fn();
    const closeAsync = jest.fn();
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: calcAsync }));
    mockUseClose.mockReturnValue(factoryClose({ closePeriod: closeAsync }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    const btn = await screen.findByLabelText(CONFIRM_LABEL);
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    // Menekan tombol terkunci tidak boleh memicu apa pun.
    await act(async () => {
      fireEvent.press(btn);
    });
    expect(calcAsync).not.toHaveBeenCalled();
    expect(closeAsync).not.toHaveBeenCalled();
  });

  it('[T-M-18] centang checkbox membuka kunci tombol + accessibilityState.checked ikut berubah', async () => {
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    const ack = await screen.findByLabelText(ACK_LABEL);
    expect(ack.props.accessibilityState?.checked).toBe(false);
    expect((await screen.findByLabelText(CONFIRM_LABEL)).props.accessibilityState?.disabled).toBe(
      true,
    );
    await act(async () => {
      fireEvent.press(ack);
    });
    expect((await screen.findByLabelText(ACK_LABEL)).props.accessibilityState?.checked).toBe(true);
    expect((await screen.findByLabelText(CONFIRM_LABEL)).props.accessibilityState?.disabled).toBe(
      false,
    );
  });

  it('[T-M-19] checkbox bisa di-uncheck lagi → tombol terkunci kembali', async () => {
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    const ack = await screen.findByLabelText(ACK_LABEL);
    await act(async () => {
      fireEvent.press(ack);
    });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText(ACK_LABEL));
    });
    expect((await screen.findByLabelText(ACK_LABEL)).props.accessibilityState?.checked).toBe(false);
    expect((await screen.findByLabelText(CONFIRM_LABEL)).props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it('[T-M-20] checkbox = sinyal non-warna (DESIGN §4/§10): accessibilityState.checked flip unchecked→checked (ikon ellipse-outline→checkmark-circle)', async () => {
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    const box = await screen.findByLabelText(ACK_LABEL);
    // Non-warna: state a11y (dibaca screen reader) + bentuk ikon Ionicons berbeda per state.
    expect(box.props.accessibilityState?.checked).toBe(false);
    await act(async () => {
      fireEvent.press(box);
    });
    expect((await screen.findByLabelText(ACK_LABEL)).props.accessibilityState?.checked).toBe(true);
  });

  it('[T-M-12] label calculating pakai accessibilityLiveRegion="polite"', async () => {
    let releaseCalc: (v: number) => void = () => {};
    const calcAsync = jest.fn(
      () => new Promise<number>((res) => { releaseCalc = res; }),
    );
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: calcAsync }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await konfirmasi();
    const progressLabel = await screen.findByText(
      /Langkah 1 dari 2 · Menghitung skor pengguna/,
    );
    expect(progressLabel.props.accessibilityLiveRegion).toBe('polite');
    // Release supaya effect cleanup tidak mengeluh async pending.
    await act(async () => {
      releaseCalc(5);
    });
  });

  it('[T-M-13] setelah done, tap Tutup memanggil onClose', async () => {
    const onClose = jest.fn();
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={onClose} />);
    await konfirmasi();
    await waitFor(() =>
      expect(screen.getByText(/Periode Juli 2026 difinalisasi\./)).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText('Tutup dialog finalisasi'));
    expect(onClose).toHaveBeenCalled();
  });

  it('[T-M-14] canary AC-FIN-8b — calc>0 & close=0 → state error-mismatch', async () => {
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: jest.fn().mockResolvedValue(5) }));
    mockUseClose.mockReturnValue(factoryClose({ closePeriod: jest.fn().mockResolvedValue(0) }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await konfirmasi();
    await waitFor(() =>
      expect(
        screen.getByText(/Perhitungan selesai tapi peringkat tidak tersimpan/),
      ).toBeTruthy(),
    );
  });

  it('[T-M-15] preview isLoading → state loading-preview visible; confirm belum ada', async () => {
    mockUsePreview.mockReturnValue(factoryPreview(undefined, { isLoading: true }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Memuat pratinjau/)).toBeTruthy(),
    );
    expect(
      screen.queryByLabelText(CONFIRM_LABEL),
    ).toBeNull();
  });

  // Copy diperbarui saat NG-2 ditutup: footer lama berbunyi "…setelah UI buka-periode
  // tersedia", janji bersyarat yang kini menyesatkan karena tombolnya sudah ada di layar
  // yang sama. Escape hatch berubah dari rencana menjadi instruksi konkret.
  it('[T-M-16] done state menampilkan footer escape hatch yang menunjuk tombol Buka Periode', async () => {
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await konfirmasi();
    await waitFor(() =>
      expect(
        screen.getByText(/Butuh mengoreksi\?.*Buka periode berikutnya.*Buka Periode/i),
      ).toBeTruthy(),
    );
    // Janji bersyarat lama tidak boleh tersisa.
    expect(screen.queryByText(/setelah UI buka-periode tersedia/i)).toBeNull();
  });
});
