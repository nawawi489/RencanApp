import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { ActivityLogPanel } from '@/components/activity-log-panel';
import { Badge, Button, Field, MetaGrid, ProgressOrb, SectionCard, SkeletonList } from '@/components/ui';
import { SubmissionCard } from '@/components/submission-card';
import { personLabel } from '@/components/user-picker';
import { useProfile } from '@/hooks/use-profile';
import { useInstanceActions, useRepeatInstances } from '@/hooks/use-repeat-instances';
import { computeActionPlanProgress } from '@/lib/progress';
import {
  ACTION_PLAN_STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_TONE,
  activateActionPlan,
  getActionPlan,
  listSubmissions,
  reviewSubmission,
  startActionPlan,
  type ActionPlanWithPeople,
  type SubmissionDetail,
} from '@/lib/cards';
import {
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  type InstanceWithSubmissions,
} from '@/lib/repeat';
import { StackScreenAdapter } from '@/prototype/adapters/stack-screen-adapter';
import PrototypeActionPlanDetailScreen from '@/prototype/screens/action-plan-detail';

// ---------- UI-S-AP1 — Panduan Selesai (checklist 5-langkah PIC journey) ----------
// Centang otomatis: Draft→0/5, Aktif/Assigned→1/5, In Progress→2/5, Submitted→3/5,
// Done→5/5 (4 langkah + approval). Revision → balik ke langkah 3 dengan note.
function GuidanceChecklist({
  ap,
  lastSubmission,
}: {
  ap: ActionPlanWithPeople;
  lastSubmission?: SubmissionDetail;
}) {
  const isRepeat = ap.repeat_setting === 'repeat';
  const hasSubmission = !!lastSubmission;
  const items: { label: string; checked: boolean; note?: string }[] = [
    {
      label: 'Pelajari brief, output yang diharapkan, dan Definition of Done',
      checked: ap.status !== 'draft',
    },
    {
      label: 'Aktifkan & ambil tanggung jawab (status Ditugaskan)',
      checked: !['draft'].includes(ap.status),
    },
    {
      label: 'Mulai kerjakan sesuai brief',
      checked: ['in_progress', 'submitted', 'done', 'revision'].includes(ap.status),
    },
    {
      label: ap.evidence_required
        ? 'Submit bukti + nilai hasil sebelum deadline'
        : 'Submit penyelesaian sebelum deadline',
      checked: ['submitted', 'done'].includes(ap.status) || hasSubmission,
      note:
        ap.status === 'revision'
          ? 'Reviewer menolak — submit ulang dengan perbaikan.'
          : undefined,
    },
    {
      label: 'Tunggu approval reviewer untuk menyelesaikan',
      checked: ap.status === 'done',
    },
  ];
  const doneCount = items.filter((i) => i.checked).length;
  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold text-black dark:text-white">Panduan Selesai</Text>
        <Badge label={`${doneCount}/${items.length}`} tone={doneCount === items.length ? 'success' : 'info'} />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        {isRepeat
          ? 'Untuk Action Plan repeat: tiap instance mengikuti langkah yang sama.'
          : 'Langkah berurutan dari Draft hingga disetujui reviewer.'}
      </Text>
      <View className="gap-2 pt-1">
        {items.map((it, i) => (
          <View key={i} className="flex-row items-start gap-2">
            <View
              className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${it.checked ? 'border-green-700 bg-green-700' : 'border-neutral-300 dark:border-neutral-700'}`}
              accessible
              accessibilityLabel={it.checked ? 'Selesai' : 'Belum selesai'}>
              {it.checked ? (
                <Text className="text-[10px] font-bold text-white">✓</Text>
              ) : null}
            </View>
            <View className="flex-1 gap-0.5">
              <Text
                className={`text-sm ${it.checked ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-black dark:text-white'}`}>
                {it.label}
              </Text>
              {it.note ? (
                <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">{it.note}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

// ---------- UI-S-AP2 — Gate & kendala (blokir-status derivasi field) ----------
// Setiap baris = satu syarat aktif/eksekusi. tone: success (ok) / warn (lemah) / danger (blocker).
type GateStatus = 'ok' | 'warn' | 'danger' | 'blocker';
function gateTone(s: GateStatus): 'success' | 'warn' | 'danger' {
  if (s === 'ok') return 'success';
  if (s === 'warn') return 'warn';
  return 'danger';
}
function gateLabel(s: GateStatus): string {
  if (s === 'ok') return 'OK';
  if (s === 'warn') return 'Perhatian';
  if (s === 'blocker') return 'Blokir';
  return 'Lewat';
}

function GateAndConstraints({
  ap,
  repeatConfigured,
}: {
  ap: ActionPlanWithPeople;
  repeatConfigured?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!ap.deadline && ap.deadline < today && ap.status !== 'done';
  const isRepeat = ap.repeat_setting === 'repeat';
  const items: { label: string; status: GateStatus; hint?: string }[] = [
    {
      label: 'PIC ditetapkan',
      status: ap.pic_id ? 'ok' : 'blocker',
      hint: ap.pic_id ? undefined : 'Wajib pilih PIC sebelum diaktifkan.',
    },
    {
      label: 'Reviewer ditetapkan & ≠ PIC',
      status:
        !ap.reviewer_id
          ? 'blocker'
          : ap.pic_id && ap.reviewer_id === ap.pic_id
            ? 'blocker'
            : 'ok',
      hint:
        !ap.reviewer_id
          ? 'Wajib pilih reviewer.'
          : ap.reviewer_id === ap.pic_id
            ? 'Reviewer tidak boleh sama dengan PIC (anti self-approval).'
            : undefined,
    },
    {
      label: 'Deadline diset',
      status: ap.deadline ? (overdue ? 'danger' : 'ok') : 'warn',
      hint: !ap.deadline
        ? 'Tanpa deadline, tidak ada sinyal urgensi.'
        : overdue
          ? `Lewat dari ${ap.deadline}.`
          : undefined,
    },
    {
      label: 'Output yang Diharapkan',
      status: ap.expected_output ? 'ok' : 'warn',
      hint: ap.expected_output ? undefined : 'PIC tidak tahu hasil konkret yang ditagih.',
    },
    {
      label: 'Definition of Done',
      status: ap.definition_of_done ? 'ok' : 'warn',
      hint: ap.definition_of_done ? undefined : 'Tanpa DoD, kriteria selesai ambigu.',
    },
    {
      label: ap.evidence_required ? 'Bukti wajib (sesuai aturan)' : 'Bukti opsional',
      status: ap.evidence_required ? 'ok' : 'warn',
      hint: ap.evidence_required ? undefined : 'Hasil sulit diaudit tanpa bukti.',
    },
  ];
  if (isRepeat) {
    items.push({
      label: 'Repeat rule terkonfigurasi',
      status: repeatConfigured ? 'ok' : 'blocker',
      hint: repeatConfigured ? undefined : 'Aktifkan card untuk membuat instance terjadwal.',
    });
  }
  const blockers = items.filter((i) => i.status === 'blocker').length;
  const warns = items.filter((i) => i.status !== 'ok' && i.status !== 'blocker').length;
  const summaryTone: 'success' | 'warn' | 'danger' =
    blockers > 0 ? 'danger' : warns > 0 ? 'warn' : 'success';
  const summary =
    blockers > 0
      ? `${blockers} blokir`
      : warns > 0
        ? `${warns} perhatian`
        : 'Tidak ada kendala';

  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold text-black dark:text-white">Gate & kendala</Text>
        <Badge label={summary} tone={summaryTone} />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Syarat aktivasi & eksekusi dari field card ini.
      </Text>
      <View className="gap-2 pt-1">
        {items.map((it, i) => (
          <View key={i} className="flex-row items-start gap-2">
            <View className="mt-0.5">
              <Badge label={gateLabel(it.status)} tone={gateTone(it.status)} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-sm text-black dark:text-white">{it.label}</Text>
              {it.hint ? (
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">{it.hint}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

function InstanceRow({
  inst,
  profileId,
  onSubmit,
  onOpen,
}: {
  inst: InstanceWithSubmissions;
  profileId: string | null;
  onSubmit: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const actions = useInstanceActions(inst, profileId);
  const time = (inst.instance_time ?? '').slice(0, 5);
  // Reviewer perlu jalan masuk ke detail untuk approve/reject (review tidak inline di sini).
  const needsReview = actions.canReview && inst.status === 'submitted';
  return (
    <SectionCard onPress={() => onOpen(inst.id)}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-black dark:text-white">{inst.instance_date}</Text>
        <Badge label={INSTANCE_STATUS_LABEL[inst.status] ?? inst.status} tone={INSTANCE_STATUS_TONE[inst.status]} />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">Deadline {time}</Text>
      {inst.status === 'missed' ? (
        <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
          Terlewat — deadline terlewati tanpa submit.
        </Text>
      ) : null}
      {needsReview ? (
        <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          Menunggu review Anda — buka detail untuk menyetujui/menolak.
        </Text>
      ) : null}
      {actions.canSubmit ? (
        <Button label="Submit Bukti & Nilai Hasil" onPress={() => onSubmit(inst.id)} />
      ) : (
        <Text className="text-xs text-neutral-400">Lihat detail & riwayat ›</Text>
      )}
    </SectionCard>
  );
}

function RepeatSection({
  actionPlanId,
  profileId,
  onSubmitInstance,
  onOpenInstance,
}: {
  actionPlanId: string;
  profileId: string | null;
  onSubmitInstance: (id: string) => void;
  onOpenInstance: (id: string) => void;
}) {
  const { instances, isLoading, compliance, compliancePercent } = useRepeatInstances(actionPlanId, {
    enabled: true,
  });
  const complianceText =
    compliancePercent === null || !compliance
      ? 'On-time: —'
      : `On-time: ${compliance.on_time_count}/${compliance.expected_count} (${compliancePercent}%)`;

  return (
    <View className="gap-3">
      <SectionCard>
        <Text className="text-xs font-semibold uppercase text-neutral-400">Repeat Compliance</Text>
        <Text testID="compliance-metric" className="text-lg font-bold text-black dark:text-white">
          {complianceText}
        </Text>
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          Compliance = instance selesai tepat waktu ÷ total seharusnya. Berbeda dari Progress & Capaian.
        </Text>
      </SectionCard>

      <Text className="text-lg font-bold text-black dark:text-white">Instance Terjadwal</Text>
      {isLoading ? (
        <ActivityIndicator />
      ) : instances.length > 0 ? (
        instances.map((inst) => (
          <InstanceRow
            key={inst.id}
            inst={inst}
            profileId={profileId}
            onSubmit={onSubmitInstance}
            onOpen={onOpenInstance}
          />
        ))
      ) : (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">
          Belum ada instance. Aktifkan Action Plan untuk membuat jadwal.
        </Text>
      )}
    </View>
  );
}

export function LiveActionPlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useProfile();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const apQ = useQuery({ queryKey: ['action-plan', id], queryFn: () => getActionPlan(id) });
  const subsQ = useQuery({ queryKey: ['submissions', id], queryFn: () => listSubmissions(id) });
  // Capaian header (UI-G-001): repeat → compliancePercent; one-time → status-based.
  const isRepeat = apQ.data?.repeat_setting === 'repeat';
  const { compliancePercent: headerCompliance } = useRepeatInstances(id, { enabled: !!isRepeat });

  useFocusEffect(
    useCallback(() => {
      apQ.refetch();
      subsQ.refetch();
    }, [apQ, subsQ]),
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ['action-plan', id] });
    qc.invalidateQueries({ queryKey: ['submissions', id] });
    qc.invalidateQueries({ queryKey: ['action-plans'] });
    // WSA-15 — perubahan status AP (activate/start/review→done) mengubah %done Initiative → orb refresh.
    qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
  }

  const activateM = useMutation({
    mutationFn: () => activateActionPlan(id),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Tidak bisa diaktifkan', e instanceof Error ? e.message : 'Kesalahan.'),
  });
  const startM = useMutation({
    mutationFn: () => startActionPlan(id),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Kesalahan.'),
  });
  const reviewM = useMutation({
    mutationFn: (args: { decision: 'approve' | 'reject'; reason: string | null }) =>
      reviewSubmission({ submissionId: ap!.current_submission_id!, decision: args.decision, reason: args.reason }),
    onSuccess: () => {
      setRejecting(false);
      setRejectReason('');
      refresh();
    },
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const ap = apQ.data;
  const isPic = !!profile && profile.id === ap?.pic_id;
  const isReviewer = !!profile && profile.id === ap?.reviewer_id;

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: ap?.name ?? 'Action Plan' }} />
      <View className="gap-5 p-5">
        {apQ.isLoading || !ap ? (
          <SkeletonList count={3} />
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Badge
                    label={ACTION_PLAN_STATUS_LABEL[ap.status] ?? ap.status}
                    tone={STATUS_TONE[ap.status]}
                  />
                  <Text className="text-2xl font-bold text-black dark:text-white">{ap.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={computeActionPlanProgress({
                    status: ap.status,
                    repeat: ap.repeat_setting === 'repeat',
                    compliancePercent: headerCompliance,
                  })}
                  sublabel={
                    ap.repeat_setting === 'repeat'
                      ? 'On-time compliance'
                      : (ACTION_PLAN_STATUS_LABEL[ap.status] ?? ap.status)
                  }
                />
              </View>
              <MetaGrid
                items={[
                  { label: 'PIC', value: ap.pic ? personLabel(ap.pic) : '—' },
                  { label: 'Reviewer', value: ap.reviewer ? personLabel(ap.reviewer) : '—' },
                  {
                    label: 'Deadline',
                    value: ap.deadline
                      ? `${ap.deadline}${ap.deadline_time ? ` · ${ap.deadline_time}` : ''}`
                      : '—',
                  },
                  { label: 'Mode', value: ap.repeat_setting === 'repeat' ? 'Repeat' : 'One Time' },
                ]}
              />
            </View>

            {/* UI-S-AP1 — Panduan Selesai (auto-derived dari status + submissions) */}
            <GuidanceChecklist ap={ap} lastSubmission={subsQ.data?.[0]} />

            {/* UI-S-AP2 — Gate & kendala (derivasi field card) */}
            <GateAndConstraints
              ap={ap}
              repeatConfigured={ap.repeat_setting === 'repeat' && ap.status !== 'draft'}
            />

            <SectionCard>
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-sm font-bold text-black dark:text-white">Brief Kerja</Text>
                {/* UI-S-AP3 — akses cepat ke Inbox dari konteks Action Plan. */}
                <Button
                  label="Buka Chat"
                  variant="secondary"
                  onPress={() => router.push('/(tabs)/inbox' as Href)}
                />
              </View>
              <Field label="Periode" value={`${ap.start_date ?? '—'} → ${ap.deadline ?? '—'}`} />
              {ap.priority ? <Field label="Prioritas" value={PRIORITY_LABEL[ap.priority] ?? ap.priority} /> : null}
              {ap.expected_output ? <Field label="Output yang Diharapkan" value={ap.expected_output} /> : null}
              {ap.definition_of_done ? <Field label="Definition of Done" value={ap.definition_of_done} /> : null}
              {ap.evidence_description ? (
                <Field label="Bukti yang Diminta" value={ap.evidence_description} />
              ) : null}
              <Field
                label="Aturan Submit"
                value={`Bukti ${ap.evidence_required ? 'wajib' : 'opsional'} · Nilai Hasil ${ap.result_value_required ? 'wajib' : 'opsional'}`}
              />
              {/* PRD §25 — PIC dapat mengajukan ubah deadline jika pekerjaan terhambat. */}
              {/* Tidak relevan untuk repeat (deadline ada di tiap instance) / draft / done. */}
              {ap.deadline &&
              isPic &&
              ap.repeat_setting !== 'repeat' &&
              (ap.status === 'assigned' ||
                ap.status === 'in_progress' ||
                ap.status === 'revision') ? (
                <Button
                  label="Ajukan Ubah Deadline"
                  variant="secondary"
                  onPress={() =>
                    router.push(
                      `/deadline-change-request?actionPlanId=${id}&oldDeadline=${ap.deadline}` as Href,
                    )
                  }
                />
              ) : null}
            </SectionCard>

            {/* ---- Aksi sesuai peran & status ---- */}
            {ap.status === 'draft' ? (
              <Button label="Aktifkan Action Plan" onPress={() => activateM.mutate()} loading={activateM.isPending} />
            ) : null}

            {/* ---- Repeat (Fase 2): compliance + daftar instance ---- */}
            {ap.repeat_setting === 'repeat' && ap.status !== 'draft' ? (
              <RepeatSection
                actionPlanId={id}
                profileId={profile?.id ?? null}
                onSubmitInstance={(instanceId) =>
                  router.push(`/action-plan/submit?instanceId=${instanceId}` as Href)
                }
                onOpenInstance={(instanceId) =>
                  router.push(`/action-plan/instance/${instanceId}` as Href)
                }
              />
            ) : null}

            {ap.repeat_setting !== 'repeat' && isPic && ap.status === 'assigned' ? (
              <View className="gap-2">
                <Button label="Mulai Kerjakan" onPress={() => startM.mutate()} loading={startM.isPending} />
                <Button
                  label="Submit Bukti & Nilai Hasil"
                  variant="secondary"
                  onPress={() => router.push(`/action-plan/submit?id=${id}` as Href)}
                />
              </View>
            ) : null}

            {ap.repeat_setting !== 'repeat' && isPic && (ap.status === 'in_progress' || ap.status === 'revision') ? (
              <Button
                label={ap.status === 'revision' ? 'Submit Ulang (Revisi)' : 'Submit Bukti & Nilai Hasil'}
                onPress={() => router.push(`/action-plan/submit?id=${id}` as Href)}
              />
            ) : null}

            {ap.status === 'submitted' && isReviewer ? (
              <View className="gap-2 rounded-2xl border border-amber-200 p-4 dark:border-amber-900">
                <Text className="text-sm font-semibold text-black dark:text-white">
                  Review submission terbaru
                </Text>
                {rejecting ? (
                  <View className="gap-2">
                    <TextInput
                      className="h-20 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
                      placeholder="Alasan penolakan (wajib)"
                      placeholderTextColor="#9ca3af"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                      multiline
                      textAlignVertical="top"
                    />
                    <Button
                      label="Kirim Penolakan"
                      variant="danger"
                      loading={reviewM.isPending}
                      onPress={() => {
                        if (!rejectReason.trim()) {
                          Alert.alert('Alasan wajib', 'Isi alasan penolakan terlebih dahulu.');
                          return;
                        }
                        reviewM.mutate({ decision: 'reject', reason: rejectReason.trim() });
                      }}
                    />
                    <Button label="Batal" variant="secondary" onPress={() => setRejecting(false)} />
                  </View>
                ) : (
                  <View className="gap-2">
                    <Button
                      label="Setujui (Selesai)"
                      variant="success"
                      loading={reviewM.isPending}
                      onPress={() => reviewM.mutate({ decision: 'approve', reason: null })}
                    />
                    <Button label="Tolak (Minta Revisi)" variant="danger" onPress={() => setRejecting(true)} />
                  </View>
                )}
              </View>
            ) : null}

            {ap.status === 'submitted' && isPic ? (
              <View className="rounded-2xl border border-amber-200 p-4 dark:border-amber-900">
                <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                  Menunggu review oleh {ap.reviewer ? personLabel(ap.reviewer) : 'reviewer'}.
                </Text>
              </View>
            ) : null}

            {ap.status === 'done' ? (
              <View className="rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                <Text className="text-sm font-semibold text-green-700 dark:text-green-300">
                  ✓ Selesai & disetujui reviewer.
                </Text>
              </View>
            ) : null}

            {/* ---- Riwayat submission (one-time saja) ---- */}
            {ap.repeat_setting !== 'repeat' ? (
            <View className="gap-3">
              <Text className="text-lg font-bold text-black dark:text-white">Riwayat Submission</Text>
              {subsQ.isLoading ? (
                <ActivityIndicator />
              ) : subsQ.data && subsQ.data.length > 0 ? (
                subsQ.data.map((s) => <SubmissionCard key={s.id} s={s} />)
              ) : (
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  Belum ada submission. Bukti yang sudah dikirim terkunci dan tersimpan sebagai versi.
                </Text>
              )}
            </View>
            ) : null}

            <ActivityLogPanel entityType="action_plan" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function ActionPlanDetailRoute() {
  return <StackScreenAdapter live={LiveActionPlanDetailScreen} prototype={PrototypeActionPlanDetailScreen} />;
}
