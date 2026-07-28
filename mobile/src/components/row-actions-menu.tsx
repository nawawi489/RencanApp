// RowActionsMenu (UI-G-009) — bottom-sheet Modal generik untuk aksi sekunder per-card
// (Arsipkan, Ubah, Salin, Hapus draft, dst). Parent kontrol open via state.
//
// Pola DESIGN.md §4 — touch ≥44px; varian dark; destructive pakai red-600/red-400.
import { Modal } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

export type RowAction = {
  /** Label aksi. Juga jadi accessibilityLabel. */
  label: string;
  /** Callback aksi. Menu otomatis menutup SEBELUM onPress dipanggil (parent reset state). */
  onPress: () => void;
  /** Tampilkan dengan warna red (untuk Hapus/Arsipkan kalau destructive). */
  destructive?: boolean;
};

export function RowActionsMenu({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  /** Judul sheet (opsional). Bila kosong, sheet hanya berisi action list + Tutup. */
  title?: string;
  items: RowAction[];
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="gap-2 rounded-t-3xl bg-white p-4 dark:bg-neutral-900"
          accessibilityLabel={title ? `Aksi: ${title}` : 'Aksi card'}
          accessibilityViewIsModal>
          {title ? (
            <Text
              className="px-2 pb-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400"
              numberOfLines={2}>
              {title}
            </Text>
          ) : null}

          {items.map((it, i) => {
            const labelCls = it.destructive
              ? 'text-red-600 dark:text-red-400'
              : 'text-black dark:text-white';
            const border = i > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : '';
            return (
              <Pressable
                key={`${it.label}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={it.label}
                className="active:opacity-70"
                onPress={() => {
                  onClose();
                  it.onPress();
                }}>
                <View className={`min-h-[44px] items-start justify-center px-4 py-3 ${border}`}>
                  <Text className={`text-base font-medium ${labelCls}`}>{it.label}</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable
            className="mt-1 min-h-[44px] items-center justify-center rounded-xl border border-neutral-200 active:opacity-70 dark:border-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Tutup menu aksi"
            onPress={onClose}>
            <Text className="text-sm font-semibold text-brand-dark dark:text-brand">Tutup</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
