// Panel "Pecahan Target Strategi" (UI-S-K01) — PRD V1.8.2 §12.
//
// Tampil di strategy/[id]. Membaca breakdown via useStrategyBreakdown; gating Edit lewat:
//   - has_permission('manage_others_cards')
//   - ATAU current user = pic_id / created_by Strategi (server tetap penegak akhir di RPC).
//
// Editor modal:
//   - Tab Quarter: 4 input numerik (Q1..Q4), bar progress Σ live (target 100%).
//   - Tab Month: 4 sub-section per Quarter, masing-masing 3 input (M01..M03 di Q1, dst).
//   - Field "Alasan perubahan" wajib ≥ 8 char.
//   - Save disabled bila Σ tidak valid atau reason kurang.
import { useMemo, useState } from 'react';
import { Modal, TextInput } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, ProgressBar, SectionCard, SkeletonList, TabBar, usePlaceholderColor } from '@/components/ui';
import { useStrategyBreakdown, useStrategyBreakdownActions } from '@/hooks/use-workspace';
import { useProfile } from '@/hooks/use-profile';
import {
  MONTH_KEYS,
  QUARTER_KEYS,
  indexMonthRowsPerQuarter,
  indexQuarterRows,
  quarterOfMonthKey,
  sumOf,
  type MonthInput,
  type MonthKey,
  type QuarterInput,
  type QuarterKey,
} from '@/lib/strategy-breakdown';
import { alertFriendlyError } from '@/lib/errors';

type EditTab = 'quarter' | 'month';

const MONTH_LABEL: Record<MonthKey, string> = {
  M01: 'Januari', M02: 'Februari', M03: 'Maret',
  M04: 'April', M05: 'Mei', M06: 'Juni',
  M07: 'Juli', M08: 'Agustus', M09: 'September',
  M10: 'Oktober', M11: 'November', M12: 'Desember',
};

function pctToStr(n: number): string {
  if (!Number.isFinite(n)) return '';
  // Tampilkan tanpa trailing .000 berlebih (sumber numeric(6,3)).
  return Number(n.toFixed(3)).toString();
}

function parsePct(s: string): number {
  const t = s.replace(',', '.').trim();
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function StrategyBreakdownPanel({
  strategyId,
  picId,
  createdBy,
}: {
  strategyId: string;
  picId: string | null | undefined;
  createdBy: string | null | undefined;
}) {
  const { profile, can } = useProfile();
  const { rows, isLoading, isError, refetch } = useStrategyBreakdown(strategyId);

  const canEdit =
    can('manage_others_cards') ||
    (!!profile?.id && (profile.id === picId || profile.id === createdBy));

  const quarterMap = useMemo(() => indexQuarterRows(rows), [rows]);
  const monthMap = useMemo(() => indexMonthRowsPerQuarter(rows), [rows]);
  const quarterTotal = useMemo(
    () => sumOf(QUARTER_KEYS.map((k) => quarterMap[k] || 0)),
    [quarterMap],
  );
  const hasAnyData = rows.length > 0;

  const [open, setOpen] = useState(false);

  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-bold text-black dark:text-white">Pecahan Target</Text>
        {canEdit ? (
          <Pressable
            className="min-h-[44px] items-center justify-center rounded-xl bg-brand-dark px-3 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Ubah Pecahan Target"
            onPress={() => setOpen(true)}>
            <Text className="text-sm font-semibold text-white">Ubah</Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <SkeletonList count={2} />
      ) : isError ? (
        <Text className="text-sm text-red-700 dark:text-red-400">
          Gagal memuat breakdown.{' '}
          <Text className="underline" onPress={() => refetch()}>
            Coba lagi
          </Text>
        </Text>
      ) : !hasAnyData ? (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">
          Belum ada pecahan target. {canEdit ? 'Tekan "Ubah" untuk mengatur kontribusi Quarter/Bulan.' : ''}
        </Text>
      ) : (
        <View className="gap-3">
          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Quarter</Text>
              <Text
                className={`text-xs font-semibold ${
                  Math.abs(quarterTotal - 100) <= 0.001
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                Σ {pctToStr(quarterTotal)}%
              </Text>
            </View>
            <ProgressBar value={Math.min(100, quarterTotal)} tone={Math.abs(quarterTotal - 100) <= 0.001 ? 'success' : undefined} />
            <View className="flex-row flex-wrap gap-2">
              {QUARTER_KEYS.map((qk) => (
                <View
                  key={qk}
                  className="rounded-lg border border-neutral-200 px-3 py-1 dark:border-neutral-800">
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">{qk}</Text>
                  <Text className="text-sm font-semibold text-black dark:text-white">
                    {pctToStr(quarterMap[qk] || 0)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {QUARTER_KEYS.some((qk) => Object.keys(monthMap[qk]).length > 0) ? (
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Bulan per Quarter</Text>
              {QUARTER_KEYS.map((qk) => {
                const months = monthMap[qk];
                const monthKeys = MONTH_KEYS.filter((m) => quarterOfMonthKey(m) === qk);
                const hasMonths = monthKeys.some((m) => months[m] != null);
                if (!hasMonths) return null;
                const monthSum = monthKeys.reduce((s, m) => s + (months[m] ?? 0), 0);
                return (
                  <View key={qk} className="gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold text-black dark:text-white">{qk}</Text>
                      <Text
                        className={`text-xs font-semibold ${
                          Math.abs(monthSum - 100) <= 0.001
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                        Σ {pctToStr(monthSum)}%
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-1.5">
                      {monthKeys.map((m) => (
                        <View
                          key={m}
                          className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
                          <Text className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {MONTH_LABEL[m]}
                          </Text>
                          <Text className="text-xs font-semibold text-black dark:text-white">
                            {pctToStr(months[m] ?? 0)}%
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      )}

      <BreakdownEditorModal
        open={open}
        onClose={() => setOpen(false)}
        strategyId={strategyId}
        initialQuarter={quarterMap}
        initialMonth={monthMap}
      />
    </SectionCard>
  );
}

// =========================================================== Editor modal

type QuarterDraft = Record<QuarterKey, string>;
type MonthDraft = Record<QuarterKey, Record<MonthKey, string>>;

function emptyMonthDraft(): MonthDraft {
  const out = { Q1: {}, Q2: {}, Q3: {}, Q4: {} } as MonthDraft;
  for (const m of MONTH_KEYS) {
    out[quarterOfMonthKey(m)][m] = '';
  }
  return out;
}

function BreakdownEditorModal({
  open,
  onClose,
  strategyId,
  initialQuarter,
  initialMonth,
}: {
  open: boolean;
  onClose: () => void;
  strategyId: string;
  initialQuarter: Record<QuarterKey, number>;
  initialMonth: Record<QuarterKey, Partial<Record<MonthKey, number>>>;
}) {
  const [tab, setTab] = useState<EditTab>('quarter');
  const [quarter, setQuarter] = useState<QuarterDraft>(() => ({
    Q1: pctToStr(initialQuarter.Q1), Q2: pctToStr(initialQuarter.Q2),
    Q3: pctToStr(initialQuarter.Q3), Q4: pctToStr(initialQuarter.Q4),
  }));
  const [month, setMonth] = useState<MonthDraft>(() => {
    const m = emptyMonthDraft();
    for (const qk of QUARTER_KEYS) {
      for (const mk of MONTH_KEYS) {
        if (quarterOfMonthKey(mk) === qk) {
          m[qk][mk] = pctToStr(initialMonth[qk][mk] ?? 0);
        }
      }
    }
    return m;
  });
  const [reason, setReason] = useState('');
  const placeholderColor = usePlaceholderColor();
  const { replace, isPending } = useStrategyBreakdownActions(strategyId);

  // Reset draft saat modal transisi tertutup → terbuka (pola "adjust state on prop change" react.dev).
  // Selama modal terbuka, perubahan initialQuarter/initialMonth diabaikan agar tidak menimpa edit user.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuarter({
        Q1: pctToStr(initialQuarter.Q1), Q2: pctToStr(initialQuarter.Q2),
        Q3: pctToStr(initialQuarter.Q3), Q4: pctToStr(initialQuarter.Q4),
      });
      const next = emptyMonthDraft();
      for (const qk of QUARTER_KEYS) {
        for (const mk of MONTH_KEYS) {
          if (quarterOfMonthKey(mk) === qk) {
            next[qk][mk] = pctToStr(initialMonth[qk][mk] ?? 0);
          }
        }
      }
      setMonth(next);
      setReason('');
      setTab('quarter');
    }
  }

  const quarterSum = QUARTER_KEYS.reduce((s, k) => s + parsePct(quarter[k]), 0);
  const quarterOk = Math.abs(quarterSum - 100) <= 0.001;
  const reasonOk = reason.trim().length >= 8;

  const monthSumPerQ = useMemo(() => {
    const out = {} as Record<QuarterKey, number>;
    for (const qk of QUARTER_KEYS) {
      const ms = MONTH_KEYS.filter((m) => quarterOfMonthKey(m) === qk).map((m) =>
        parsePct(month[qk][m] ?? '0'),
      );
      out[qk] = sumOf(ms);
    }
    return out;
  }, [month]);
  // Monthly opsional: hanya divalidasi jika user mengisi minimal satu nilai non-nol.
  // Bila semua nol → anggap "tidak diatur" dan kirim p_month=null ke RPC.
  const anyMonthValue = QUARTER_KEYS.some(
    (qk) => monthSumPerQ[qk] > 0,
  );
  const monthOk =
    !anyMonthValue || QUARTER_KEYS.every((qk) => Math.abs(monthSumPerQ[qk] - 100) <= 0.001);

  const canSave = quarterOk && monthOk && reasonOk && !isPending;

  function handleSave() {
    if (!canSave) return;
    const quarterPayload: QuarterInput[] = QUARTER_KEYS.map((qk) => ({
      period_key: qk,
      pct: parsePct(quarter[qk]),
    }));
    const monthPayload: MonthInput[] | null = anyMonthValue
      ? QUARTER_KEYS.flatMap((qk) =>
          MONTH_KEYS.filter((mk) => quarterOfMonthKey(mk) === qk).map((mk) => ({
            period_key: mk,
            parent_quarter_key: qk,
            pct: parsePct(month[qk][mk] ?? '0'),
          })),
        )
      : null;
    replace({ quarter: quarterPayload, month: monthPayload, reason: reason.trim() })
      .then(() => onClose())
      .catch((e) => alertFriendlyError('Gagal menyimpan', e, 'Kesalahan.'));
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="max-h-[88%] gap-3 rounded-t-3xl bg-white p-5 dark:bg-neutral-900"
          accessibilityLabel="Editor Pecahan Target"
          accessibilityViewIsModal>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-black dark:text-white">Ubah Pecahan Target</Text>
            <Pressable
              className="min-h-[44px] items-center justify-center px-2 active:opacity-60"
              accessibilityRole="button"
              accessibilityLabel="Tutup editor"
              onPress={onClose}>
              <Text className="text-base font-semibold text-brand-dark">Tutup</Text>
            </Pressable>
          </View>

          <TabBar<EditTab>
            tabs={[
              { key: 'quarter', label: 'Quarter' },
              { key: 'month', label: 'Bulan' },
            ]}
            active={tab}
            onChange={setTab}
          />

          <ScrollView className="grow-0">
            {tab === 'quarter' ? (
              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Total Quarter</Text>
                  <Text
                    className={`text-sm font-semibold ${
                      quarterOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'
                    }`}>
                    Σ {pctToStr(quarterSum)}% / 100%
                  </Text>
                </View>
                <ProgressBar
                  value={Math.min(100, quarterSum)}
                  tone={quarterOk ? 'success' : undefined}
                />
                {QUARTER_KEYS.map((qk) => (
                  <View key={qk} className="gap-1">
                    <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                      {qk}
                    </Text>
                    <TextInput
                      accessibilityLabel={`Kontribusi ${qk}`}
                      value={quarter[qk]}
                      onChangeText={(v) => setQuarter((cur) => ({ ...cur, [qk]: v }))}
                      keyboardType="decimal-pad"
                      className="min-h-[44px] rounded-xl border border-neutral-300 px-4 text-base text-black dark:border-neutral-700 dark:text-white"
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View className="gap-4">
                {QUARTER_KEYS.map((qk) => {
                  const monthsOfQ = MONTH_KEYS.filter((m) => quarterOfMonthKey(m) === qk);
                  const sum = monthSumPerQ[qk];
                  const ok = Math.abs(sum - 100) <= 0.001;
                  return (
                    <View
                      key={qk}
                      className="gap-2 rounded-2xl border border-neutral-200 p-3 dark:border-neutral-800">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-semibold text-black dark:text-white">{qk}</Text>
                        <Text
                          className={`text-xs font-semibold ${
                            ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'
                          }`}>
                          Σ {pctToStr(sum)}% / 100%
                        </Text>
                      </View>
                      <ProgressBar value={Math.min(100, sum)} tone={ok ? 'success' : undefined} />
                      {monthsOfQ.map((mk) => (
                        <View key={mk} className="gap-1">
                          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                            {MONTH_LABEL[mk]}
                          </Text>
                          <TextInput
                            accessibilityLabel={`Kontribusi ${MONTH_LABEL[mk]}`}
                            value={month[qk][mk] ?? ''}
                            onChangeText={(v) =>
                              setMonth((cur) => ({
                                ...cur,
                                [qk]: { ...cur[qk], [mk]: v },
                              }))
                            }
                            keyboardType="decimal-pad"
                            className="min-h-[44px] rounded-xl border border-neutral-300 px-4 text-base text-black dark:border-neutral-700 dark:text-white"
                          />
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}

            <View className="mt-4 gap-1">
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Alasan perubahan (min. 8 karakter)
              </Text>
              <TextInput
                accessibilityLabel="Alasan perubahan"
                value={reason}
                onChangeText={setReason}
                placeholder="mis. Penyesuaian target Q3 setelah review eksekutif"
                placeholderTextColor={placeholderColor}
                multiline
                className="min-h-[80px] rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
              />
            </View>
          </ScrollView>

          <Button
            label={isPending ? 'Menyimpan…' : 'Simpan Pecahan'}
            onPress={handleSave}
            disabled={!canSave}
            loading={isPending}
          />
        </View>
      </View>
    </Modal>
  );
}
