// DateMultiField — pilih banyak tanggal (chip list + tombol "+ Tambah tanggal").
// Menggantikan TextInput "YYYY-MM-DD, YYYY-MM-DD" yang rawan typo untuk Custom Repeat Dates.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';

import { DateField } from '@/components/date-field';
import { DATE_RE } from '@/lib/date';

type Props = {
  label: string;
  values: string[];
  onChange: (dates: string[]) => void;
  required?: boolean;
};

export function DateMultiField({ label, values, onChange, required }: Props) {
  const [draft, setDraft] = useState('');
  // A11y: `*` merah tak terdengar → sisipkan " wajib" di ringkasan grup (satu-satunya node
  // ber-label yang membawa identitas field). Nested DateField "Tambah tanggal" tak wajib.
  const fieldLabel = required ? `${label} wajib` : label;

  function addDraft() {
    if (!DATE_RE.test(draft)) return;
    if (values.includes(draft)) {
      setDraft('');
      return;
    }
    const next = [...values, draft].sort();
    onChange(next);
    setDraft('');
  }

  function remove(d: string) {
    onChange(values.filter((v) => v !== d));
  }

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      {values.length > 0 ? (
        <View className="flex-row flex-wrap gap-2" accessibilityLabel={`${fieldLabel} — ${values.length} tanggal terpilih`}>
          {values.map((d) => (
            <Pressable
              key={d}
              onPress={() => remove(d)}
              accessibilityRole="button"
              accessibilityLabel={`Hapus tanggal ${d}`}
              className="min-h-[36px] flex-row items-center gap-2 rounded-full border border-brand-dark bg-brand-dark px-3 py-1.5 active:opacity-70">
              <Text className="text-xs font-semibold text-white">{d}</Text>
              <Ionicons name="close" size={14} color="#ffffff" />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          Belum ada tanggal — pilih via kalender lalu tekan Tambah.
        </Text>
      )}
      <DateField
        label="Tambah tanggal"
        value={draft}
        onChange={setDraft}
        placeholder="Pilih tanggal…"
      />
      <Pressable
        onPress={addDraft}
        disabled={!DATE_RE.test(draft)}
        accessibilityRole="button"
        accessibilityLabel="Tambah tanggal ke daftar"
        accessibilityState={{ disabled: !DATE_RE.test(draft) }}
        className={`min-h-[44px] items-center justify-center rounded-xl border border-brand-dark px-4 py-2 active:opacity-70 ${
          DATE_RE.test(draft) ? '' : 'opacity-40'
        }`}>
        <Text className="text-sm font-semibold text-brand-dark">+ Tambah</Text>
      </Pressable>
    </View>
  );
}
