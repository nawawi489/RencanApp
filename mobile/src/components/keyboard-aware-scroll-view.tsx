import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView, ScrollView } from 'react-native-css/components';

type Props = ComponentProps<typeof ScrollView>;

/**
 * ScrollView pembungkus form yang menaikkan field di atas keyboard (P1 adapt item 4).
 *
 * Drop-in untuk `<ScrollView>` pada layar create/edit: sebelumnya 26 layar text-entry (jalur
 * inti buat/ubah card) tak punya `KeyboardAvoidingView`, sehingga di iOS field bawah form
 * panjang diketik "buta" di balik keyboard. Sprint 5–9 menambah KAV manual ke 14 layar
 * settings/auth; komponen ini menyatukan pola itu agar layar form lain tinggal menukar tag.
 *
 * - `behavior`: `'padding'` di iOS; Android dibiarkan `undefined` mengandalkan `adjustResize`
 *   (windowSoftInputMode) — pola RN standar.
 * - `keyboardVerticalOffset={0}`: mengikuti konvensi 14 layar KAV yang sudah rilis di repo.
 *   `useHeaderHeight()` (@react-navigation/elements) akan lebih presisi untuk native stack
 *   yang header-nya di luar frame konten, tetapi paket itu tak ter-resolve pada bundling
 *   expo-router proyek ini (react-navigation di-vendor di dalam expo-router), jadi tak dipakai.
 * - Di web efektif no-op (react-native-web tak punya soft keyboard) — aman untuk semua layar.
 *
 * `className` & prop ScrollView lain (mis. `contentContainerStyle`) diteruskan apa adanya;
 * `keyboardShouldPersistTaps` default `'handled'` agar tap tombol saat keyboard terbuka tetap
 * jalan (mencocokkan pola form existing).
 */
export function KeyboardAwareScrollView({
  keyboardShouldPersistTaps = 'handled',
  ...props
}: Props) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props} />
    </KeyboardAvoidingView>
  );
}
