// BL-08 / PRD §24.3 — panel review harus menyurfacekan KETIGA aksi: Setujui, Minta Revisi,
// Catatan. "Catatan" NON-TERMINAL: mengirim umpan balik ke Diskusi Rencana Aksi tanpa
// memanggil onDecide, sehingga status submission tidak berubah.
// Render RN pertama (cold transform react-native-css) bisa lambat → longgarkan timeout.
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ReviewSubmissionPanel } from '../review-submission-panel';

jest.setTimeout(30000);

async function setup(overrides?: { onNote?: (body: string) => Promise<unknown> }) {
  const onDecide = jest.fn();
  const onNote = overrides?.onNote ?? jest.fn(() => Promise.resolve('msg-1'));
  const utils = await render(
    <ReviewSubmissionPanel onDecide={onDecide} isPending={false} onNote={onNote} isNotePending={false} />,
  );
  return { onDecide, onNote, ...utils };
}

describe('ReviewSubmissionPanel — 3 aksi PRD §24.3', () => {
  it('[UI-1] menampilkan ketiga aksi pada state awal', async () => {
    await setup();
    expect(screen.getByText('Setujui (Selesai)')).toBeTruthy();
    expect(screen.getByText('Tolak (Minta Revisi)')).toBeTruthy();
    expect(screen.getByText('Catatan')).toBeTruthy();
  });

  it('[UI-2] Catatan membuka form dan menyembunyikan aksi terminal', async () => {
    const user = userEvent.setup();
    await setup();
    await user.press(screen.getByText('Catatan'));

    expect(screen.getByPlaceholderText('Catatan untuk PIC (tidak mengubah status)')).toBeTruthy();
    expect(screen.getByText('Kirim Catatan')).toBeTruthy();
    // Aksi terminal tidak boleh bisa ditekan tak sengaja saat menulis catatan.
    expect(screen.queryByText('Setujui (Selesai)')).toBeNull();
    expect(screen.queryByText('Tolak (Minta Revisi)')).toBeNull();
  });

  it('[UI-3] NON-TERMINAL: kirim catatan memanggil onNote, TIDAK memanggil onDecide', async () => {
    const user = userEvent.setup();
    const { onDecide, onNote } = await setup();

    await user.press(screen.getByText('Catatan'));
    await user.type(screen.getByPlaceholderText('Catatan untuk PIC (tidak mengubah status)'), 'Bukti kurang jelas.');
    await user.press(screen.getByText('Kirim Catatan'));

    await waitFor(() => expect(onNote).toHaveBeenCalledWith('Bukti kurang jelas.'));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('[UI-4] kirim berhasil → form ditutup, kembali ke ketiga aksi', async () => {
    const user = userEvent.setup();
    await setup();

    await user.press(screen.getByText('Catatan'));
    await user.type(screen.getByPlaceholderText('Catatan untuk PIC (tidak mengubah status)'), 'oke');
    await user.press(screen.getByText('Kirim Catatan'));

    await waitFor(() => expect(screen.getByText('Setujui (Selesai)')).toBeTruthy());
    expect(screen.queryByText('Kirim Catatan')).toBeNull();
  });

  it('[UI-5] kirim GAGAL → form tetap terbuka dengan teks utuh (tidak hilang)', async () => {
    const user = userEvent.setup();
    const onNote = jest.fn(() => Promise.reject(new Error('jaringan')));
    await setup({ onNote });

    await user.press(screen.getByText('Catatan'));
    const input = screen.getByPlaceholderText('Catatan untuk PIC (tidak mengubah status)');
    await user.type(input, 'catatan panjang');
    await user.press(screen.getByText('Kirim Catatan'));

    await waitFor(() => expect(onNote).toHaveBeenCalled());
    expect(screen.getByText('Kirim Catatan')).toBeTruthy();
    expect(input.props.value).toBe('catatan panjang');
  });

  it('[UI-6] catatan kosong → Alert, tanpa memanggil onNote', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    const { onNote } = await setup();

    await user.press(screen.getByText('Catatan'));
    await user.press(screen.getByText('Kirim Catatan'));

    expect(alertSpy).toHaveBeenCalledWith('Catatan kosong', 'Tulis catatan terlebih dahulu.');
    expect(onNote).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('[UI-7] Batal menutup form tanpa mengirim', async () => {
    const user = userEvent.setup();
    const { onNote, onDecide } = await setup();

    await user.press(screen.getByText('Catatan'));
    await user.press(screen.getByText('Batal'));

    expect(screen.getByText('Setujui (Selesai)')).toBeTruthy();
    expect(onNote).not.toHaveBeenCalled();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('[UI-8] regresi: aksi terminal lama tetap berfungsi', async () => {
    const user = userEvent.setup();
    const { onDecide } = await setup();

    await user.press(screen.getByText('Setujui (Selesai)'));
    expect(onDecide).toHaveBeenCalledWith({ decision: 'approve', reason: null });

    await user.press(screen.getByText('Tolak (Minta Revisi)'));
    await user.type(screen.getByPlaceholderText('Alasan penolakan (wajib)'), 'kurang bukti');
    await user.press(screen.getByText('Kirim Penolakan'));
    expect(onDecide).toHaveBeenCalledWith({ decision: 'reject', reason: 'kurang bukti' });
  });
});
