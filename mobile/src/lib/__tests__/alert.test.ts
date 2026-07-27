// S3-1 — Alert seam behavior across platforms.
//
// react-native-web membuat `Alert.alert` no-op. Tes ini memverifikasi:
//   - Native → pass-through ke Alert.alert (via jest.mock).
//   - Web tanpa tombol → emit banner (subscriber terpanggil).
//   - Web dengan konfirmasi → window.confirm dipanggil; callback tombol yang
//     tepat (confirm / cancel) dijalankan sesuai pilihan user.

// Partial mock react-native: hanya expose Alert + Platform. `requireActual` +
// spread gagal karena RN index.js menyentuh TurboModule saat tes.
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'web' as 'web' | 'ios' | 'android' },
}));

import { Alert, Platform } from 'react-native';

import { _setConfirmImplForTest, showAlert, subscribeBanner } from '../alert';

const alertMock = Alert.alert as jest.Mock;

function setPlatform(os: 'ios' | 'android' | 'web') {
  (Platform as { OS: string }).OS = os;
}

afterEach(() => {
  alertMock.mockClear();
  _setConfirmImplForTest(null);
});

describe('showAlert — native', () => {
  beforeEach(() => setPlatform('ios'));

  it('pass-through ke Alert.alert tanpa tombol', () => {
    showAlert('Gagal', 'Coba lagi.');
    expect(alertMock).toHaveBeenCalledWith('Gagal', 'Coba lagi.', undefined);
  });

  it('pass-through ke Alert.alert dengan tombol konfirmasi', () => {
    const onOk = jest.fn();
    const onCancel = jest.fn();
    showAlert('Arsipkan?', 'Yakin?', [
      { text: 'Batal', style: 'cancel', onPress: onCancel },
      { text: 'Arsipkan', style: 'destructive', onPress: onOk },
    ]);
    expect(alertMock).toHaveBeenCalledTimes(1);
    const [t, m, buttons] = alertMock.mock.calls[0];
    expect(t).toBe('Arsipkan?');
    expect(m).toBe('Yakin?');
    expect(buttons).toHaveLength(2);
    expect(buttons[1].text).toBe('Arsipkan');
  });
});

describe('showAlert — web info (banner)', () => {
  beforeEach(() => setPlatform('web'));

  it('tanpa tombol → emit banner, TIDAK memanggil Alert.alert', () => {
    const listener = jest.fn();
    const unsub = subscribeBanner(listener);
    showAlert('Info', 'Data tersimpan.');
    expect(listener).toHaveBeenCalledWith({ title: 'Info', message: 'Data tersimpan.' });
    expect(alertMock).not.toHaveBeenCalled();
    unsub();
  });

  it('tombol tunggal non-destructive → banner + panggil onPress (menutup gap web no-op)', async () => {
    const listener = jest.fn();
    const onOk = jest.fn();
    const unsub = subscribeBanner(listener);
    showAlert('Sukses', 'Tersimpan.', [{ text: 'OK', onPress: onOk }]);
    expect(listener).toHaveBeenCalled();
    // onPress dijalankan via microtask agar tidak reentrant.
    await Promise.resolve();
    expect(onOk).toHaveBeenCalled();
    unsub();
  });
});

describe('showAlert — web confirm (window.confirm)', () => {
  beforeEach(() => setPlatform('web'));

  it('user klik OK → confirm button onPress dipanggil, cancel tidak', () => {
    _setConfirmImplForTest(() => true);
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    showAlert('Arsipkan?', 'Yakin?', [
      { text: 'Batal', style: 'cancel', onPress: onCancel },
      { text: 'Arsipkan', style: 'destructive', onPress: onConfirm },
    ]);
    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('user klik Cancel → cancel button onPress dipanggil, confirm tidak', () => {
    _setConfirmImplForTest(() => false);
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    showAlert('Arsipkan?', 'Yakin?', [
      { text: 'Batal', style: 'cancel', onPress: onCancel },
      { text: 'Arsipkan', style: 'destructive', onPress: onConfirm },
    ]);
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tombol destructive tunggal (tanpa cancel) → tetap masuk jalur confirm', () => {
    _setConfirmImplForTest(() => true);
    const onDelete = jest.fn();
    showAlert('Hapus?', undefined, [{ text: 'Hapus', style: 'destructive', onPress: onDelete }]);
    expect(onDelete).toHaveBeenCalled();
  });

  it('window.confirm menerima title + message tergabung', () => {
    const confirmSpy = jest.fn(() => true);
    _setConfirmImplForTest(confirmSpy);
    showAlert('Hapus?', 'Aksi ini tidak bisa dibatalkan.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: jest.fn() },
    ]);
    expect(confirmSpy).toHaveBeenCalledWith('Hapus?\n\nAksi ini tidak bisa dibatalkan.');
  });
});
