import { alertFriendlyError, friendlyErrorMessage, reportError, surfaceServerError } from '../errors';
import { _resetForTest, addTransport, type LogTransport } from '../logger';

function pgError(code: string, message = 'technical detail'): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function mockTransport(): LogTransport & { write: jest.Mock } {
  return { name: 'mock', write: jest.fn() };
}

afterEach(() => _resetForTest());

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
    expect(alertSpy.mock.calls[0][1]).not.toContain('unique constraint');
  });

  it('mencatat error teknis ke log untuk developer', () => {
    const alertSpy = jest.fn();
    const logSpy = jest.fn();
    const err = new Error('SQLSTATE 42501');
    alertFriendlyError('Gagal', err, 'Terjadi kesalahan.', { alertImpl: alertSpy, logImpl: logSpy });
    expect(logSpy).toHaveBeenCalled();
    expect(logSpy.mock.calls[0]).toContain(err);
  });

  it('memakai pesan mapper untuk error dengan code dikenal (bukan fallback)', () => {
    const alertSpy = jest.fn();
    const logSpy = jest.fn();
    alertFriendlyError('Gagal', pgError('42501'), 'Fallback generik.', {
      alertImpl: alertSpy,
      logImpl: logSpy,
    });
    expect(alertSpy.mock.calls[0][1]).toMatch(/tidak (memiliki |punya )?izin/i);
    expect(alertSpy.mock.calls[0][1]).not.toBe('Fallback generik.');
    expect(alertSpy.mock.calls[0][1]).not.toContain('42501');
  });

  it('memakai fallback untuk error tanpa code yang dikenal', () => {
    const alertSpy = jest.fn();
    const logSpy = jest.fn();
    alertFriendlyError('Gagal', pgError('99999'), 'Fallback generik.', {
      alertImpl: alertSpy,
      logImpl: logSpy,
    });
    expect(alertSpy).toHaveBeenCalledWith('Gagal', 'Fallback generik.');
  });

  it('tetap meneruskan objek error ASLI ke log meski pesan dipetakan', () => {
    const alertSpy = jest.fn();
    const logSpy = jest.fn();
    const err = pgError('23505');
    alertFriendlyError('Gagal', err, 'Fallback.', { alertImpl: alertSpy, logImpl: logSpy });
    expect(logSpy.mock.calls[0]).toContain(err);
  });

  it('default logImpl meneruskan ke centralized transport', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const err = new Error('boom');
    alertFriendlyError('Gagal', err, 'Fallback.', { alertImpl: jest.fn() });
    expect(t.write).toHaveBeenCalled();
    const entry = t.write.mock.calls[0][0];
    expect(entry.level).toBe('error');
    expect(entry.namespace).toBe('Gagal');
    const rawArgs = t.write.mock.calls[0][1] as unknown[];
    expect(rawArgs).toContain(err);
    spy.mockRestore();
  });
});

describe('reportError (untuk inline error / setError)', () => {
  it('mencatat error teknis ke transport dan mengembalikan pesan ramah dari mapper', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const err = pgError('42501');
    const msg = reportError('Simpan', err, 'Gagal menyimpan.');
    expect(msg).toMatch(/tidak (memiliki |punya )?izin/i);
    expect(t.write).toHaveBeenCalled();
    expect(t.write.mock.calls[0][0].namespace).toBe('Simpan');
    spy.mockRestore();
  });

  it('mengembalikan fallback saat error tak dikenal (tanpa membocorkan teknis)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const err = new Error('column "x" does not exist');
    const msg = reportError('Simpan', err, 'Gagal menyimpan.');
    expect(msg).toBe('Gagal menyimpan.');
    expect(msg).not.toContain('column');
    spy.mockRestore();
  });
});

describe('surfaceServerError (flow RPC dengan pesan domain terkurasi)', () => {
  it('menampilkan pesan server terkurasi apa adanya & tetap mencatat ke transport', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const err = new Error('Hanya CEO yang dapat memberikan hak Kelola User.');
    const msg = surfaceServerError('Ubah hak akses', err, 'Gagal menyimpan.');
    expect(msg).toBe('Hanya CEO yang dapat memberikan hak Kelola User.');
    expect(t.write).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('MENYEMBUNYIKAN error dengan code teknis dikenal (mapper menang atas message mentah)', () => {
    const msg = surfaceServerError('Ubah hak akses', pgError('42501', 'permission denied for table x'), 'Fallback.');
    expect(msg).toMatch(/tidak (memiliki |punya )?izin/i);
    expect(msg).not.toContain('permission denied for table');
  });

  it('memakai fallback bila bukan Error / tanpa message', () => {
    expect(surfaceServerError('X', null, 'Terjadi kesalahan.')).toBe('Terjadi kesalahan.');
    expect(surfaceServerError('X', new Error(''), 'Terjadi kesalahan.')).toBe('Terjadi kesalahan.');
  });
});

describe('friendlyErrorMessage', () => {
  it.each([
    ['42501', /tidak (memiliki |punya )?izin/i],
    ['23505', /sudah ada/i],
    ['23502', /wajib|lengkap/i],
    ['23503', /terkait|digunakan/i],
    ['23514', /tidak valid/i],
    ['PGRST116', /tidak ditemukan/i],
    ['PGRST301', /sesi|masuk/i],
  ])('memetakan code %s ke pesan ramah', (code, pattern) => {
    const msg = friendlyErrorMessage(pgError(code));
    expect(msg).toBeDefined();
    expect(msg).toMatch(pattern);
  });

  it('memetakan penanda domain draft_already_exists dari message (RAISE EXCEPTION)', () => {
    const msg = friendlyErrorMessage(pgError('P0001', 'draft_already_exists: level A'));
    expect(msg).toMatch(/sudah ada draft/i);
  });

  it('mengembalikan undefined untuk code tak dikenal', () => {
    expect(friendlyErrorMessage(pgError('42P01'))).toBeUndefined();
  });

  it('mengembalikan undefined untuk error tanpa code & tanpa penanda domain', () => {
    expect(friendlyErrorMessage(new Error('boom'))).toBeUndefined();
  });

  it('memetakan TypeError jaringan (fetch putus) ke copy periksa koneksi', () => {
    const msg = friendlyErrorMessage(new TypeError('Network request failed'));
    expect(msg).toMatch(/koneksi|jaringan/i);
  });

  it('memetakan "Failed to fetch" (web) ke copy periksa koneksi', () => {
    const msg = friendlyErrorMessage(new Error('Failed to fetch'));
    expect(msg).toMatch(/koneksi|jaringan/i);
  });

  it('memetakan AbortError (timeout request) ke copy periksa koneksi', () => {
    const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    expect(friendlyErrorMessage(abort)).toMatch(/koneksi|jaringan/i);
  });

  it('code teknis dikenal tetap menang atas deteksi jaringan', () => {
    // TypeError yang kebetulan membawa code SQLSTATE dikenal → mapping code diutamakan.
    const msg = friendlyErrorMessage(Object.assign(new TypeError('x'), { code: '42501' }));
    expect(msg).toMatch(/tidak (memiliki |punya )?izin/i);
  });

  it('menerima code numerik (dinormalisasi ke string)', () => {
    const msg = friendlyErrorMessage(Object.assign(new Error('x'), { code: 42501 }));
    expect(msg).toMatch(/tidak (memiliki |punya )?izin/i);
  });

  it('toleran terhadap input non-error (null/undefined/string)', () => {
    expect(friendlyErrorMessage(null)).toBeUndefined();
    expect(friendlyErrorMessage(undefined)).toBeUndefined();
    expect(friendlyErrorMessage('just a string')).toBeUndefined();
  });
});
