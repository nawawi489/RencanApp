// Platform-aware alert seam (S3-1).
//
// `react-native-web` mengimplementasikan `Alert.alert` sebagai fungsi kosong —
// dialog info tak pernah tampil, dan tombol konfirmasi destruktif jadi tombol
// mati (callback tidak pernah dipanggil) di web. Ini merutekan panggilan:
//
//   - **Native (ios/android)**: pass-through ke `Alert.alert` — perilaku
//     modal RN dipertahankan.
//   - **Web tanpa tombol / hanya info**: emit banner in-app (non-blocking,
//     auto-dismiss). `AlertHost` di root layout yang menampilkan.
//   - **Web dengan konfirmasi (>=2 tombol atau `destructive`)**: pakai
//     `window.confirm` (blocking, sinkron) supaya callback tombol selalu
//     terpanggil. Kombinasi cancel + non-cancel button menentukan mana yang
//     dipanggil setelah user memilih.
//
// Callsite lama boleh terus pakai `Alert.alert` untuk RN-only surfaces; jalur
// user-facing yang harus jalan di web (khususnya `alertFriendlyError` dan
// konfirmasi destruktif) wajib memakai `showAlert`.
import { Alert, Platform, type AlertButton } from 'react-native';

export type AlertButtonSpec = {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
};

export type BannerEvent = {
  title: string;
  message?: string;
};

type BannerListener = (event: BannerEvent) => void;

const bannerListeners = new Set<BannerListener>();

/** Subscribe ke banner event queue. Dipakai `AlertHost`. Return unsubscribe. */
export function subscribeBanner(listener: BannerListener): () => void {
  bannerListeners.add(listener);
  return () => {
    bannerListeners.delete(listener);
  };
}

function emitBanner(event: BannerEvent): void {
  for (const listener of bannerListeners) listener(event);
}

// Injectable untuk test: default `window.confirm` di web, no-op di native.
type ConfirmFn = (text: string) => boolean;

let confirmImpl: ConfirmFn | null = null;

/** Test seam: override implementasi `window.confirm` yang dipakai `showAlert` di web. */
export function _setConfirmImplForTest(fn: ConfirmFn | null): void {
  confirmImpl = fn;
}

function getConfirm(): ConfirmFn {
  if (confirmImpl) return confirmImpl;
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return (text) => window.confirm(text);
  }
  // Fallback: web build tanpa `window.confirm` (SSR/tes) → default proceed.
  return () => true;
}

function isConfirmShape(buttons: AlertButtonSpec[]): boolean {
  if (buttons.length >= 2) return true;
  return buttons.some((b) => b.style === 'destructive' || b.style === 'cancel');
}

/**
 * Tampilkan alert lintas-platform. Signature meniru `Alert.alert(title, message, buttons)`
 * agar migrasi dari `Alert.alert` di callsite yang perlu jalan di web tidak lebih dari
 * penggantian nama fungsi. Perilaku native tidak berubah.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButtonSpec[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons as AlertButton[] | undefined);
    return;
  }

  const btns = buttons ?? [];

  if (btns.length === 0 || !isConfirmShape(btns)) {
    emitBanner({ title, message });
    // Info dengan tombol tunggal (mis. "OK") tetap panggil onPress supaya
    // panggilan pola `.alert(title, msg, [{ text: 'OK', onPress: fn }])`
    // (yang dipakai untuk chain aksi setelah dismiss) tidak mati diam-diam.
    const single = btns[0];
    if (single?.onPress) queueMicrotask(() => void single.onPress!());
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;
  const proceed = getConfirm()(text);
  const cancel = btns.find((b) => b.style === 'cancel');
  const confirm = btns.find((b) => b.style !== 'cancel') ?? btns[btns.length - 1];
  const chosen = proceed ? confirm : cancel;
  chosen?.onPress?.();
}
