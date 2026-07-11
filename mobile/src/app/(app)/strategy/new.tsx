import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { UserPicker } from '@/components/user-picker';
import { useStrategyActions, usePerson } from '@/hooks/use-workspace';
import { periodError } from '@/lib/date';
import { alertFriendlyError } from '@/lib/errors';
import { getGoal, listStrategyTemplates, type StrategyTemplate } from '@/lib/goals';
import type { PersonRef } from '@/lib/strategies';

type Person = NonNullable<PersonRef>;

/**
 * UI-S-K02 — Strategy Template Picker (PRD §18).
 *
 * "Klik Pakai Template membuka bottom sheet" → list `strategy_templates` di bawah goal_template_id
 * parent Goal, dikelompokkan per `division_label`. Pilih → prefill `name`.
 *
 * V1 limitation: schema `strategy_templates` hanya punya `name` + `division`. Target & Ekspektasi
 * Hasil rekomendasi belum ada di schema, jadi user tetap mengetik manual. Bisa di-extend
 * follow-up via ALTER strategy_templates ADD COLUMN target_hint/expected_outcome_hint.
 */
function StrategyTemplatePicker({
  goalTemplateId,
  onPick,
}: {
  goalTemplateId: string | null | undefined;
  onPick: (t: StrategyTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const tmplQ = useQuery({
    queryKey: ['strategy_templates', goalTemplateId],
    queryFn: () => listStrategyTemplates(goalTemplateId!),
    enabled: !!goalTemplateId,
  });
  const grouped = useMemo(() => {
    const map = new Map<string, StrategyTemplate[]>();
    for (const t of tmplQ.data ?? []) {
      const key = t.division_label;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [tmplQ.data]);

  if (!goalTemplateId) {
    return (
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Template tidak tersedia (Goal ini tidak dibuat dari template).
      </Text>
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pakai Template Strategy"
        onPress={() => setOpen(true)}
        style={{ minHeight: 44 }}
        className="min-h-[44px] flex-row items-center justify-center rounded-xl border border-brand-dark px-4 py-2 active:opacity-70">
        <Text className="text-sm font-semibold text-brand-dark">Pakai Template</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[80%] gap-3 rounded-t-2xl bg-white p-5 dark:bg-neutral-900">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-black dark:text-white">
                Pilih Template Strategy
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                onPress={() => setOpen(false)}
                style={{ minHeight: 44 }}
                className="min-h-[44px] items-center justify-center rounded-full px-3 active:opacity-70">
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">Tutup</Text>
              </Pressable>
            </View>

            {tmplQ.isLoading ? (
              <Text className="text-xs text-neutral-400">Memuat template…</Text>
            ) : grouped.length === 0 ? (
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Belum ada Strategy Template untuk Goal Template ini.
              </Text>
            ) : (
              <ScrollView className="max-h-[60vh]">
                <View className="gap-3">
                  {grouped.map(([division, items]) => (
                    <View key={division} className="gap-1.5">
                      <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                        {division}
                      </Text>
                      {items.map((t) => (
                        <Pressable
                          key={t.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Pilih template ${t.name}`}
                          onPress={() => {
                            onPick(t);
                            setOpen(false);
                          }}
                          style={{ minHeight: 44 }}
                          className="min-h-[44px] rounded-xl border border-neutral-200 px-3 py-2 active:opacity-70 dark:border-neutral-800">
                          <Text className="text-sm text-black dark:text-white">{t.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function LiveNewStrategyScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const router = useRouter();
  const { create, isPending } = useStrategyActions(goalId);
  // Default PIC turunan (PRD §52): picker di-prefill PIC Goal induk (terlihat & bisa diubah/dikosongkan).
  const parentQ = useQuery({ queryKey: ['goal', goalId], queryFn: () => getGoal(goalId), enabled: !!goalId });
  const { person: inheritedPic } = usePerson(parentQ.data?.pic_id);

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  // 0032 (override PRD §18) — target numerik + satuan OPSIONAL, buka "% gap" presisi.
  const [targetNumeric, setTargetNumeric] = useState('');
  const [targetUnit, setTargetUnit] = useState('');
  // UI-S-K03 — PRD §18 wajib "Ekspektasi Hasil".
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Strategy wajib diisi.');
      return;
    }
    if (!target.trim()) {
      Alert.alert('Belum lengkap', 'Target Strategy wajib diisi.');
      return;
    }
    if (!expectedOutcome.trim()) {
      Alert.alert('Belum lengkap', 'Ekspektasi Hasil Strategy wajib diisi.');
      return;
    }
    const dateErr = periodError(periodStart, periodEnd);
    if (dateErr) {
      Alert.alert('Tanggal tidak valid', dateErr);
      return;
    }
    let targetNumericVal: number | null = null;
    if (targetNumeric.trim()) {
      const n = Number(targetNumeric.trim());
      if (!Number.isFinite(n) || n < 0) {
        Alert.alert('Target angka tidak valid', 'Isi angka ≥ 0, atau kosongkan untuk KPI kualitatif.');
        return;
      }
      targetNumericVal = n;
    }
    try {
      const created = await create({
        goal_id: goalId,
        name: name.trim(),
        description: description.trim() || null,
        target: target.trim(),
        target_numeric: targetNumericVal,
        target_unit: targetUnit.trim() || null,
        expected_outcome: expectedOutcome.trim(),
        pic_id: (pic ?? inheritedPic)?.id ?? null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      router.replace(`/strategy/${created.id}` as Href);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Strategy — Area pengukuran"
          body="Strategy mendefinisikan indikator keberhasilan sebuah Goal. Tetapkan Target yang terukur, lalu turunkan jadi Initiative. Card disimpan sebagai Draft dulu; aktifkan setelah kelengkapan terpenuhi."
        />

        <SectionCard>
          <StrategyTemplatePicker
            goalTemplateId={parentQ.data?.goal_template_id}
            onPick={(t) => {
              // PRD §18: "Setelah template dipilih, Nama Strategy, PIC rekomendasi, Target awal,
              // dan Ekspektasi Hasil terisi otomatis." Prefill berbasis kolom hint (0027).
              setName(t.name);
              if (t.target_hint) setTarget(t.target_hint);
              if (t.expected_outcome_hint) setExpectedOutcome(t.expected_outcome_hint);
            }}
          />
          <LabeledInput
            label="Nama Strategy"
            value={name}
            onChangeText={setName}
            required
            placeholder="mis. Pertumbuhan Pendapatan"
          />
          <LabeledInput
            label="Target"
            value={target}
            onChangeText={setTarget}
            required
            placeholder="mis. Naik 20% YoY"
            multiline
          />
          <LabeledInput
            label="Target angka (opsional)"
            value={targetNumeric}
            onChangeText={setTargetNumeric}
            keyboardType="numeric"
            placeholder="mis. 5000 — buka % capaian vs target"
          />
          <LabeledInput
            label="Satuan (opsional)"
            value={targetUnit}
            onChangeText={setTargetUnit}
            autoCapitalize="none"
            placeholder="mis. customer, Rp, %"
          />
          <LabeledInput
            label="Ekspektasi Hasil"
            value={expectedOutcome}
            onChangeText={setExpectedOutcome}
            required
            placeholder="Hasil konkret yang diharapkan tercapai"
            multiline
          />
          <UserPicker label="PIC / Owner" value={pic ?? inheritedPic} onChange={setPic} />
          <DateField label="Tanggal Mulai" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Tanggal Selesai" value={periodEnd} onChange={setPeriodEnd} />
          <LabeledInput label="Deskripsi (opsional)" value={description} onChangeText={setDescription} multiline />
        </SectionCard>

        <Button label="Simpan sebagai Draft" onPress={submit} loading={isPending} />
      </View>
    </ScrollView>
  );
}

export default function NewStrategyRoute() {
  return <LiveNewStrategyScreen />;
}
