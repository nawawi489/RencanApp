// RowActionsMenu (UI-G-009) — menu aksi sekunder per-card (Arsipkan, Ubah, Salin, dst).
// Parent kontrol open via state.
//
// iOS (harden-2): SHEET AKSI NATIVE lewat `ActionSheetIOS.showActionSheetWithOptions` — bukan lagi
// `<Modal>` hand-rolled yang meniru metafora iOS. Tombol destruktif diwarnai native via
// `destructiveButtonIndex`; setiap `label` jadi teks tombol (sekaligus label aksesibilitas VoiceOver).
// Android / web / jest: fallback `BottomSheet` (Material bottom sheet + varian dark) — pola platform
// split yang sama dengan date-field.tsx/time-field.tsx. `NODE_ENV === 'test'` sengaja memakai jalur
// BottomSheet agar test bisa meng-query isi sheet (ActionSheetIOS tak me-render apa pun ke tree).
//
// Pola DESIGN.md §4 — touch ≥44px; varian dark; destructive pakai red-600/red-400 (jalur BottomSheet).
import { useEffect, useRef } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

import { BottomSheet } from '@/components/bottom-sheet';

export type RowAction = {
  /** Label aksi. Juga jadi accessibilityLabel. */
  label: string;
  /** Callback aksi. Menu otomatis menutup SEBELUM onPress dipanggil (parent reset state). */
  onPress: () => void;
  /** Tampilkan dengan warna red (untuk Hapus/Arsipkan kalau destructive). */
  destructive?: boolean;
};

// Dievaluasi sekali saat module load (Platform.OS & NODE_ENV stabil) — memenuhi
// react-hooks/static-components dan menghindari cabang render kondisional per-frame.
const USE_NATIVE_ACTION_SHEET = Platform.OS === 'ios' && process.env.NODE_ENV !== 'test';

const CANCEL_LABEL = 'Batal';

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
  // iOS: buka ActionSheet native pada rising-edge `open`. `shownRef` mencegah re-show saat
  // effect jalan ulang (deps berubah) selagi `open` masih true.
  const shownRef = useRef(false);
  useEffect(() => {
    if (!USE_NATIVE_ACTION_SHEET) return;
    if (!open) {
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;

    const labels = items.map((it) => it.label);
    const cancelButtonIndex = labels.length;
    const destructiveButtonIndex = items
      .map((it, i) => (it.destructive ? i : -1))
      .filter((i) => i >= 0);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...labels, CANCEL_LABEL],
        cancelButtonIndex,
        ...(destructiveButtonIndex.length ? { destructiveButtonIndex } : {}),
      },
      (buttonIndex) => {
        // Tutup dulu (parent reset state), lalu jalankan aksi — kontrak sama dgn jalur BottomSheet.
        onClose();
        if (buttonIndex === cancelButtonIndex) return;
        items[buttonIndex]?.onPress();
      },
    );
  }, [open, items, title, onClose]);

  if (USE_NATIVE_ACTION_SHEET) return null;

  return (
    <BottomSheet
      visible={open}
      onRequestClose={onClose}
      sheetClassName="gap-2 rounded-t-3xl bg-white p-4 dark:bg-neutral-900"
      accessibilityLabel={title ? `Aksi: ${title}` : 'Aksi card'}>
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
    </BottomSheet>
  );
}
