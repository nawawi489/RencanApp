// TimeField — analog DateField untuk memilih jam (HH:MM, 24h).
// iOS/Android: native picker mode='time'. Web: <input type="time"> native browser.
// Jest: fallback TextInput HH:MM agar test environment tidak crash karena native module.
import { useState } from 'react';
import { Modal, Platform } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlaceholderColor } from '@/components/ui';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useThemePreference } from '@/providers/theme-provider';
import { TIME_HINT, TIME_RE } from '@/lib/date';

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

function formatHM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseHM(value: string): Date {
  const now = new Date();
  if (!TIME_RE.test(value)) return now;
  const [h, m] = value.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  accessibilityLabel?: string;
};

export function TimeField({
  label,
  value,
  onChange,
  required,
  placeholder,
  accessibilityLabel,
}: Props) {
  const [show, setShow] = useState(false);
  const placeholderColor = usePlaceholderColor();
  const insets = useSafeAreaInsets();
  const { effective } = useThemePreference();
  const reduceMotion = useReduceMotion();
  const a11yLabel = accessibilityLabel ?? label;
  // A11y: `*` merah tak terdengar pembaca layar → sisipkan " wajib" di label field.
  // Web memakai aria-required (semantik native), jadi hanya jalur RN yang menambah teks.
  const fieldLabel = required ? `${a11yLabel} wajib` : a11yLabel;
  const buttonPlaceholder = placeholder ?? 'Pilih jam';
  const inputPlaceholder = placeholder ?? TIME_HINT;
  const current = parseHM(value);

  // Web: time picker native browser via <input type="time">. Value HTML5 selalu HH:MM,
  // cocok dengan format simpan app. Dikecualikan saat test (jsdom
  // memakai jalur TextInput agar query getByPlaceholderText yang ada tetap valid).
  if (Platform.OS === 'web' && process.env.NODE_ENV !== 'test') {
    const dark = effective === 'dark';
    return (
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-black dark:text-white">
          {label}
          {required ? <Text className="text-red-500"> *</Text> : null}
        </Text>
        <input
          type="time"
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
        <Modal
          transparent
          animationType={reduceMotion ? 'none' : 'slide'}
          onRequestClose={() => setShow(false)}>
          <Pressable
            className="flex-1 bg-black/50"
            accessibilityRole="button"
            accessibilityLabel="Tutup pemilih jam"
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
              mode="time"
              display="spinner"
              onValueChange={(_e: unknown, d: Date) => onChange(formatHM(d))}
            />
            <Pressable
              onPress={() => setShow(false)}
              className="mt-2 min-h-[44px] items-center justify-center rounded-xl bg-brand-dark px-4 py-3"
              accessibilityRole="button"
              accessibilityLabel="Selesai pilih jam">
              <Text className="text-base font-semibold text-white">Selesai</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}

      {show && Platform.OS === 'android' ? (
        <Picker
          value={current}
          mode="time"
          presentation="dialog"
          onValueChange={(_e: unknown, d: Date) => {
            onChange(formatHM(d));
            setShow(false);
          }}
          onDismiss={() => setShow(false)}
        />
      ) : null}
    </View>
  );
}
