// WSA-18 — sanitasi error mutation: user lihat copy ramah, detail teknis ke console (bukan Alert).
import { alertFriendlyError } from '../errors';

describe('alertFriendlyError', () => {
  it('menampilkan judul + pesan ramah (fallback), TANPA e.message mentah', () => {
    const alertSpy = jest.fn();
    const logSpy = jest.fn();
    alertFriendlyError(
      'Gagal menyimpan',
      new Error('duplicate key value violates unique constraint "pk_x"'),
      'Perubahan belum tersimpan. Coba lagi.',
      { alertImpl: alertSpy, logImpl: logSpy },
    );
    expect(alertSpy).toHaveBeenCalledWith('Gagal menyimpan', 'Perubahan belum tersimpan. Coba lagi.');
    // Pesan teknis tak boleh bocor ke Alert.
    expect(alertSpy.mock.calls[0][1]).not.toContain('unique constraint');
  });

  it('mencatat error teknis ke log untuk developer', () => {
    const alertSpy = jest.fn();
    const logSpy = jest.fn();
    const err = new Error('SQLSTATE 42501');
    alertFriendlyError('Gagal', err, 'Terjadi kesalahan.', { alertImpl: alertSpy, logImpl: logSpy });
    expect(logSpy).toHaveBeenCalled();
    // objek error asli diteruskan ke log (bukan hanya string).
    expect(logSpy.mock.calls[0]).toContain(err);
  });
});
