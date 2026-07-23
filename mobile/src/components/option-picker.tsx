import { useState } from 'react';
import { Modal } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

export type PickerOption = { value: string; label: string; hint?: string | null };

/**
 * Form field pemilih satu opsi dari daftar pendek (Departemen, dsb.).
 * Sepupu `UserPicker` — idiom modal + baris ≥44px yang sama; bedanya sumber opsi
 * datang dari pemanggil, bukan query profiles.
 */
export function OptionPicker({
  label,
  required,
  options,
  value,
  onChange,
  placeholder = 'Pilih…',
  clearLabel = 'Kosongkan pilihan',
  emptyText = 'Belum ada pilihan.',
}: {
  label: string;
  required?: boolean;
  options: PickerOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  clearLabel?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-600 dark:text-red-400"> *</Text> : null}
      </Text>
      <Pressable
        className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-neutral-300 px-4 py-3 active:opacity-70 dark:border-neutral-700"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? selected.label : 'belum dipilih'}`}>
        <Text className={selected ? 'text-base text-black dark:text-white' : 'text-base text-neutral-400'}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text className="text-neutral-400">▾</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[70%] gap-3 rounded-t-2xl bg-white p-5 dark:bg-neutral-900">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-black dark:text-white">{label}</Text>
              <Pressable
                className="min-h-[44px] justify-center px-2 active:opacity-60"
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Tutup pemilih"
                hitSlop={8}>
                <Text className="text-base font-semibold text-brand-dark dark:text-brand">Tutup</Text>
              </Pressable>
            </View>

            <ScrollView className="grow-0">
              {value ? (
                <Pressable
                  className="min-h-[44px] justify-center border-b border-neutral-100 py-3 active:opacity-60 dark:border-neutral-800"
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={clearLabel}>
                  <Text className="text-base text-red-600 dark:text-red-400">{clearLabel}</Text>
                </Pressable>
              ) : null}
              {options.map((o) => {
                const isSelected = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    className="min-h-[44px] justify-center border-b border-neutral-100 py-3 active:opacity-60 dark:border-neutral-800"
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={o.label}>
                    <Text
                      className={`text-base ${isSelected ? 'font-semibold text-brand-dark dark:text-brand' : 'text-black dark:text-white'}`}>
                      {o.label}
                    </Text>
                    {o.hint ? <Text className="text-xs text-neutral-400">{o.hint}</Text> : null}
                  </Pressable>
                );
              })}
              {options.length === 0 ? (
                <Text className="py-4 text-center text-sm text-neutral-400">{emptyText}</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
