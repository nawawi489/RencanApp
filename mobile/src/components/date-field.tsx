// UI-S-I02 — Native date picker reusable.
// iOS: bottom-sheet Modal yang berisi inline calendar @expo/ui.
// Android: dialog DateTimePicker (auto-buka saat mount, unmount setelah pilih/cancel).
// Jest/web: fallback TextInput agar test environment tidak crash karena native module.
import { useState } from 'react';
import { Modal, Platform } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';

import { usePlaceholderColor } from '@/components/ui';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
};

export function DateField({
  label,
  value,
  onChange,
  required,
  placeholder = 'Pilih tanggal',
}: Props) {
  const [show, setShow] = useState(false);
  const placeholderColor = usePlaceholderColor();
  const current = parseISODate(value) ?? new Date();

  // Fallback (web/test/native module hilang): TextInput pola lama.
  if (!Picker) {
    return (
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-black dark:text-white">
          {label}
          {required ? <Text className="text-red-500"> *</Text> : null}
        </Text>
        <TextInput
          accessibilityLabel={label}
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="YYYY-MM-DD"
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
        accessibilityLabel={`${label}: ${value || placeholder}`}
        onPress={() => setShow(true)}
        className="min-h-[44px] justify-center rounded-xl border border-neutral-300 px-4 py-3 active:opacity-70 dark:border-neutral-700">
        <Text className={value ? 'text-base text-black dark:text-white' : 'text-base text-neutral-400'}>
          {value || placeholder}
        </Text>
      </Pressable>

      {show && Platform.OS === 'ios' ? (
        <Modal transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable
            className="flex-1 bg-black/50"
            accessibilityLabel="Tutup pemilih tanggal"
            onPress={() => setShow(false)}
          />
          <View className="bg-white p-4 dark:bg-neutral-900" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
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
