import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateRangeField } from '@/components/date-range-field';
import { UserPicker } from '@/components/user-picker';
import { useDirtyGuard } from '@/hooks/use-dirty-guard';
import { usePerson } from '@/hooks/use-workspace';
import { createActionPlan, type NewActionPlan, type PersonRef } from '@/lib/cards';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { periodError } from '@/lib/date';
import { alertFriendlyError } from '@/lib/errors';
import { getInitiative } from '@/lib/initiatives';
import { getProblemStatement } from '@/lib/problem-statements';
import { listTeams } from '@/lib/org-structure';

type Person = NonNullable<PersonRef>;

function TeamChipSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const teamsQ = useQuery({
    queryKey: ['teams', { activeOnly: true }],
    queryFn: () => listTeams({ activeOnly: true }),
  });
  const teams = teamsQ.data ?? [];
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">
        Tim<Text className="text-red-500"> *</Text>
      </Text>
      {teamsQ.isLoading ? (
        <Text className="text-xs text-neutral-400">Memuat daftar tim…</Text>
      ) : teams.length === 0 ? (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          Belum ada tim. Admin dapat menambah tim di Menu → Org Structure → Tim.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {teams.map((t) => {
            const active = value === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`Tim ${t.name}`}
                accessibilityState={{ selected: active }}
                onPress={() => onChange(active ? null : t.id)}
                style={{ minHeight: 44 }}
                className={`min-h-[44px] items-center justify-center rounded-full border px-3 py-2 active:opacity-70 ${
                  active
                    ? 'border-brand-dark bg-brand-dark'
                    : 'border-neutral-300 dark:border-neutral-700'
                }`}>
                <Text
                  className={`text-xs font-semibold ${
                    active ? 'text-white' : 'text-black dark:text-white'
                  }`}>
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function LiveNewActionPlanScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  // Fase 4 (initiativeId) / Fase 6 (problemStatementId) — Rencana Aksi ditautkan ke salah satu induk
  // (mutually exclusive via CHECK action_plans_single_parent di DB). Tanpa param → Rencana Aksi datar.
  const { initiativeId, problemStatementId } = useLocalSearchParams<{
    initiativeId?: string;
    problemStatementId?: string;
  }>();
  // Default PIC turunan: ikut PIC induk yang sesuai.
  const initiativeQ = useQuery({
    queryKey: ['initiative', initiativeId],
    queryFn: () => getInitiative(initiativeId!),
    enabled: !!initiativeId,
  });
  const psQ = useQuery({
    queryKey: ['problem_statement', problemStatementId],
    queryFn: () => getProblemStatement(problemStatementId!),
    enabled: !!problemStatementId,
  });
  const inheritedPicId = initiativeId
    ? initiativeQ.data?.pic_id
    : problemStatementId
      ? psQ.data?.pic_id
      : null;
  const { person: inheritedPic } = usePerson(inheritedPicId);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);
  // UI-S-I01 — PRD §21 "Tim" wajib.
  const [teamId, setTeamId] = useState<string | null>(null);
  // S7-3: error inline per-field + banner form-level utk error yang tidak terikat LabeledInput
  // tunggal (mis. periode tanggal via DateRangeField).
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  // S7-2: guard swipe-down / back saat form kotor.
  const [submitted, setSubmitted] = useState(false);
  const isDirty =
    !submitted &&
    (name.trim() !== '' ||
      target.trim() !== '' ||
      description.trim() !== '' ||
      periodStart !== '' ||
      periodEnd !== '' ||
      pic != null ||
      teamId != null);
  useDirtyGuard(isDirty);

  const idk = useIdempotencyKey();
  const mutation = useMutation({
    mutationFn: (input: NewActionPlan) =>
      createActionPlan({ ...input, client_request_id: idk.key() }),
    onSuccess: (created) => {
      idk.reset();
      qc.invalidateQueries({ queryKey: ['action_plans'] });
      setSubmitted(true);
      router.replace(`/action-plan/${created.id}`);
    },
    onError: (e) => alertFriendlyError('Gagal', e, 'Terjadi kesalahan.'),
  });

  function submit() {
    const nextErrors: typeof fieldErrors = {};
    if (!name.trim()) {
      nextErrors.name = 'Nama Rencana Aksi wajib diisi.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      setFormError(dateErr);
      return;
    }
    setFormError(null);
    mutation.mutate({
      name: name.trim(),
      target_result: target.trim() || null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      description: description.trim() || null,
      pic_id: (pic ?? inheritedPic)?.id ?? null,
      initiative_id: initiativeId ?? null,
      problem_statement_id: problemStatementId ?? null,
      team_id: teamId,
    });
  }

  return (
    <KeyboardAwareScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Rencana Aksi — Program eksekusi"
          body="Rencana Aksi adalah program konkret untuk menjalankan strategi. Isi Target Hasil, lalu pecah jadi Tugas. Card disimpan sebagai Draft dulu; aktifkan setelah kelengkapan terpenuhi."
        />

        <SectionCard>
          <LabeledInput
            label="Nama Rencana Aksi"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
            }}
            required
            placeholder="mis. Kampanye Konten Q3"
            error={fieldErrors.name}
          />
          <LabeledInput
            label="Target Hasil"
            value={target}
            onChangeText={setTarget}
            placeholder="mis. 20 konten tayang & 500 leads"
            multiline
          />
          <UserPicker label="PIC / Owner" value={pic ?? inheritedPic} onChange={setPic} />
          <TeamChipSelector value={teamId} onChange={setTeamId} />
          <DateRangeField
            startValue={periodStart}
            endValue={periodEnd}
            onStartChange={setPeriodStart}
            onEndChange={setPeriodEnd}
          />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        {formError ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="text-sm font-semibold text-red-700 dark:text-red-400">
            {formError}
          </Text>
        ) : null}
        <Button label="Simpan sebagai Draft" onPress={submit} loading={mutation.isPending} />
      </View>
    </KeyboardAwareScrollView>
  );
}

export default function NewActionPlanRoute() {
  return <LiveNewActionPlanScreen />;
}
