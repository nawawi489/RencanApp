import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { usePerson } from '@/hooks/use-workspace';
import { createInitiative, type PersonRef } from '@/lib/cards';
import { periodError } from '@/lib/date';
import { getStrategy } from '@/lib/strategies';
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

export function LiveNewInitiativeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  // Fase 4 (strategyId) / Fase 6 (problemStatementId) — Initiative ditautkan ke salah satu induk
  // (mutually exclusive via CHECK initiatives_single_parent di DB). Tanpa param → Initiative datar.
  const { strategyId, problemStatementId } = useLocalSearchParams<{
    strategyId?: string;
    problemStatementId?: string;
  }>();
  // Default PIC turunan: ikut PIC induk yang sesuai.
  const strategyQ = useQuery({
    queryKey: ['strategy', strategyId],
    queryFn: () => getStrategy(strategyId!),
    enabled: !!strategyId,
  });
  const psQ = useQuery({
    queryKey: ['problem_statement', problemStatementId],
    queryFn: () => getProblemStatement(problemStatementId!),
    enabled: !!problemStatementId,
  });
  const inheritedPicId = strategyId
    ? strategyQ.data?.pic_id
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

  const mutation = useMutation({
    mutationFn: createInitiative,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['initiatives'] });
      router.replace(`/initiative/${created.id}` as Href);
    },
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.'),
  });

  function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Initiative wajib diisi.');
      return;
    }
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    mutation.mutate({
      name: name.trim(),
      target_result: target.trim() || null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      description: description.trim() || null,
      pic_id: (pic ?? inheritedPic)?.id ?? null,
      strategy_id: strategyId ?? null,
      problem_statement_id: problemStatementId ?? null,
      team_id: teamId,
    });
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Initiative — Program eksekusi"
          body="Initiative adalah program konkret untuk menjalankan strategi. Isi Target Hasil, lalu pecah jadi Action Plan. Card disimpan sebagai Draft dulu; aktifkan setelah kelengkapan terpenuhi."
        />

        <SectionCard>
          <LabeledInput label="Nama Initiative" value={name} onChangeText={setName} required placeholder="mis. Kampanye Konten Q3" />
          <LabeledInput
            label="Target Hasil"
            value={target}
            onChangeText={setTarget}
            placeholder="mis. 20 konten tayang & 500 leads"
            multiline
          />
          <UserPicker label="PIC / Owner" value={pic ?? inheritedPic} onChange={setPic} />
          <TeamChipSelector value={teamId} onChange={setTeamId} />
          <DateField label="Tanggal Mulai" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Tanggal Selesai" value={periodEnd} onChange={setPeriodEnd} />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={mutation.isPending} />
      </View>
    </ScrollView>
  );
}

export default function NewInitiativeRoute() {
  return <LiveNewInitiativeScreen />;
}
