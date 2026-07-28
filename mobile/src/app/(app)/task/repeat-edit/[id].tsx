// S4-8 — sunting Repeat Rule untuk Tugas yang sudah dibuat. Sebelum ini,
// jadwal harian dengan jam salah tidak bisa diperbaiki selamanya — layar
// Pengaturan Pengulangan menjanjikan "edit di tiap Tugas" tanpa alur nyata.
//
// Rule TERKUNCI begitu instance pertama ter-generate (RPC set_task_repeat_rule
// menolak dengan "instance sudah dibuat"). UI menampilkan form editable hanya
// bila belum ada instance; sesudahnya render read-only + guidance kenapa.
//
// Field yang bisa disunting = seluruh input RPC (frequency, weekdays,
// month_days, custom_dates, periode repeat, time-of-day, missed rule, grace).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { DateMultiField } from '@/components/date-multi-field';
import { DateRangeField } from '@/components/date-range-field';
import { MonthDaysPicker } from '@/components/month-days-picker';
import { TimeField } from '@/components/time-field';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  GuidanceNote,
  LabeledInput,
  SectionCard,
  SkeletonList,
} from '@/components/ui';
import { getTask } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';
import {
  FREQUENCY_LABEL,
  MISSED_RULE_LABEL,
  getRepeatRule,
  hasRepeatInstances,
  setRepeatRule,
  type RepeatRuleInput,
} from '@/lib/repeat';

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'custom'] as const;
const MISSED_RULES = ['strict', 'grace_period', 'overdue_allowed'] as const;
const WEEKDAY_LABEL = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function ChipSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">{label}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {options.map((o) => {
          const active = value === o.key;
          return (
            <Pressable
              key={o.key}
              className={`min-h-[44px] justify-center rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
              onPress={() => onChange(o.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${o.label}`}>
              <Text
                className={active ? 'text-sm font-semibold text-white' : 'text-sm text-black dark:text-white'}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function LiveEditRepeatRuleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const taskQ = useQuery({ queryKey: ['action-plan', id], queryFn: () => getTask(id) });
  const ruleQ = useQuery({ queryKey: ['repeat-rule', id], queryFn: () => getRepeatRule(id) });
  const instancesQ = useQuery({
    queryKey: ['task-has-instances', id],
    queryFn: () => hasRepeatInstances(id),
  });

  const task = taskQ.data;
  const rule = ruleQ.data;
  const hasInstances = instancesQ.data ?? false;
  const locked = hasInstances;

  const [frequencyDraft, setFrequencyDraft] = useState<string | undefined>();
  const [weekdaysDraft, setWeekdaysDraft] = useState<number[] | undefined>();
  const [monthDaysDraft, setMonthDaysDraft] = useState<number[] | undefined>();
  const [customDatesDraft, setCustomDatesDraft] = useState<string[] | undefined>();
  const [startDraft, setStartDraft] = useState<string | undefined>();
  const [endDraft, setEndDraft] = useState<string | undefined>();
  const [timeDraft, setTimeDraft] = useState<string | undefined>();
  const [missedDraft, setMissedDraft] = useState<string | undefined>();
  const [graceDraft, setGraceDraft] = useState<string | undefined>();

  const frequency = frequencyDraft ?? rule?.frequency ?? 'daily';
  const weekdays = weekdaysDraft ?? (rule?.weekdays as number[] | null) ?? [];
  const monthDays = monthDaysDraft ?? (rule?.month_days as number[] | null) ?? [];
  const customDates = customDatesDraft ?? (rule?.custom_dates as string[] | null) ?? [];
  const repeatStart = startDraft ?? rule?.repeat_start_date ?? '';
  const repeatEnd = endDraft ?? rule?.repeat_end_date ?? '';
  const timeOfDay = timeDraft ?? (rule?.time_of_day ?? '').slice(0, 5);
  const missedRule = missedDraft ?? rule?.missed_rule ?? 'strict';
  const gracePeriod =
    graceDraft ?? (rule?.grace_period_minutes != null ? String(rule.grace_period_minutes) : '');

  function toggleWeekday(d: number) {
    const next = weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d];
    setWeekdaysDraft(next);
  }

  const mutation = useMutation({
    mutationFn: (input: RepeatRuleInput) => setRepeatRule(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repeat-rule', id] });
      qc.invalidateQueries({ queryKey: ['action-plan', id] });
      qc.invalidateQueries({ queryKey: ['repeat-rules', 'all'] });
    },
  });

  async function submit() {
    if (!repeatStart || !repeatEnd) {
      alertFriendlyError('Belum lengkap', null, 'Periode repeat (mulai + selesai) wajib diisi.');
      return;
    }
    if (!timeOfDay) {
      alertFriendlyError('Belum lengkap', null, 'Jam eksekusi harian wajib diisi.');
      return;
    }

    const input: RepeatRuleInput = {
      frequency,
      weekdays: frequency === 'weekly' ? weekdays : null,
      monthDays: frequency === 'monthly' ? monthDays : null,
      customDates: frequency === 'custom' ? customDates : null,
      repeatStartDate: repeatStart,
      repeatEndDate: repeatEnd,
      timeOfDay,
      missedRule,
      gracePeriodMinutes:
        missedRule === 'grace_period' ? parseInt(gracePeriod, 10) || null : null,
    };

    try {
      await mutation.mutateAsync(input);
      router.back();
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Perubahan tidak tersimpan. Coba lagi.');
    }
  }

  const loading = taskQ.isLoading || ruleQ.isLoading || instancesQ.isLoading;
  const anyError = taskQ.isError || ruleQ.isError || instancesQ.isError;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-black"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Ubah Jadwal Repeat' }} />
      <View className="gap-4 p-5">
        {loading ? (
          <SkeletonList count={3} />
        ) : anyError ? (
          <ErrorState
            onRetry={() => {
              taskQ.refetch();
              ruleQ.refetch();
              instancesQ.refetch();
            }}
          />
        ) : !task ? (
          <EmptyState
            title="Tugas tidak ditemukan"
            description="Tugas ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : task.repeat_setting !== 'repeat' || !rule ? (
          <EmptyState
            title="Bukan Tugas repeat"
            description="Layar ini hanya untuk Tugas yang punya jadwal berulang. Tugas one-time tak punya rule untuk diubah."
          />
        ) : (
          <>
            <View className="gap-1">
              <Badge label={locked ? 'Terkunci' : 'Bisa diubah'} tone={locked ? 'warn' : 'info'} />
              <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">
                Ubah Jadwal Repeat
              </Text>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400" numberOfLines={2}>
                {task.name}
              </Text>
            </View>

            {locked ? (
              <GuidanceNote
                title="Jadwal terkunci setelah instance dibuat"
                body="Tugas ini sudah punya instance ter-generate (jadwal sudah berjalan). Mengubah frekuensi/tanggal/jam sekarang akan membuat compliance historis tidak konsisten dengan jadwalnya. Bila jadwal benar-benar perlu berubah, arsipkan Tugas ini lalu buat Tugas baru dengan jadwal yang benar."
              />
            ) : null}

            <SectionCard>
              {locked ? (
                <>
                  <Field label="Frekuensi" value={FREQUENCY_LABEL[rule.frequency] ?? rule.frequency} />
                  <Field
                    label="Periode Repeat"
                    value={`${rule.repeat_start_date} → ${rule.repeat_end_date}`}
                  />
                  <Field label="Jam Eksekusi" value={(rule.time_of_day ?? '').slice(0, 5) || '—'} />
                  <Field
                    label="Aturan Terlewat"
                    value={MISSED_RULE_LABEL[rule.missed_rule] ?? rule.missed_rule}
                  />
                  {rule.grace_period_minutes != null ? (
                    <Field
                      label="Masa Tenggang (menit)"
                      value={String(rule.grace_period_minutes)}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <ChipSelector
                    label="Frekuensi"
                    options={FREQUENCIES.map((f) => ({ key: f, label: FREQUENCY_LABEL[f] }))}
                    value={frequency}
                    onChange={setFrequencyDraft}
                  />

                  {frequency === 'weekly' ? (
                    <View className="gap-1.5">
                      <Text className="text-sm font-semibold text-black dark:text-white">
                        Hari (mingguan)
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {WEEKDAY_LABEL.map((lbl, d) => {
                          const active = weekdays.includes(d);
                          return (
                            <Pressable
                              key={d}
                              className={`min-h-[44px] justify-center rounded-full border px-3 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
                              onPress={() => toggleWeekday(d)}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: active }}
                              accessibilityLabel={`Hari ${lbl}`}>
                              <Text
                                className={active ? 'text-sm font-semibold text-white' : 'text-sm text-black dark:text-white'}>
                                {lbl}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {frequency === 'monthly' ? (
                    <MonthDaysPicker
                      label="Tanggal dalam bulan"
                      value={monthDays}
                      onChange={setMonthDaysDraft}
                    />
                  ) : null}

                  {frequency === 'custom' ? (
                    <DateMultiField
                      label="Tanggal kustom"
                      values={customDates}
                      onChange={setCustomDatesDraft}
                    />
                  ) : null}

                  <DateRangeField
                    startLabel="Mulai Repeat"
                    endLabel="Selesai Repeat"
                    startValue={repeatStart}
                    endValue={repeatEnd}
                    onStartChange={setStartDraft}
                    onEndChange={setEndDraft}
                    required
                  />

                  <TimeField
                    label="Jam Eksekusi Harian"
                    value={timeOfDay}
                    onChange={setTimeDraft}
                    required
                  />

                  <ChipSelector
                    label="Aturan Terlewat"
                    options={MISSED_RULES.map((m) => ({ key: m, label: MISSED_RULE_LABEL[m] }))}
                    value={missedRule}
                    onChange={setMissedDraft}
                  />

                  {missedRule === 'grace_period' ? (
                    <LabeledInput
                      label="Masa Tenggang (menit)"
                      value={gracePeriod}
                      onChangeText={setGraceDraft}
                      keyboardType="numeric"
                      placeholder="mis. 30"
                    />
                  ) : null}
                </>
              )}
            </SectionCard>

            {!locked ? (
              <Button
                label="Simpan perubahan"
                onPress={submit}
                loading={mutation.isPending}
              />
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function EditRepeatRuleRoute() {
  return <LiveEditRepeatRuleScreen />;
}
