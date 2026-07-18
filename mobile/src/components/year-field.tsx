// YearField — stepper (− / tahun / +) dengan tap-to-edit di tengah.
// Stepper cepat untuk ±1, tap angka → keyboard numerik untuk lompat jauh.
// Nilai tetap string "YYYY"; blur/submit clamp ke min..max.
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';

import { usePlaceholderColor } from '@/components/ui';

const CURRENT_YEAR = new Date().getFullYear();
export const YEAR_MIN = 2000;
export const YEAR_MAX = CURRENT_YEAR + 20;

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  min?: number;
  max?: number;
};

export function YearField({
  label,
  value,
  onChange,
  required,
  min = YEAR_MIN,
  max = YEAR_MAX,
}: Props) {
  const parsed = /^\d{4}$/.test(value) ? Number(value) : CURRENT_YEAR;
  const year = Math.min(max, Math.max(min, parsed));
  const canDec = year > min;
  const canInc = year < max;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<{ focus(): void }>(null);
  const placeholderColor = usePlaceholderColor();

  function step(delta: number) {
    const next = Math.min(max, Math.max(min, year + delta));
    if (next !== year) onChange(String(next));
  }

  function startEdit() {
    setDraft(String(year));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function commitEdit() {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isFinite(n) || n < min || n > max || !/^\d{4}$/.test(draft)) return;
    onChange(draft);
  }

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-700 dark:text-red-400"> *</Text> : null}
      </Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Kurangi tahun ${label}`}
          accessibilityState={{ disabled: !canDec }}
          disabled={!canDec}
          onPress={() => step(-1)}
          className={`h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 active:opacity-70 dark:border-neutral-700 ${
            canDec ? '' : 'opacity-40'
          }`}>
          <Text className="text-xl font-semibold text-black dark:text-white">−</Text>
        </Pressable>

        {editing ? (
          <TextInput
            ref={inputRef as React.RefObject<any>}
            accessibilityLabel={`Ketik tahun ${label}`}
            className="min-h-[44px] flex-1 rounded-xl border border-brand-dark px-4 text-center text-base font-semibold text-black dark:text-white"
            keyboardType="number-pad"
            maxLength={4}
            value={draft}
            onChangeText={(t) => setDraft(t.replace(/\D/g, ''))}
            onBlur={commitEdit}
            onSubmitEditing={commitEdit}
            placeholderTextColor={placeholderColor}
            placeholder={String(CURRENT_YEAR)}
            selectTextOnFocus
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${year} — ketuk untuk mengubah`}
            onPress={startEdit}
            className="min-h-[44px] flex-1 items-center justify-center rounded-xl border border-neutral-300 px-4 active:opacity-70 dark:border-neutral-700">
            <Text className="text-base font-semibold text-black dark:text-white">{year}</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tambah tahun ${label}`}
          accessibilityState={{ disabled: !canInc }}
          disabled={!canInc}
          onPress={() => step(1)}
          className={`h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 active:opacity-70 dark:border-neutral-700 ${
            canInc ? '' : 'opacity-40'
          }`}>
          <Text className="text-xl font-semibold text-black dark:text-white">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
