// UI-S-I02 — Native date picker reusable.
// iOS: bottom-sheet Modal yang berisi inline calendar @expo/ui.
// Android: dialog DateTimePicker (auto-buka saat mount, unmount setelah pilih/cancel).
// Web: <input type="date"> native browser (kalender + ikon), value sudah YYYY-MM-DD.
// Jest: fallback TextInput agar test environment tidak crash karena native module.
import { useState } from 'react';
import { Modal, Platform } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlaceholderColor } from '@/components/ui';
import { useThemePreference } from '@/providers/theme-provider';
import {
  DATE_HINT,
  DATE_RE,
  addDaysISO,
  endOfMonthISO,
  todayISO,
} from '@/lib/date';

export function parseISODate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Lazy require supaya jest yang tidak punya native bridge tetap aman.
// Dievaluasi sekali saat module load (bukan saat render) — memenuhi react-hooks/static-components.
type NativePicker = React.ComponentType<{
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  display?: 'default' | 'spinner' | 'compact' | 'inline' | 'calendar' | 'clock';
  presentation?: 'inline' | 'dialog';
  onValueChange?: (event: unknown, date: Date) => void;
  onDismiss?: () => void;
}>;

function loadDateTimePicker(): NativePicker | null {
  if (Platform.OS === 'web') return null;
  if (process.env.NODE_ENV === 'test') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@expo/ui/community/datetime-picker');
    return mod.DateTimePicker ?? mod.default ?? null;
  } catch {
    return null;
  }
}

const Picker: NativePicker | null = loadDateTimePicker();

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  // Override a11y label — dipakai layar dgn banyak field sama (mis. per-baris DCR resubmit).
  accessibilityLabel?: string;
  // Tampilkan quick chips ("Hari ini", "Besok", "+7 hari", "Akhir bulan") di atas picker button.
  // Menghemat 2–3 tap untuk kasus deadline tersering.
  quickChips?: boolean;
};

const QUICK_CHIPS: { label: string; value: () => string }[] = [
  { label: 'Hari ini', value: todayISO },
  { label: 'Besok', value: () => addDaysISO(todayISO(), 1) },
  { label: '+7 hari', value: () => addDaysISO(todayISO(), 7) },
  { label: 'Akhir bulan', value: () => endOfMonthISO() },
];

export function DateField({
  label,
  value,
  onChange,
  required,
  placeholder,
  accessibilityLabel,
  quickChips,
}: Props) {
  const [show, setShow] = useState(false);
  const placeholderColor = usePlaceholderColor();
  const insets = useSafeAreaInsets();
  const { effective } = useThemePreference();
  const a11yLabel = accessibilityLabel ?? label;
  // A11y: `*` merah tak terdengar pembaca layar → sisipkan " wajib" di label field.
  // Web memakai aria-required (semantik native), jadi hanya jalur RN yang menambah teks.
  const fieldLabel = required ? `${a11yLabel} wajib` : a11yLabel;
  const buttonPlaceholder = placeholder ?? 'Pilih tanggal';
  const inputPlaceholder = placeholder ?? DATE_HINT;
  const current = parseISODate(value) ?? new Date();

  const chips = quickChips ? (
    <View className="flex-row flex-wrap gap-2">
      {QUICK_CHIPS.map((c) => {
        const chipValue = c.value();
        const active = value === chipValue;
        return (
          <Pressable
            key={c.label}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${c.label}`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(chipValue)}
            className={`min-h-[36px] justify-center rounded-full border px-3 py-1.5 active:opacity-70 ${
              active
                ? 'border-brand-dark bg-brand-dark'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}>
            <Text
              className={`text-xs font-semibold ${
                active ? 'text-white' : 'text-black dark:text-white'
              }`}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  // Web: kalender native browser via <input type="date">. Value HTML5 selalu YYYY-MM-DD,
  // cocok dengan format simpan app — tak perlu konversi. Dikecualikan saat test (jsdom
  // memakai jalur TextInput agar query getByPlaceholderText yang ada tetap valid).
  if (Platform.OS === 'web' && process.env.NODE_ENV !== 'test') {
    const dark = effective === 'dark';
    return (
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-black dark:text-white">
          {label}
          {required ? <Text className="text-red-500"> *</Text> : null}
        </Text>
        {chips}
        <input
          type="date"
          aria-label={a11yLabel}
          aria-required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            boxSizing: 'border-box',
            width: '100%',
            minHeight: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: dark ? '#404040' : '#d4d4d4',
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 12,
            paddingBottom: 12,
            fontSize: 16,
            fontFamily: 'inherit',
            color: dark ? '#ffffff' : '#000000',
            backgroundColor: 'transparent',
            colorScheme: dark ? 'dark' : 'light',
          }}
        />
      </View>
    );
  }

  // Fallback (test / native module hilang): TextInput pola lama.
  if (!Picker) {
    return (
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-black dark:text-white">
          {label}
          {required ? <Text className="text-red-500"> *</Text> : null}
        </Text>
        {chips}
        <TextInput
          accessibilityLabel={fieldLabel}
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder={inputPlaceholder}
          placeholderTextColor={placeholderColor}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
        />
      </View>
    );
  }

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      {chips}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${fieldLabel}: ${value || buttonPlaceholder}`}
        onPress={() => setShow(true)}
        className="min-h-[44px] justify-center rounded-xl border border-neutral-300 px-4 py-3 active:opacity-70 dark:border-neutral-700">
        <Text className={value ? 'text-base text-black dark:text-white' : 'text-base text-neutral-400'}>
          {value || buttonPlaceholder}
        </Text>
      </Pressable>

      {show && Platform.OS === 'ios' ? (
        <Modal transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable
            className="flex-1 bg-black/50"
            accessibilityRole="button"
            accessibilityLabel="Tutup pemilih tanggal"
            onPress={() => setShow(false)}
          />
          <View
            className="bg-white p-4 dark:bg-neutral-900"
            // paddingBottom aman home-indicator: tombol "Selesai" tak tenggelam.
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
            accessibilityViewIsModal>
            <Picker
              value={current}
              mode="date"
              display="inline"
              onValueChange={(_e: unknown, d: Date) => onChange(d.toLocaleDateString('en-CA'))}
            />
            <Pressable
              onPress={() => setShow(false)}
              className="mt-2 min-h-[44px] items-center justify-center rounded-xl bg-brand-dark px-4 py-3"
              accessibilityRole="button"
              accessibilityLabel="Selesai pilih tanggal">
              <Text className="text-base font-semibold text-white">Selesai</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}

      {show && Platform.OS === 'android' ? (
        <Picker
          value={current}
          mode="date"
          presentation="dialog"
          onValueChange={(_e: unknown, d: Date) => {
            onChange(d.toLocaleDateString('en-CA'));
            setShow(false);
          }}
          onDismiss={() => setShow(false)}
        />
      ) : null}
    </View>
  );
}
