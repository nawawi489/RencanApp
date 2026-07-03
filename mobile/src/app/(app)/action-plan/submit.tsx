// UI-S-AP5 + UI-S-AP6 — submit Action Plan dgn file upload + KPI Area linkage.
// 2-phase commit (createSubmissionDraft → upload parallel → submit_action_plan) via useSubmissionFlow.
// Mode instance (repeat) tetap pakai jalur lama submitInstance (OUT OF SCOPE OD-3).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import {
  AttachmentRow,
  Button,
  DeltaArrow,
  GuidanceNote,
  ImpactApprovalCard,
  KpiLinkageCard,
  LabeledInput,
  UploadButton,
  usePlaceholderColor,
  type UploadState,
} from '@/components/ui';
import { useKpiCandidates, useKpiCurrentValue, useSubmissionFlow } from '@/hooks/use-submission';
import {
  EVIDENCE_KIND_LABEL,
  RESULT_VALUE_TYPE_LABEL,
  getActionPlan,
  type EvidenceInput,
  type ResultValueInput,
} from '@/lib/cards';
import { pickEvidenceFiles } from '@/lib/file-picker';
import { getInstance, submitInstance } from '@/lib/repeat';
import { classifyKind, type LocalFile } from '@/lib/storage';
import { StackScreenAdapter } from '@/prototype/adapters/stack-screen-adapter';
import PrototypeActionPlanSubmitScreen from '@/prototype/screens/action-plan-submit';

const EVIDENCE_KINDS = ['text_note', 'report', 'link_doc', 'link_gdrive', 'link_generic'] as const;
const VALUE_TYPES = ['number', 'currency', 'percentage', 'boolean', 'text', 'link'] as const;

type EvidenceRow = { kind: string; content: string };
type ResultRow = { kpi_area_id: string | null; label: string; value_type: string; value_text: string };

function isLinkKind(kind: string) {
  return kind === 'link_doc' || kind === 'link_gdrive' || kind === 'link_generic';
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
            accessibilityLabel={labels[opt] ?? opt}
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

function KpiResultRow({
  row,
  candidates,
  onChange,
  onRemove,
}: {
  row: ResultRow;
  candidates: { id: string; name: string }[];
  onChange: (next: ResultRow) => void;
  onRemove: () => void;
}) {
  const placeholderColor = usePlaceholderColor();
  const selectedKpi = candidates.find((c) => c.id === row.kpi_area_id) ?? null;
  const proposed = parseFloat(row.value_text);
  const proposedValid = !Number.isNaN(proposed);
  const { value: currentSnapshot } = useKpiCurrentValue(row.kpi_area_id);
  const previousNum = currentSnapshot?.numeric_total ?? null;

  return (
    <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      {/* KPI picker (auto-select bila hanya 1 kandidat). */}
      {candidates.length > 1 ? (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-neutral-500">Pilih KPI Area</Text>
          <View className="flex-row flex-wrap gap-2">
            {candidates.map((c) => {
              const active = row.kpi_area_id === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih ${c.name}`}
                  className={`min-h-[44px] items-center justify-center rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
                  onPress={() => onChange({ ...row, kpi_area_id: c.id })}>
                  <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs text-black dark:text-white'}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {selectedKpi ? (
        <KpiLinkageCard kpiName={selectedKpi.name} sourceLabel="Sumber: Action Plan ini" />
      ) : null}

      <TextInput
        className="rounded-xl border border-neutral-300 px-4 py-2.5 text-base text-black dark:border-neutral-700 dark:text-white"
        placeholder="Label (mis. Jumlah konten)"
        placeholderTextColor={placeholderColor}
        value={row.label}
        onChangeText={(label) => onChange({ ...row, label })}
      />
      <Chips
        options={VALUE_TYPES}
        value={row.value_type}
        labels={RESULT_VALUE_TYPE_LABEL}
        onChange={(value_type) => onChange({ ...row, value_type })}
      />
      <TextInput
        className="rounded-xl border border-neutral-300 px-4 py-2.5 text-base text-black dark:border-neutral-700 dark:text-white"
        placeholder="Nilai baru (mis. 145)"
        placeholderTextColor={placeholderColor}
        value={row.value_text}
        onChangeText={(value_text) => onChange({ ...row, value_text })}
      />

      {selectedKpi && proposedValid ? (
        <DeltaArrow previous={previousNum} proposed={proposed} />
      ) : null}
      {selectedKpi && proposedValid ? (
        <ImpactApprovalCard kpiName={selectedKpi.name} proposed={proposed} />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hapus nilai hasil"
        className="min-h-[44px] items-center justify-center self-end px-3 active:opacity-60"
        onPress={onRemove}>
        <Text className="text-sm text-red-600 dark:text-red-400">Hapus</Text>
      </Pressable>
    </View>
  );
}

export function LiveActionPlanSubmitScreen() {
  const { id, instanceId } = useLocalSearchParams<{ id?: string; instanceId?: string }>();
  const router = useRouter();
  const qc = useQueryClient();

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

  const { candidates } = useKpiCandidates(instanceId ? undefined : id);

  // Auto-select bila hanya 1 kandidat; tampilkan section bila >=1; hide bila 0 (OD-1).
  const autoKpiId = candidates.length === 1 ? candidates[0].id : null;

  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<EvidenceRow[]>([{ kind: 'text_note', content: '' }]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [pendingFiles, setPendingFiles] = useState<LocalFile[]>([]);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});

  const placeholderColor = usePlaceholderColor();
  const submissionFlow = useSubmissionFlow(id);

  const instanceMutation = useMutation({
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
          kpi_area_id: r.kpi_area_id ?? autoKpiId,
          label: r.label.trim() || null,
          value_type: r.value_type,
          value_text: r.value_text.trim() || null,
          value_numeric: parseFloat(r.value_text) || null,
        }));
      const noteVal = note.trim() || null;
      return submitInstance({ instanceId: instanceId!, note: noteVal, evidence: ev, resultValues: rv });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', apId] });
      qc.invalidateQueries({ queryKey: ['submissions', apId] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['repeat-instances', apId] });
      qc.invalidateQueries({ queryKey: ['repeat-compliance', apId] });
      qc.invalidateQueries({ queryKey: ['instance', instanceId] });
      router.back();
    },
    onError: (e) => Alert.alert('Gagal submit', e instanceof Error ? e.message : 'Terjadi kesalahan.'),
  });

  async function pickFiles() {
    try {
      const picked = await pickEvidenceFiles({ max: 5 - pendingFiles.length });
      if (picked.length === 0) return;
      setPendingFiles((prev) => [...prev, ...picked].slice(0, 5));
      const newStates = picked.reduce<Record<string, UploadState>>((acc, f) => {
        acc[f.uri] = 'ready';
        return acc;
      }, {});
      setUploadStates((prev) => ({ ...prev, ...newStates }));
    } catch (e) {
      Alert.alert('Tidak bisa memilih file', e instanceof Error ? e.message : 'Coba lagi.');
    }
  }

  function removeFile(uri: string) {
    setPendingFiles((prev) => prev.filter((f) => f.uri !== uri));
    setUploadStates((prev) => {
      const next = { ...prev };
      delete next[uri];
      return next;
    });
  }

  async function submitActionPlanFlow() {
    if (!ap || !id) return;
    const staticEvidence: EvidenceInput[] = evidence
      .filter((e) => e.content.trim())
      .map((e) => ({
        kind: e.kind,
        text_content: isLinkKind(e.kind) ? null : e.content.trim(),
        url: isLinkKind(e.kind) ? e.content.trim() : null,
      }));
    const resultValues: ResultValueInput[] = results
      .filter((r) => r.value_text.trim() || r.label.trim())
      .map((r) => ({
        kpi_area_id: r.kpi_area_id ?? autoKpiId,
        label: r.label.trim() || null,
        value_type: r.value_type,
        value_text: r.value_text.trim() || null,
        value_numeric: parseFloat(r.value_text) || null,
      }));
    const noteVal = note.trim() || null;

    if (ap.evidence_required && staticEvidence.length === 0 && pendingFiles.length === 0) {
      Alert.alert('Bukti wajib', 'Lampirkan minimal satu bukti sebelum submit.');
      return;
    }

    // Set semua upload ke 'uploading' (UX state machine).
    setUploadStates((prev) => {
      const next: Record<string, UploadState> = { ...prev };
      pendingFiles.forEach((f) => (next[f.uri] = 'uploading'));
      return next;
    });

    try {
      await submissionFlow.runSubmission({
        orgId: ap.organization_id,
        pendingFiles,
        staticEvidence,
        resultValues,
        note: noteVal,
      });
      // Tandai semua OK
      setUploadStates((prev) => {
        const next: Record<string, UploadState> = { ...prev };
        pendingFiles.forEach((f) => (next[f.uri] = 'ok'));
        return next;
      });
      router.back();
    } catch (e) {
      setUploadStates((prev) => {
        const next: Record<string, UploadState> = { ...prev };
        pendingFiles.forEach((f) => (next[f.uri] = 'failed'));
        return next;
      });
      Alert.alert('Gagal submit', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  const isSubmitting = instanceId ? instanceMutation.isPending : submissionFlow.isSubmitting;

  if (apQ.isLoading || !ap) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 dark:bg-black">
        <ActivityIndicator />
      </View>
    );
  }

  const showResultSection = !instanceId && candidates.length > 0; // OD-1 fallback: hide saat 0

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-5 p-5">
        <GuidanceNote
          title="Submit = Bukti + Nilai Hasil"
          body="Bukti menjawab 'apakah pekerjaan dilakukan?'. Nilai Hasil menjawab 'apa hasilnya?'. Setelah dikirim, bukti terkunci sebagai versi; revisi membuat versi baru."
        />

        <LabeledInput
          label="Catatan submission"
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Ringkasan singkat (opsional)"
        />

        {/* Bukti */}
        <View className="gap-3">
          <Text className="text-base font-bold text-black dark:text-white">
            Bukti{ap.evidence_required ? <Text className="text-red-500"> *</Text> : null}
          </Text>

          {/* File upload (AP5) — hanya untuk mode action_plan (instance mode pakai jalur lama). */}
          {!instanceId ? (
            <>
              <UploadButton onPress={pickFiles} count={pendingFiles.length} max={5} disabled={isSubmitting} />
              {pendingFiles.map((f) => {
                const kind = classifyKind(f.mimeType);
                return (
                  <AttachmentRow
                    key={f.uri}
                    fileName={f.name}
                    sizeBytes={f.size}
                    kind={kind}
                    kindLabel={EVIDENCE_KIND_LABEL[kind] ?? kind}
                    uploadState={uploadStates[f.uri] ?? 'ready'}
                    onRemove={() => removeFile(f.uri)}
                  />
                );
              })}
            </>
          ) : null}

          {/* Text/link rows (legacy + ER-9 link_generic). */}
          {evidence.map((row, i) => (
            <View
              key={i}
              className="gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
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
                placeholderTextColor={placeholderColor}
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
                  <Text className="text-sm text-red-600 dark:text-red-400">Hapus</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tambah bukti teks atau link"
            className="min-h-[44px] items-center justify-center self-start px-3 active:opacity-60"
            onPress={() => setEvidence((prev) => [...prev, { kind: 'text_note', content: '' }])}>
            <Text className="text-sm font-semibold text-brand-dark">+ Tambah bukti teks/link</Text>
          </Pressable>
        </View>

        {/* Nilai Hasil — hidden bila tidak ada kandidat KPI (OD-1 Fase 1 fallback). */}
        {showResultSection ? (
          <View className="gap-3">
            <Text className="text-base font-bold text-black dark:text-white">
              Nilai Hasil{ap.result_value_required ? <Text className="text-red-500"> *</Text> : null}
            </Text>
            {results.map((row, i) => (
              <KpiResultRow
                key={i}
                row={row}
                candidates={candidates}
                onChange={(next) => setResults((prev) => prev.map((r, idx) => (idx === i ? next : r)))}
                onRemove={() => setResults((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tambah Nilai Hasil"
              className="min-h-[44px] items-center justify-center self-start px-3 active:opacity-60"
              onPress={() =>
                setResults((prev) => [
                  ...prev,
                  { kpi_area_id: autoKpiId, label: '', value_type: 'number', value_text: '' },
                ])
              }>
              <Text className="text-sm font-semibold text-brand-dark">+ Tambah Nilai Hasil</Text>
            </Pressable>
          </View>
        ) : null}

        <Button
          label="Submit untuk Review"
          onPress={instanceId ? () => instanceMutation.mutate() : submitActionPlanFlow}
          loading={isSubmitting}
        />
      </View>
    </ScrollView>
  );
}

export default function ActionPlanSubmitRoute() {
  return <StackScreenAdapter live={LiveActionPlanSubmitScreen} prototype={PrototypeActionPlanSubmitScreen} />;
}
