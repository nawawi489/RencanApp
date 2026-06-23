import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { PRIORITY_LABEL, createActionPlan, type PersonRef } from '@/lib/cards';
import { FREQUENCY_LABEL, MISSED_RULE_LABEL, setRepeatRule } from '@/lib/repeat';

type Person = NonNullable<PersonRef>;

const DATE_HINT = 'Format: YYYY-MM-DD';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'custom'] as const;
const MISSED_RULES = ['strict', 'grace_period', 'overdue_allowed'] as const;
const WEEKDAY_LABEL = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function PrioritySelector({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">
        Prioritas<Text className="text-red-500"> *</Text>
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PRIORITIES.map((p) => {
          const active = value === p;
          return (
            <Pressable
              key={p}
              className={`rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand bg-brand' : 'border-neutral-300 dark:border-neutral-700'}`}
              onPress={() => onChange(p)}>
              <Text className={active ? 'text-sm font-semibold text-white' : 'text-sm text-black dark:text-white'}>
                {PRIORITY_LABEL[p]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ChipSelector({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  label: string;
  options: readonly { key: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
  testIDPrefix?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.key;
          return (
            <Pressable
              key={o.key}
              testID={testIDPrefix ? `${testIDPrefix}-${o.key}` : undefined}
              className={`rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand bg-brand' : 'border-neutral-300 dark:border-neutral-700'}`}
              onPress={() => onChange(o.key)}>
              <Text className={active ? 'text-sm font-semibold text-white' : 'text-sm text-black dark:text-white'}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-black dark:text-white">{label}</Text>
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

export default function NewActionPlanScreen() {
  const { initiativeId } = useLocalSearchParams<{ initiativeId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [pic, setPic] = useState<Person | null>(null);
  const [reviewer, setReviewer] = useState<Person | null>(null);
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [output, setOutput] = useState('');
  const [dod, setDod] = useState('');
  const [priority, setPriority] = useState<string | null>('medium');
  const [evidenceRequired, setEvidenceRequired] = useState(true);
  const [resultRequired, setResultRequired] = useState(false);

  // ---- Repeat (Fase 2) ----
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<string>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDays, setMonthDays] = useState('');
  const [customDates, setCustomDates] = useState('');
  const [repeatStart, setRepeatStart] = useState('');
  const [repeatEnd, setRepeatEnd] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');
  const [missedRule, setMissedRule] = useState<string>('strict');
  const [gracePeriod, setGracePeriod] = useState('');

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const ap = await createActionPlan({
        initiative_id: initiativeId,
        name: name.trim(),
        pic_id: pic?.id ?? null,
        reviewer_id: reviewer?.id ?? null,
        start_date: startDate || null,
        deadline: deadline || null,
        expected_output: output.trim() || null,
        definition_of_done: dod.trim() || null,
        priority,
        evidence_required: evidenceRequired,
        result_value_required: resultRequired,
      });
      if (repeat) {
        await setRepeatRule(ap.id, {
          frequency,
          weekdays: frequency === 'weekly' ? weekdays : null,
          monthDays:
            frequency === 'monthly'
              ? monthDays
                  .split(',')
                  .map((s) => parseInt(s.trim(), 10))
                  .filter((n) => Number.isFinite(n))
              : null,
          customDates:
            frequency === 'custom'
              ? customDates
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : null,
          repeatStartDate: repeatStart,
          repeatEndDate: repeatEnd,
          timeOfDay,
          missedRule,
          gracePeriodMinutes: missedRule === 'grace_period' ? parseInt(gracePeriod, 10) || null : null,
        });
      }
      return ap;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans', initiativeId] });
      router.back();
    },
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.'),
  });

  function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Action Plan wajib diisi.');
      return;
    }
    if (pic && reviewer && pic.id === reviewer.id) {
      Alert.alert('Tidak valid', 'PIC dan Reviewer tidak boleh orang yang sama.');
      return;
    }
    if ((startDate && !DATE_RE.test(startDate)) || (deadline && !DATE_RE.test(deadline))) {
      Alert.alert('Tanggal tidak valid', DATE_HINT);
      return;
    }
    if (repeat) {
      if (!DATE_RE.test(repeatStart) || !DATE_RE.test(repeatEnd)) {
        Alert.alert('Periode repeat tidak valid', `Tanggal mulai & selesai wajib. ${DATE_HINT}`);
        return;
      }
      if (!TIME_RE.test(timeOfDay)) {
        Alert.alert('Jam deadline tidak valid', 'Format jam: HH:MM (mis. 23:00).');
        return;
      }
      if (frequency === 'weekly' && weekdays.length === 0) {
        Alert.alert('Belum lengkap', 'Pilih minimal satu hari untuk repeat mingguan.');
        return;
      }
      if (missedRule === 'grace_period' && !(parseInt(gracePeriod, 10) > 0)) {
        Alert.alert('Belum lengkap', 'Masa tenggang (menit) wajib diisi > 0.');
        return;
      }
    }
    mutation.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Action Plan — Siapa melakukan apa & kapan"
          body="Unit eksekusi paling konkret. PIC (eksekutor) & Reviewer wajib dan harus berbeda. Card disimpan Draft; aktifkan setelah semua field wajib terisi."
        />

        <LabeledInput label="Nama Action Plan" value={name} onChangeText={setName} required placeholder="mis. Buat 20 Konten Iklan" />
        <UserPicker label="PIC (eksekutor)" required value={pic} onChange={setPic} excludeId={reviewer?.id} />
        <UserPicker label="Reviewer" required value={reviewer} onChange={setReviewer} excludeId={pic?.id} />
        <LabeledInput label="Tanggal Mulai" value={startDate} onChangeText={setStartDate} placeholder={DATE_HINT} keyboardType="numeric" />
        <LabeledInput label="Deadline" value={deadline} onChangeText={setDeadline} placeholder={DATE_HINT} keyboardType="numeric" />
        <LabeledInput label="Output yang Diharapkan" value={output} onChangeText={setOutput} multiline placeholder="Hasil konkret yang diharapkan" />
        <LabeledInput label="Definition of Done" value={dod} onChangeText={setDod} multiline placeholder="Kriteria pekerjaan dianggap selesai" />
        <PrioritySelector value={priority} onChange={setPriority} />

        <View className="gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
          <ToggleRow
            label="Wajib lampirkan Bukti"
            description="PIC tidak bisa submit tanpa bukti."
            value={evidenceRequired}
            onValueChange={setEvidenceRequired}
          />
          <ToggleRow
            label="Wajib isi Nilai Hasil"
            description="PIC harus melaporkan output terukur saat submit."
            value={resultRequired}
            onValueChange={setResultRequired}
          />
        </View>

        {/* ---- Repeat (Action Plan berulang) ---- */}
        <View className="gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-medium text-black dark:text-white">Jadikan Repeat (berulang)</Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Sistem membuat instance terjadwal otomatis (mis. tutup buku harian).
              </Text>
            </View>
            <Switch testID="repeat-toggle" value={repeat} onValueChange={setRepeat} />
          </View>

          {repeat ? (
            <View testID="repeat-config" className="gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <ChipSelector
                label="Frekuensi"
                testIDPrefix="frequency"
                options={FREQUENCIES.map((f) => ({ key: f, label: FREQUENCY_LABEL[f] }))}
                value={frequency}
                onChange={setFrequency}
              />

              {frequency === 'weekly' ? (
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-black dark:text-white">Hari (mingguan)</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {WEEKDAY_LABEL.map((lbl, d) => {
                      const active = weekdays.includes(d);
                      return (
                        <Pressable
                          key={d}
                          testID={`weekday-${d}`}
                          className={`rounded-full border px-3 py-2 active:opacity-70 ${active ? 'border-brand bg-brand' : 'border-neutral-300 dark:border-neutral-700'}`}
                          onPress={() => toggleWeekday(d)}>
                          <Text className={active ? 'text-sm font-semibold text-white' : 'text-sm text-black dark:text-white'}>
                            {lbl}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {frequency === 'monthly' ? (
                <LabeledInput
                  label="Tanggal dalam bulan (pisah koma, mis. 1,15)"
                  value={monthDays}
                  onChangeText={setMonthDays}
                  placeholder="1,15"
                  keyboardType="numeric"
                />
              ) : null}

              {frequency === 'custom' ? (
                <LabeledInput
                  label="Tanggal kustom (YYYY-MM-DD, pisah koma)"
                  value={customDates}
                  onChangeText={setCustomDates}
                  placeholder="2026-06-03,2026-06-10"
                />
              ) : null}

              <LabeledInput
                label="Mulai Repeat"
                value={repeatStart}
                onChangeText={setRepeatStart}
                required
                placeholder={DATE_HINT}
                keyboardType="numeric"
              />
              <LabeledInput
                label="Selesai Repeat"
                value={repeatEnd}
                onChangeText={setRepeatEnd}
                required
                placeholder={DATE_HINT}
                keyboardType="numeric"
              />
              <LabeledInput
                label="Jam Deadline"
                value={timeOfDay}
                onChangeText={setTimeOfDay}
                required
                placeholder="HH:MM (mis. 23:00)"
                keyboardType="numeric"
              />

              <ChipSelector
                label="Aturan Terlewat"
                testIDPrefix="missed-rule"
                options={MISSED_RULES.map((m) => ({ key: m, label: MISSED_RULE_LABEL[m] }))}
                value={missedRule}
                onChange={setMissedRule}
              />

              {missedRule === 'grace_period' ? (
                <View testID="grace-input">
                  <LabeledInput
                    label="Masa Tenggang (menit)"
                    value={gracePeriod}
                    onChangeText={setGracePeriod}
                    required
                    placeholder="mis. 30"
                    keyboardType="numeric"
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={mutation.isPending} />
      </View>
    </ScrollView>
  );
}
