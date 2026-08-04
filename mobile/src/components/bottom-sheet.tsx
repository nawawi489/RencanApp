// Primitive sheet-bawah standar (P0-1 safe-area).
//
// Sebelum ini ~8 sheet menuliskan sendiri `Modal > flex-1 justify-end bg-black/40 >
// kartu rounded-t` TANPA inset — tombol/konten paling bawah tenggelam di balik home
// indicator iOS. Primitive ini MEMILIKI kontrak inset: kartu selalu diberi
// `paddingBottom: Math.max(insets.bottom, 16)` lewat `style` (menang atas `p-*` di
// className), jadi setiap adopter otomatis aman dari home indicator.
//
// Catatan className/web: `View` diimpor dari `react-native-css/components` supaya
// `className` benar-benar teraplikasi di web (komponen `react-native` polos men-drop
// className diam-diam). `Modal` dari `react-native` (tak menerima className).
import type { PropsWithChildren } from 'react';
import { Modal } from 'react-native';
import { View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  onRequestClose: () => void;
  /** Label a11y untuk kartu sheet (di-set `accessibilityViewIsModal`). */
  accessibilityLabel?: string;
  /** Override className kartu sheet — mis. `max-h-[70%] rounded-t-2xl`. `paddingBottom`
   *  tetap dimiliki primitive lewat `style`, jadi `p-*` di sini aman ditulis. */
  sheetClassName?: string;
}>;

const DEFAULT_SHEET_CLASS = 'max-h-[88%] gap-3 rounded-t-3xl bg-white p-5 dark:bg-neutral-900';

export function BottomSheet({
  visible,
  onRequestClose,
  accessibilityLabel,
  sheetClassName,
  children,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className={sheetClassName ?? DEFAULT_SHEET_CLASS}
          // Inset home-indicator dimiliki di sini — menang atas paddingBottom dari `p-*`.
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}>
          {children}
        </View>
      </View>
    </Modal>
  );
}
