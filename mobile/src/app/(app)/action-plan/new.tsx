import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { PRIORITY_LABEL, createActionPlan, type PersonRef } from '@/lib/cards';

type Person = NonNullable<PersonRef>;

const DATE_HINT = 'Format: YYYY-MM-DD';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

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

  const mutation = useMutation({
    mutationFn: createActionPlan,
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
    mutation.mutate({
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

        <Button label="Simpan sebagai Draft" onPress={submit} loading={mutation.isPending} />
      </View>
    </ScrollView>
  );
}
