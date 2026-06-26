import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput } from '@/components/ui';
import {
  EVIDENCE_KIND_LABEL,
  RESULT_VALUE_TYPE_LABEL,
  getActionPlan,
  submitActionPlan,
  type EvidenceInput,
  type ResultValueInput,
} from '@/lib/cards';
import { getInstance, submitInstance } from '@/lib/repeat';

// Jenis bukti yang didukung form Fase 1 (catatan & link). Upload file menyusul (skema & bucket sudah siap).
const EVIDENCE_KINDS = ['text_note', 'report', 'link_doc', 'link_gdrive'] as const;
const VALUE_TYPES = ['number', 'currency', 'percentage', 'boolean', 'text', 'link'] as const;

type EvidenceRow = { kind: string; content: string };
type ResultRow = { label: string; value_type: string; value_text: string };

function isLinkKind(kind: string) {
  return kind === 'link_doc' || kind === 'link_gdrive';
}

function Chips({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            className={`min-h-[44px] items-center justify-center rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
            onPress={() => onChange(opt)}>
            <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs text-black dark:text-white'}>
              {labels[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SubmitScreen() {
  const { id, instanceId } = useLocalSearchParams<{ id?: string; instanceId?: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  // Mode instance (repeat): ambil instance untuk tahu action_plan_id parent (sumber flag wajib).
  const instanceQ = useQuery({
    queryKey: ['instance', instanceId],
    queryFn: () => getInstance(instanceId!),
    enabled: !!instanceId,
  });
  const apId = instanceId ? instanceQ.data?.action_plan_id : id;
  const apQ = useQuery({
    queryKey: ['action-plan', apId],
    queryFn: () => getActionPlan(apId!),
    enabled: !!apId,
  });
  const ap = apQ.data;

  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<EvidenceRow[]>([{ kind: 'text_note', content: '' }]);
  const [results, setResults] = useState<ResultRow[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const ev: EvidenceInput[] = evidence
        .filter((e) => e.content.trim())
        .map((e) => ({
          kind: e.kind,
          text_content: isLinkKind(e.kind) ? null : e.content.trim(),
          url: isLinkKind(e.kind) ? e.content.trim() : null,
        }));
      const rv: ResultValueInput[] = results
        .filter((r) => r.value_text.trim() || r.label.trim())
        .map((r) => ({
          label: r.label.trim() || null,
          value_type: r.value_type,
          value_text: r.value_text.trim() || null,
        }));
      const noteVal = note.trim() || null;
      return instanceId
        ? submitInstance({ instanceId, note: noteVal, evidence: ev, resultValues: rv })
        : submitActionPlan({ actionPlanId: id!, note: noteVal, evidence: ev, resultValues: rv });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', apId] });
      qc.invalidateQueries({ queryKey: ['submissions', apId] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      if (instanceId) {
        qc.invalidateQueries({ queryKey: ['repeat-instances', apId] });
        qc.invalidateQueries({ queryKey: ['repeat-compliance', apId] });
        qc.invalidateQueries({ queryKey: ['instance', instanceId] });
      }
      router.back();
    },
    onError: (e) => Alert.alert('Gagal submit', e instanceof Error ? e.message : 'Terjadi kesalahan.'),
  });

  function submit() {
    if (ap?.evidence_required && !evidence.some((e) => e.content.trim())) {
      Alert.alert('Bukti wajib', 'Lampirkan minimal satu bukti sebelum submit.');
      return;
    }
    if (ap?.result_value_required && !results.some((r) => r.value_text.trim())) {
      Alert.alert('Nilai Hasil wajib', 'Isi minimal satu Nilai Hasil sebelum submit.');
      return;
    }
    mutation.mutate();
  }

  if (apQ.isLoading || !ap) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 dark:bg-black">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-5 p-5">
        <GuidanceNote
          title="Submit = Bukti + Nilai Hasil"
          body="Bukti menjawab 'apakah pekerjaan dilakukan?'. Nilai Hasil menjawab 'apa hasilnya?'. Setelah dikirim, bukti terkunci sebagai versi; revisi membuat versi baru."
        />

        <LabeledInput label="Catatan submission" value={note} onChangeText={setNote} multiline placeholder="Ringkasan singkat (opsional)" />

        {/* Bukti */}
        <View className="gap-3">
          <Text className="text-base font-bold text-black dark:text-white">
            Bukti{ap.evidence_required ? <Text className="text-red-500"> *</Text> : null}
          </Text>
          {evidence.map((row, i) => (
            <View key={i} className="gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <Chips
                options={EVIDENCE_KINDS}
                value={row.kind}
                labels={EVIDENCE_KIND_LABEL}
                onChange={(kind) =>
                  setEvidence((prev) => prev.map((r, idx) => (idx === i ? { ...r, kind } : r)))
                }
              />
              <TextInput
                className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
                placeholder={isLinkKind(row.kind) ? 'https://…' : 'Tulis catatan / rekap…'}
                placeholderTextColor="#9ca3af"
                autoCapitalize={isLinkKind(row.kind) ? 'none' : 'sentences'}
                value={row.content}
                onChangeText={(content) =>
                  setEvidence((prev) => prev.map((r, idx) => (idx === i ? { ...r, content } : r)))
                }
              />
              {evidence.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Hapus bukti"
                  className="min-h-[44px] items-center justify-center self-end px-3 active:opacity-60"
                  onPress={() => setEvidence((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Text className="text-sm text-red-500">Hapus</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center self-start px-3 active:opacity-60"
            onPress={() => setEvidence((prev) => [...prev, { kind: 'text_note', content: '' }])}>
            <Text className="text-sm font-semibold text-brand-dark">+ Tambah bukti</Text>
          </Pressable>
        </View>

        {/* Nilai Hasil */}
        <View className="gap-3">
          <Text className="text-base font-bold text-black dark:text-white">
            Nilai Hasil{ap.result_value_required ? <Text className="text-red-500"> *</Text> : null}
          </Text>
          {results.map((row, i) => (
            <View key={i} className="gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <TextInput
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-base text-black dark:border-neutral-700 dark:text-white"
                placeholder="Label (mis. Jumlah konten)"
                placeholderTextColor="#9ca3af"
                value={row.label}
                onChangeText={(label) =>
                  setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, label } : r)))
                }
              />
              <Chips
                options={VALUE_TYPES}
                value={row.value_type}
                labels={RESULT_VALUE_TYPE_LABEL}
                onChange={(value_type) =>
                  setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, value_type } : r)))
                }
              />
              <TextInput
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-base text-black dark:border-neutral-700 dark:text-white"
                placeholder="Nilai (mis. 20)"
                placeholderTextColor="#9ca3af"
                value={row.value_text}
                onChangeText={(value_text) =>
                  setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, value_text } : r)))
                }
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hapus nilai hasil"
                className="min-h-[44px] items-center justify-center self-end px-3 active:opacity-60"
                onPress={() => setResults((prev) => prev.filter((_, idx) => idx !== i))}>
                <Text className="text-sm text-red-500">Hapus</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center self-start px-3 active:opacity-60"
            onPress={() => setResults((prev) => [...prev, { label: '', value_type: 'number', value_text: '' }])}>
            <Text className="text-sm font-semibold text-brand-dark">+ Tambah Nilai Hasil</Text>
          </Pressable>
        </View>

        <Button label="Submit untuk Review" onPress={submit} loading={mutation.isPending} />
      </View>
    </ScrollView>
  );
}
