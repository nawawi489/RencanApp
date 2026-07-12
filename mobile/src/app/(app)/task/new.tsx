import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { PRIORITY_LABEL, createTask, getActionPlan, type PersonRef } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';
import { DATE_HINT, DATE_RE } from '@/lib/date';
import { FREQUENCY_LABEL, MISSED_RULE_LABEL, setRepeatRule } from '@/lib/repeat';
type Person = NonNullable<PersonRef>;

const TIME_RE = /^\d{2}:\d{2}$/;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'custom'] as const;
const MISSED_RULES = ['strict', 'grace_period', 'overdue_allowed'] as const;
const WEEKDAY_LABEL = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function PrioritySelector({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">
        Prioritas<Text className="text-red-600 dark:text-red-400"> *</Text>
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PRIORITIES.map((p) => {
          const active = value === p;
          return (
            <Pressable
              key={p}
              className={`min-h-[44px] justify-center rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
              onPress={() => onChange(p)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Prioritas ${PRIORITY_LABEL[p]}`}>
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
      <Text className="text-sm font-semibold text-black dark:text-white">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.key;
          return (
            <Pressable
              key={o.key}
              testID={testIDPrefix ? `${testIDPrefix}-${o.key}` : undefined}
              className={`min-h-[44px] justify-center rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
              onPress={() => onChange(o.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${o.label}`}>
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
        <Text className="text-sm font-semibold text-black dark:text-white">{label}</Text>
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} accessibilityLabel={label} />
    </View>
  );
}

export function LiveNewTaskScreen() {
  const { actionPlanId } = useLocalSearchParams<{ actionPlanId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  // UI-S-AP4 context-bar — tampilkan parent Rencana Aksi supaya PIC tahu "AP ini di bawah apa".
  const parentActionPlanQ = useQuery({
    queryKey: ['action_plan', actionPlanId],
    queryFn: () => getActionPlan(actionPlanId),
    enabled: !!actionPlanId,
  });

  const [name, setName] = useState('');
  const [pic, setPic] = useState<Person | null>(null);
  const [reviewer, setReviewer] = useState<Person | null>(null);
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  // PRD §22.9 — "Jam Deadline" wajib semua AP (HH:MM, 24h).
  const [deadlineTime, setDeadlineTime] = useState('');
  const [output, setOutput] = useState('');
  const [dod, setDod] = useState('');
  // PRD §22.5 "Bukti yang diminta" — deskripsi (bukan hanya toggle wajib).
  const [evidenceDescription, setEvidenceDescription] = useState('');
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
  // Jam deadline tunggal di top-level (PRD §22.9); state repeat-specific "timeOfDay" dihapus —
  // pakai deadlineTime yang sama agar Jam tetap konsisten antara one-time & repeat.
  const [missedRule, setMissedRule] = useState<string>('strict');
  const [gracePeriod, setGracePeriod] = useState('');

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const ap = await createTask({
        action_plan_id: actionPlanId,
        name: name.trim(),
        pic_id: pic?.id ?? null,
        reviewer_id: reviewer?.id ?? null,
        start_date: startDate || null,
        deadline: deadline || null,
        deadline_time: deadlineTime || null,
        expected_output: output.trim() || null,
        definition_of_done: dod.trim() || null,
        evidence_description: evidenceDescription.trim() || null,
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
          timeOfDay: deadlineTime,
          missedRule,
          gracePeriodMinutes: missedRule === 'grace_period' ? parseInt(gracePeriod, 10) || null : null,
        });
      }
      return ap;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans', actionPlanId] });
      router.back();
    },
    onError: (e) => alertFriendlyError('Gagal', e, 'Terjadi kesalahan.'),
  });

  function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Tugas wajib diisi.');
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
    // PRD §22.9 — Jam Deadline wajib semua AP.
    if (!TIME_RE.test(deadlineTime)) {
      Alert.alert('Jam Deadline tidak valid', 'Format jam: HH:MM (mis. 23:00).');
      return;
    }
    if (repeat) {
      if (!DATE_RE.test(repeatStart) || !DATE_RE.test(repeatEnd)) {
        Alert.alert('Periode repeat tidak valid', `Tanggal mulai & selesai wajib. ${DATE_HINT}`);
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
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        {parentActionPlanQ.data ? (
          <View
            accessible
            accessibilityLabel={`Tugas di bawah Rencana Aksi ${parentActionPlanQ.data.name}`}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="text-[11px] font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              Rencana Aksi induk
            </Text>
            <Text className="text-sm font-semibold text-black dark:text-white">
              {parentActionPlanQ.data.name}
            </Text>
          </View>
        ) : null}

        <GuidanceNote
          title="Tugas — Siapa melakukan apa & kapan"
          body="Unit eksekusi paling konkret. PIC (eksekutor) & Reviewer wajib dan harus berbeda. Card disimpan Draft; aktifkan setelah semua field wajib terisi."
        />

        <SectionCard>
          <Text className="text-sm font-bold text-black dark:text-white">Detail Tugas</Text>
          <LabeledInput label="Nama Tugas" value={name} onChangeText={setName} required placeholder="mis. Buat 20 Konten Iklan" />
          <UserPicker label="PIC (eksekutor)" required value={pic} onChange={setPic} excludeId={reviewer?.id} />
          <UserPicker label="Reviewer" required value={reviewer} onChange={setReviewer} excludeId={pic?.id} />
          <DateField label="Tanggal Mulai" value={startDate} onChange={setStartDate} />
          <DateField label="Deadline" value={deadline} onChange={setDeadline} />
          <LabeledInput
            label="Jam Deadline"
            value={deadlineTime}
            onChangeText={setDeadlineTime}
            required
            placeholder="HH:MM (mis. 23:00)"
            keyboardType="numeric"
          />
          <LabeledInput label="Output yang Diharapkan" value={output} onChangeText={setOutput} multiline placeholder="Hasil konkret yang diharapkan" />
          <LabeledInput label="Definition of Done" value={dod} onChangeText={setDod} multiline placeholder="Kriteria pekerjaan dianggap selesai" />
          <LabeledInput
            label="Bukti yang Diminta"
            value={evidenceDescription}
            onChangeText={setEvidenceDescription}
            multiline
            placeholder="mis. screenshot dashboard, link rekaman, file PDF laporan"
          />
          <PrioritySelector value={priority} onChange={setPriority} />
        </SectionCard>

        <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
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

        {/* ---- Repeat (Tugas berulang) ---- */}
        <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
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
                  <Text className="text-sm font-semibold text-black dark:text-white">Hari (mingguan)</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {WEEKDAY_LABEL.map((lbl, d) => {
                      const active = weekdays.includes(d);
                      return (
                        <Pressable
                          key={d}
                          testID={`weekday-${d}`}
                          className={`min-h-[44px] justify-center rounded-full border px-3 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
                          onPress={() => toggleWeekday(d)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: active }}
                          accessibilityLabel={`Hari ${lbl}`}>
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

              <DateField label="Mulai Repeat" value={repeatStart} onChange={setRepeatStart} required />
              <DateField label="Selesai Repeat" value={repeatEnd} onChange={setRepeatEnd} required />
              {/* Jam Deadline diambil dari field top-level (PRD §22.9 — tunggal). */}

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

export default function NewTaskRoute() {
  return <LiveNewTaskScreen />;
}
