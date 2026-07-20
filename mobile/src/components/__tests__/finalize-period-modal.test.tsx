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
      screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
    ).toBeTruthy();
  });

  it('[T-M-2] N=0 → warning kuning + tombol confirm tetap ada', async () => {
    mockUsePreview.mockReturnValue(factoryPreview({ eligibleUsers: 0, activeOverrides: 0 }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Belum ada pengguna dengan template role/)).toBeTruthy(),
    );
    expect(
      screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
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
        screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      ).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
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
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
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
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
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
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
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
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Perhitungan sedang berjalan di sesi lain/),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/duplicate key value/)).toBeNull();
  });

  it('[T-M-11] confirm button disabled saat calc.isPending=true', async () => {
    mockUseCalc.mockReturnValue(factoryCalc({ isPending: true }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    const btn = await screen.findByLabelText(
      'Saya paham, finalisasi periode & kunci peringkat',
    );
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('[T-M-12] label calculating pakai accessibilityLiveRegion="polite"', async () => {
    let releaseCalc: (v: number) => void = () => {};
    const calcAsync = jest.fn(
      () => new Promise<number>((res) => { releaseCalc = res; }),
    );
    mockUseCalc.mockReturnValue(factoryCalc({ calculatePeriod: calcAsync }));
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
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
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
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
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
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
      screen.queryByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
    ).toBeNull();
  });

  // Copy diperbarui saat NG-2 ditutup: footer lama berbunyi "…setelah UI buka-periode
  // tersedia", janji bersyarat yang kini menyesatkan karena tombolnya sudah ada di layar
  // yang sama. Escape hatch berubah dari rencana menjadi instruksi konkret.
  it('[T-M-16] done state menampilkan footer escape hatch yang menunjuk tombol Buka Periode', async () => {
    await render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'),
      );
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Butuh mengoreksi\?.*Buka periode berikutnya.*Buka Periode/i),
      ).toBeTruthy(),
    );
    // Janji bersyarat lama tidak boleh tersisa.
    expect(screen.queryByText(/setelah UI buka-periode tersedia/i)).toBeNull();
  });
});
