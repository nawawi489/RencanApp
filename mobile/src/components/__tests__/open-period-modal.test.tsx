// OpenPeriodModal (RED) — NG-2 follow-up jembatan finalisasi.
// Mengunci: validasi client (server tidak memvalidasi nama kosong), langkah konfirmasi
// wajib sebelum aksi ireversibel, dan pemetaan PG error → copy Indonesia.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseOpenPeriod = jest.fn();

jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useOpenPeriod: (...a: unknown[]) => mockUseOpenPeriod(...a),
}));

// eslint-disable-next-line import/first
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { OpenPeriodModal } from '../open-period-modal';

function makeOpenPeriod(overrides: Partial<{ openPeriod: jest.Mock; isPending: boolean }> = {}) {
  return {
    openPeriod: overrides.openPeriod ?? jest.fn().mockResolvedValue('p-new'),
    isPending: overrides.isPending ?? false,
  };
}

let openPeriodMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  openPeriodMock = jest.fn().mockResolvedValue('p-new');
  mockUseOpenPeriod.mockReturnValue(makeOpenPeriod({ openPeriod: openPeriodMock }));
});

async function renderModal(onClose = jest.fn()) {
  await render(<OpenPeriodModal visible onClose={onClose} />);
  return { onClose };
}

async function fillValidForm() {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Nama Periode'), 'Juli 2026');
    fireEvent.changeText(screen.getByLabelText('Tanggal Mulai'), '2026-07-01');
    fireEvent.changeText(screen.getByLabelText('Tanggal Selesai'), '2026-07-31');
  });
}

const NEXT = 'Lanjut ke konfirmasi buka periode';
const CONFIRM = 'Saya paham, buka periode ini';

describe('OpenPeriodModal — langkah 1 (formulir)', () => {
  it('[T-OP-M-1] render formulir: nama + rentang tanggal', async () => {
    await renderModal();
    expect(screen.getByLabelText('Nama Periode')).toBeTruthy();
    expect(screen.getByLabelText('Tanggal Mulai')).toBeTruthy();
    expect(screen.getByLabelText('Tanggal Selesai')).toBeTruthy();
  });

  it('[T-OP-M-2] nama kosong → Lanjut tidak memindahkan ke konfirmasi', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Tanggal Mulai'), '2026-07-01');
      fireEvent.changeText(screen.getByLabelText('Tanggal Selesai'), '2026-07-31');
    });
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    expect(screen.queryByLabelText(CONFIRM)).toBeNull();
  });

  it('[T-OP-M-3] nama hanya spasi → ditolak (server hanya cek NOT NULL)', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama Periode'), '   ');
      fireEvent.changeText(screen.getByLabelText('Tanggal Mulai'), '2026-07-01');
      fireEvent.changeText(screen.getByLabelText('Tanggal Selesai'), '2026-07-31');
    });
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    expect(screen.queryByLabelText(CONFIRM)).toBeNull();
  });

  it('[T-OP-M-4] tanggal belum lengkap → ditolak', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama Periode'), 'Juli 2026');
      fireEvent.changeText(screen.getByLabelText('Tanggal Mulai'), '2026-07-01');
    });
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    expect(screen.queryByLabelText(CONFIRM)).toBeNull();
  });

  it('[T-OP-M-5] selesai < mulai → ditolak + pesan rentang tampil', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama Periode'), 'Juli 2026');
      fireEvent.changeText(screen.getByLabelText('Tanggal Mulai'), '2026-07-31');
      fireEvent.changeText(screen.getByLabelText('Tanggal Selesai'), '2026-07-01');
    });
    expect(screen.getByText(/tidak boleh sebelum tanggal mulai/i)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    expect(screen.queryByLabelText(CONFIRM)).toBeNull();
  });

  it('[T-OP-M-6] periode 1 hari (mulai == selesai) DIIZINKAN — CHECK DB period_end >= period_start', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama Periode'), 'Hari Tunggal');
      fireEvent.changeText(screen.getByLabelText('Tanggal Mulai'), '2026-07-01');
      fireEvent.changeText(screen.getByLabelText('Tanggal Selesai'), '2026-07-01');
    });
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    expect(screen.getByLabelText(CONFIRM)).toBeTruthy();
  });

  it('[T-OP-M-7] Batal memanggil onClose tanpa memanggil RPC', async () => {
    const { onClose } = await renderModal();
    await act(async () => { fireEvent.press(screen.getByLabelText('Batal buka periode')); });
    expect(onClose).toHaveBeenCalled();
    expect(openPeriodMock).not.toHaveBeenCalled();
  });
});

describe('OpenPeriodModal — langkah 2 (konfirmasi ireversibel)', () => {
  it('[T-OP-M-8] konfirmasi mengulang nama + rentang dan menyatakan tak bisa dihapus', async () => {
    await renderModal();
    await fillValidForm();
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    expect(screen.getByText(/Juli 2026/)).toBeTruthy();
    expect(screen.getByText(/2026-07-01/)).toBeTruthy();
    expect(screen.getByText(/2026-07-31/)).toBeTruthy();
    expect(screen.getByText(/tidak dapat dihapus/i)).toBeTruthy();
  });

  it('[T-OP-M-9] Kembali → formulir dengan nilai terjaga', async () => {
    await renderModal();
    await fillValidForm();
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Kembali ke formulir periode'));
    });
    expect(screen.getByLabelText('Nama Periode').props.value).toBe('Juli 2026');
    expect(screen.getByLabelText('Tanggal Mulai').props.value).toBe('2026-07-01');
  });

  it('[T-OP-M-10] konfirmasi → openPeriod dipanggil dengan payload trimmed', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama Periode'), '  Juli 2026  ');
      fireEvent.changeText(screen.getByLabelText('Tanggal Mulai'), '2026-07-01');
      fireEvent.changeText(screen.getByLabelText('Tanggal Selesai'), '2026-07-31');
    });
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    await act(async () => { fireEvent.press(screen.getByLabelText(CONFIRM)); });
    expect(openPeriodMock).toHaveBeenCalledWith({
      periodName: 'Juli 2026',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
  });

  it('[T-OP-M-11] sukses → state selesai menyebut nama periode', async () => {
    await renderModal();
    await fillValidForm();
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    await act(async () => { fireEvent.press(screen.getByLabelText(CONFIRM)); });
    await waitFor(() => expect(screen.getByText(/Periode Juli 2026 dibuka/i)).toBeTruthy());
  });
});

describe('OpenPeriodModal — error mapping', () => {
  async function submitWithError(err: unknown) {
    openPeriodMock.mockRejectedValueOnce(err);
    await renderModal();
    await fillValidForm();
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    await act(async () => { fireEvent.press(screen.getByLabelText(CONFIRM)); });
  }

  it('[T-OP-M-12] PG 23505 (race lolos guard) → copy periode aktif, bukan pesan mentah', async () => {
    await submitWithError(
      Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
    );
    await waitFor(() => expect(screen.getByText(/sudah ada periode aktif/i)).toBeTruthy());
    expect(screen.queryByText(/duplicate key/i)).toBeNull();
  });

  it('[T-OP-M-13] PG 23514 (CHECK period_order) → copy rentang tanggal', async () => {
    await submitWithError(
      Object.assign(new Error('new row violates check constraint "period_snapshots_period_order"'), {
        code: '23514',
      }),
    );
    await waitFor(() => expect(screen.getByText(/tanggal selesai/i)).toBeTruthy());
    expect(screen.queryByText(/check constraint/i)).toBeNull();
  });

  it('[T-OP-M-14] error guard RPC (tanpa code) → pesan server ditampilkan apa adanya', async () => {
    await submitWithError(
      new Error('Sudah ada periode aktif untuk organisasi ini. Tutup dulu sebelum membuka yang baru.'),
    );
    await waitFor(() =>
      expect(screen.getByText(/Tutup dulu sebelum membuka yang baru/i)).toBeTruthy(),
    );
  });

  it('[T-OP-M-15] error → Coba lagi mengulang submit', async () => {
    await submitWithError(new Error('Gagal jaringan'));
    await waitFor(() => expect(screen.getByText(/Gagal jaringan/i)).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Coba lagi buka periode'));
    });
    await waitFor(() => expect(openPeriodMock).toHaveBeenCalledTimes(2));
  });
});

describe('OpenPeriodModal — guard saat in-flight', () => {
  it('[T-OP-M-16] isPending → Batal tidak menutup modal', async () => {
    mockUseOpenPeriod.mockReturnValue(
      makeOpenPeriod({ openPeriod: openPeriodMock, isPending: true }),
    );
    const { onClose } = await renderModal();
    await fillValidForm();
    await act(async () => { fireEvent.press(screen.getByLabelText(NEXT)); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Batal buka periode')); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
