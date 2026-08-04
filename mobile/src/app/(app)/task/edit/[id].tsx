// S4-1 — sunting Tugas yang sudah ada. Sebelum ini `tasks` hanya punya
// create / activate / start / submit, jadi salah ketik nama atau salah pilih
// reviewer permanen sampai admin menyentuh DB.
//
// Field TERKUNCI setelah aktivasi: `start_date`, `deadline`, `deadline_time`
// (dasar perhitungan skor & basis on-time compliance). Untuk mengubah
// deadline pasca-aktif, PIC memakai Ajukan Ubah Deadline (S3-4). Field
// terkunci tetap DITAMPILKAN sebagai read-only supaya user tahu nilai yang
// sedang mengikat, tidak disembunyikan.
//
// `evidence_required` / `result_value_required` / `repeat_setting` tidak
// disunting di sini: mengubah aturan submit setelah submission masuk = ubah
// kontrak review retroaktif; mengubah pola repeat butuh alur terpisah (S4-8).
//
// Rute `task/edit/[id]` mengikuti pola `goal/edit/[id]` — bukan
// `task/[id]/edit` — supaya `task/[id].tsx` tidak perlu dipecah jadi
// direktori demi satu layar tambahan.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';

import { DateField } from '@/components/date-field';
import { TimeField } from '@/components/time-field';
import { UserPicker } from '@/components/user-picker';
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
import { useSafeBack } from '@/hooks/use-safe-back';
import {
  ACTION_PLAN_STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_TONE,
  getPersonRef,
  getTask,
  updateTask,
  type PersonRef,
} from '@/lib/cards';
import { DATE_HINT, DATE_RE, TIME_RE } from '@/lib/date';
import { alertFriendlyError } from '@/lib/errors';

type Person = NonNullable<PersonRef>;

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

/** Chip prioritas — pattern sama dengan task/new.tsx (radiogroup, a11y-first). */
function PrioritySelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">Prioritas</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {PRIORITIES.map((p) => {
          const active = value === p;
          return (
            <Pressable
              key={p}
              className={`min-h-[44px] justify-center rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
              onPress={() => onChange(p)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Prioritas ${PRIORITY_LABEL[p]}`}>
              <Text
                className={
                  active ? 'text-sm font-semibold text-white' : 'text-sm text-black dark:text-white'
                }>
                {PRIORITY_LABEL[p]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function LiveEditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const qc = useQueryClient();

  const taskQ = useQuery({ queryKey: ['action-plan', id], queryFn: () => getTask(id) });
  const task = taskQ.data;

  // PIC & reviewer tersimpan sebagai UUID telanjang di tabel; picker butuh identitas orangnya.
  const picQ = useQuery({
    queryKey: ['person-ref', task?.pic_id],
    queryFn: () => getPersonRef(task?.pic_id),
    enabled: !!task,
  });
  const reviewerQ = useQuery({
    queryKey: ['person-ref', task?.reviewer_id],
    queryFn: () => getPersonRef(task?.reviewer_id),
    enabled: !!task,
  });

  // `undefined` = field belum disentuh → ikut nilai server. Prefill lewat useEffect dilarang
  // di repo ini (react-hooks/set-state-in-effect = ERROR di CI); pola turunan ini juga
  // mencegah form tertimpa ulang setiap kali query menyegarkan.
  const [nameDraft, setNameDraft] = useState<string | undefined>();
  const [descDraft, setDescDraft] = useState<string | undefined>();
  const [picDraft, setPicDraft] = useState<Person | null | undefined>();
  const [reviewerDraft, setReviewerDraft] = useState<Person | null | undefined>();
  const [priorityDraft, setPriorityDraft] = useState<string | undefined>();
  const [startDraft, setStartDraft] = useState<string | undefined>();
  const [deadlineDraft, setDeadlineDraft] = useState<string | undefined>();
  const [deadlineTimeDraft, setDeadlineTimeDraft] = useState<string | undefined>();
  const [outputDraft, setOutputDraft] = useState<string | undefined>();
  const [dodDraft, setDodDraft] = useState<string | undefined>();
  const [evidDescDraft, setEvidDescDraft] = useState<string | undefined>();

  const locked = !!task && task.status !== 'draft';
  const name = nameDraft ?? task?.name ?? '';
  const description = descDraft ?? task?.description ?? '';
  const pic = picDraft !== undefined ? picDraft : ((picQ.data ?? null) as Person | null);
  const reviewer =
    reviewerDraft !== undefined ? reviewerDraft : ((reviewerQ.data ?? null) as Person | null);
  const priority = priorityDraft ?? task?.priority ?? '';
  const startDate = startDraft ?? task?.start_date ?? '';
  const deadline = deadlineDraft ?? task?.deadline ?? '';
  const deadlineTime = deadlineTimeDraft ?? task?.deadline_time ?? '';
  const output = outputDraft ?? task?.expected_output ?? '';
  const dod = dodDraft ?? task?.definition_of_done ?? '';
  const evidDesc = evidDescDraft ?? task?.evidence_description ?? '';

  const mutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateTask>[1]) => updateTask(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  async function submit() {
    if (!task) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      alertFriendlyError('Belum lengkap', null, 'Nama Tugas wajib diisi.');
      return;
    }

    // Saat terkunci, kirim nilai TASK apa adanya untuk field terkunci — termasuk null.
    // Mengirim string kosong untuk field yang memang null akan terbaca server sebagai
    // perubahan dan panggilan yang cuma mengubah nama ikut tertolak "Deadline terkunci".
    let start = task.start_date;
    let dl = task.deadline;
    let dlTime = task.deadline_time;

    if (!locked) {
      if (startDate && !DATE_RE.test(startDate)) {
        alertFriendlyError('Tanggal tidak valid', null, DATE_HINT);
        return;
      }
      if (deadline && !DATE_RE.test(deadline)) {
        alertFriendlyError('Tanggal tidak valid', null, DATE_HINT);
        return;
      }
      if (deadlineTime && !TIME_RE.test(deadlineTime)) {
        alertFriendlyError('Jam tidak valid', null, 'Format HH:MM (24 jam).');
        return;
      }
      start = startDate || null;
      dl = deadline || null;
      dlTime = deadlineTime || null;
    }

    try {
      await mutation.mutateAsync({
        name: trimmedName,
        description: description.trim() || null,
        pic_id: pic?.id ?? null,
        reviewer_id: reviewer?.id ?? null,
        priority: priority || null,
        start_date: start,
        deadline: dl,
        deadline_time: dlTime,
        expected_output: output.trim() || null,
        definition_of_done: dod.trim() || null,
        evidence_description: evidDesc.trim() || null,
      });
      safeBack();
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Perubahan tidak tersimpan. Coba lagi.');
    }
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-neutral-50 dark:bg-black"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Ubah Tugas' }} />
      <View className="gap-4 p-5">
        {taskQ.isLoading ? (
          <SkeletonList count={3} />
        ) : taskQ.isError ? (
          <ErrorState onRetry={() => taskQ.refetch()} />
        ) : !task ? (
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-1">
              <Badge
                label={ACTION_PLAN_STATUS_LABEL[task.status] ?? task.status}
                tone={STATUS_TONE[task.status]}
              />
              <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Ubah Tugas</Text>
            </View>

            {locked ? (
              <GuidanceNote
                title="Tanggal & deadline terkunci"
                body="Tugas ini sudah aktif. Tanggal mulai dan deadline adalah dasar perhitungan skor dan on-time compliance, jadi keduanya tidak bisa diubah lagi — menggesernya membuat angka historis tidak konsisten. Untuk ubah deadline pasca-aktif, gunakan Ajukan Ubah Deadline dari layar detail."
              />
            ) : null}

            <SectionCard>
              <LabeledInput
                label="Nama Tugas"
                value={name}
                onChangeText={setNameDraft}
                required
                placeholder="mis. Riset kompetitor Q4"
              />
              <LabeledInput
                label="Keterangan (opsional)"
                value={description}
                onChangeText={setDescDraft}
                multiline
              />
              <UserPicker label="PIC" value={pic} onChange={setPicDraft} />
              <UserPicker label="Reviewer" value={reviewer} onChange={setReviewerDraft} />
              <PrioritySelector value={priority} onChange={setPriorityDraft} />

              {locked ? (
                <>
                  <Field label="Tanggal Mulai" value={task.start_date ?? '—'} />
                  <Field
                    label="Deadline"
                    value={
                      task.deadline
                        ? `${task.deadline}${task.deadline_time ? ` · ${task.deadline_time}` : ''}`
                        : '—'
                    }
                  />
                </>
              ) : (
                <>
                  <DateField
                    label="Tanggal Mulai (opsional)"
                    value={startDate}
                    onChange={setStartDraft}
                  />
                  <DateField
                    label="Deadline (opsional)"
                    value={deadline}
                    onChange={setDeadlineDraft}
                  />
                  <TimeField
                    label="Jam Deadline (opsional)"
                    value={deadlineTime}
                    onChange={setDeadlineTimeDraft}
                  />
                </>
              )}

              <LabeledInput
                label="Output yang Diharapkan (opsional)"
                value={output}
                onChangeText={setOutputDraft}
                multiline
              />
              <LabeledInput
                label="Definition of Done (opsional)"
                value={dod}
                onChangeText={setDodDraft}
                multiline
              />
              <LabeledInput
                label="Bukti yang Diminta (opsional)"
                value={evidDesc}
                onChangeText={setEvidDescDraft}
                multiline
              />
            </SectionCard>

            <Button
              label="Simpan perubahan"
              onPress={submit}
              loading={mutation.isPending}
            />
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

export default function EditTaskRoute() {
  return <LiveEditTaskScreen />;
}
