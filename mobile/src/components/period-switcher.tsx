// PeriodSwitcher (UI-G-010 / UI-S-W03) — PRD V1.8.2 §11.2.
//
// Panel kompak: "Periode aktif" + nilai (Juni 2026) + breadcrumb (Goal 2026 · Q2 · Juni) + "Ubah".
// Tap "Ubah" → bottom-sheet Modal: segmented Bulan/Quarter + list 12 bulan / 4 quarter.
// Tiap baris berstatus pill: Arsip (past), Aktif (current), Akan datang (future).
//
// Touch target ≥44px, dark:* variants, brand-dark utk solid+teks putih (DESIGN.md §4/§7).
import { useMemo, useState } from 'react';
import { Modal } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { usePeriodFocus } from '@/providers/period-focus-provider';
import {
  enumerateMonths,
  enumerateQuarters,
  formatPeriodLabel,
  isSameFocus,
  periodBreadcrumb,
  type PeriodFocus,
  type PeriodMode,
  type PeriodOption,
  type WorkspaceSpace,
} from '@/lib/period-focus';

const MODE_LABEL: Record<PeriodMode, string> = { month: 'Bulan', quarter: 'Quarter' };

function statusPill(status: PeriodOption['status']) {
  if (status === 'current') {
    return { label: 'Aktif', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' };
  }
  if (status === 'past') {
    return { label: 'Arsip', cls: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' };
  }
  return { label: 'Akan datang', cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' };
}

function optionToFocus(opt: PeriodOption): PeriodFocus {
  return opt.mode === 'month'
    ? { mode: 'month', year: opt.year, month: opt.month! }
    : { mode: 'quarter', year: opt.year, quarter: opt.quarter! };
}

export function PeriodSwitcher({ now, space }: { now?: Date; space?: WorkspaceSpace }) {
  const { focus, setFocus, setMode } = usePeriodFocus();
  const [open, setOpen] = useState(false);
  // `now` anchor — di runtime pakai Date saat ini; di test injected agar deterministik.
  const anchor = useMemo(() => now ?? new Date(), [now]);

  const options = useMemo<PeriodOption[]>(
    () =>
      focus.mode === 'month'
        ? enumerateMonths(focus.year, anchor)
        : enumerateQuarters(focus.year, anchor),
    [focus.mode, focus.year, anchor],
  );

  const label = formatPeriodLabel(focus);
  const breadcrumb = periodBreadcrumb(focus, space);
  // WSA-10 — collapsed pill (spec §6.2/§7.2): bg #eef4fb border #d9e3ef (Performance);
  // varian Development #eefaf8/#cceee8.
  const pillTheme =
    space === 'development'
      ? { bg: '#eefaf8', border: '#cceee8', changeBg: '#0f766e' }
      : { bg: '#eef4fb', border: '#d9e3ef', changeBg: '#1877f2' };

  return (
    <>
    <View
      style={{
        minHeight: 48,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: pillTheme.border,
        backgroundColor: pillTheme.bg,
        paddingLeft: 14,
        paddingRight: 6,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
      accessible
      accessibilityLabel={`Periode aktif ${label}`}>
      <View style={{ flex: 1, gap: 0 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: '#64748b', textTransform: 'uppercase' }}>Periode aktif</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }}>{label}</Text>
          <Text style={{ fontSize: 11, color: '#64748b' }} numberOfLines={1}>{breadcrumb}</Text>
        </View>
      </View>
      <Pressable
        style={{ height: 36, borderRadius: 999, backgroundColor: pillTheme.changeBg, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
        className="active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel="Ubah periode"
        onPress={() => setOpen(true)}>
        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '900' }}>Ubah</Text>
      </Pressable>
    </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View
            className="max-h-[75%] gap-4 rounded-t-3xl bg-white p-5 dark:bg-neutral-900"
            accessibilityLabel="Pilih periode fokus">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-bold text-black dark:text-white">Pilih Periode</Text>
              <Pressable
                className="min-h-[44px] items-center justify-center px-2 active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel="Tutup pilihan periode"
                onPress={() => setOpen(false)}>
                <Text className="text-base font-semibold text-brand-dark dark:text-brand">Tutup</Text>
              </Pressable>
            </View>

            <View
              className="flex-row gap-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800"
              accessibilityRole="radiogroup"
              accessibilityLabel="Mode periode">
              {(['month', 'quarter'] as PeriodMode[]).map((m) => {
                const active = focus.mode === m;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={MODE_LABEL[m]}
                    onPress={() => setMode(m)}
                    className={`min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 ${
                      active ? 'bg-brand-dark' : ''
                    } active:opacity-70`}>
                    <Text
                      className={`text-sm font-semibold ${
                        active ? 'text-white' : 'text-black dark:text-white'
                      }`}>
                      {MODE_LABEL[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView className="grow-0">
              <View className="gap-2">
                {options.map((opt) => {
                  const target = optionToFocus(opt);
                  const selected = isSameFocus(focus, target);
                  const pill = statusPill(opt.status);
                  return (
                    <Pressable
                      key={`${opt.mode}-${opt.year}-${opt.month ?? opt.quarter}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${opt.label} ${opt.year} — ${pill.label}`}
                      onPress={() => {
                        setFocus(target);
                        setOpen(false);
                      }}
                      className={`min-h-[44px] flex-row items-center justify-between gap-3 rounded-xl border px-4 py-3 active:opacity-70 ${
                        selected
                          ? 'border-brand-dark bg-blue-50 dark:bg-blue-950/40'
                          : 'border-neutral-200 dark:border-neutral-800'
                      }`}>
                      <Text className="flex-1 text-base font-semibold text-black dark:text-white">
                        {opt.label} {opt.year}
                      </Text>
                      <View className={`rounded-full px-2 py-0.5 ${pill.cls}`}>
                        <Text className={`text-xs font-semibold ${pill.cls}`}>{pill.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
