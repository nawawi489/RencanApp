import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { BottomSheet } from '@/components/bottom-sheet';
import { useThemedIcon } from '@/providers/theme-provider';
import { listOrgProfiles, personLabel, type PersonRef } from '@/lib/cards';

type Person = NonNullable<PersonRef>;

/** Form field pemilih satu anggota org (untuk PIC / Reviewer). */
export function UserPicker({
  label,
  required,
  value,
  onChange,
  excludeId,
  excludeIds,
}: {
  label: string;
  required?: boolean;
  value: Person | null;
  onChange: (p: Person | null) => void;
  excludeId?: string | null;
  /** Beberapa orang sekaligus — mis. yang sudah jadi anggota Tim. */
  excludeIds?: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const caretIcon = useThemedIcon('#6b7280', '#a3a3a3');
  const { data, isLoading } = useQuery({ queryKey: ['org-profiles'], queryFn: () => listOrgProfiles() });
  const options = (data ?? []).filter((p) => p.id !== excludeId && !excludeIds?.has(p.id));
  // A11y: `*` merah tak terdengar → sisipkan " wajib" di label field (DESIGN §4 rule 2/4).
  const fieldLabel = required ? `${label} wajib` : label;

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-600 dark:text-red-400"> *</Text> : null}
      </Text>
      <Pressable
        className="flex-row items-center justify-between rounded-xl border border-neutral-300 px-4 py-3 active:opacity-70 dark:border-neutral-700"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${fieldLabel}: ${value ? personLabel(value) : 'belum dipilih'}`}>
        <Text className={value ? 'text-base text-black dark:text-white' : 'text-base text-neutral-400'}>
          {value ? personLabel(value) : 'Pilih orang…'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={caretIcon} />
      </Pressable>

      <BottomSheet
        visible={open}
        onRequestClose={() => setOpen(false)}
        sheetClassName="max-h-[70%] gap-3 rounded-t-2xl bg-white p-5 dark:bg-neutral-900">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-black dark:text-white">{label}</Text>
              <Pressable
                className="min-h-[44px] justify-center px-2 active:opacity-60"
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Tutup pemilih">
                <Text className="text-base font-semibold text-brand-dark dark:text-brand">Tutup</Text>
              </Pressable>
            </View>

            {isLoading ? (
              <ActivityIndicator />
            ) : (
              <ScrollView className="grow-0">
                {value ? (
                  <Pressable
                    className="min-h-[44px] justify-center border-b border-neutral-100 py-3 active:opacity-60 dark:border-neutral-800"
                    onPress={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Kosongkan pilihan">
                    <Text className="text-base text-red-600 dark:text-red-400">Kosongkan pilihan</Text>
                  </Pressable>
                ) : null}
                {options.map((p) => {
                  const selected = p.id === value?.id;
                  return (
                    <Pressable
                      key={p.id}
                      className="min-h-[44px] justify-center border-b border-neutral-100 py-3 active:opacity-60 dark:border-neutral-800"
                      onPress={() => {
                        onChange(p);
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={personLabel(p)}>
                      <Text
                        className={`text-base ${selected ? 'font-semibold text-brand-dark dark:text-brand' : 'text-black dark:text-white'}`}>
                        {personLabel(p)}
                      </Text>
                      {p.email ? <Text className="text-xs text-neutral-400">{p.email}</Text> : null}
                    </Pressable>
                  );
                })}
                {options.length === 0 ? (
                  <Text className="py-4 text-center text-sm text-neutral-400">
                    Belum ada anggota lain di organisasi.
                  </Text>
                ) : null}
              </ScrollView>
            )}
      </BottomSheet>
    </View>
  );
}

