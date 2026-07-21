import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Button, EmptyState, Field, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { useStrategyActions, usePerson } from '@/hooks/use-workspace';
import { alertFriendlyError } from '@/lib/errors';
import { getGoal, listStrategyTemplates, type StrategyTemplate } from '@/lib/goals';
import type { PersonRef } from '@/lib/strategies';

type Person = NonNullable<PersonRef>;

/**
 * UI-S-K02 — Strategi Template Picker (PRD §18).
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
    // V1.83 §18: user "tetap lanjut isi manual" bila library tidak tersedia.
    return (
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Isi Strategy manual — Goal ini tidak dibuat dari Goal Template.
      </Text>
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pakai Template Strategi"
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
                Pilih Template Strategi
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
              <EmptyState
                title="Belum ada Strategy Template"
                description="Admin dapat membuat template custom nanti. User tetap bisa membuat Strategy manual tanpa template."
                action={{ label: 'Isi Manual', onPress: () => setOpen(false) }}
              />
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

/**
 * Kondisi periode warisan. Empat state ini SENGAJA dipisah: "Goal tidak terbaca" dan "Goal
 * terbaca tapi periodenya kosong" sama-sama memblokir simpan, tapi perbaikannya berbeda —
 * yang satu soal akses/rute, yang satu soal data Goal. Menyatukan keduanya jadi satu kalimat
 * mengirim user memperbaiki hal yang salah.
 */
type PeriodState = 'loading' | 'error' | 'unreachable' | 'no-period' | 'ok';

const PERIOD_COPY: Record<PeriodState, { label: string; hint: string; blockTitle: string; blockBody: string }> = {
  loading: {
    label: 'Memuat periode Goal…',
    hint: 'Periode Strategi mengikuti Goal induk.',
    blockTitle: 'Periode Goal belum termuat',
    blockBody: 'Tunggu sebentar sampai periode Goal induk tampil, lalu simpan lagi.',
  },
  error: {
    label: 'Gagal memuat Goal induk',
    hint: 'Periode Strategi mengikuti Goal induk, jadi Strategi belum bisa disimpan. Periksa koneksi lalu buka ulang layar ini.',
    blockTitle: 'Goal induk gagal dimuat',
    blockBody: 'Periode Strategi diturunkan dari Goal induk, dan Goal itu gagal dimuat. Periksa koneksi lalu buka ulang layar ini.',
  },
  unreachable: {
    label: 'Goal induk tidak ditemukan',
    hint: 'Goal mungkin sudah dihapus atau di luar akses Anda. Buka layar ini lewat tombol tambah di Goal-nya.',
    blockTitle: 'Goal induk tidak ditemukan',
    blockBody:
      'Periode Strategi diturunkan dari Goal induk, tetapi Goal itu tidak ditemukan atau di luar akses Anda. Buka layar ini lewat tombol tambah di Goal-nya.',
  },
  'no-period': {
    label: 'Goal induk belum punya periode',
    hint: 'Isi periode di Goal induk dulu; Strategi tidak bisa diaktifkan tanpa periode.',
    blockTitle: 'Periode Goal belum diisi',
    blockBody: 'Strategi mengikuti periode Goal induk. Isi dulu periode Goal, lalu buat Strategi ini kembali.',
  },
  ok: {
    label: '',
    hint: 'Strategi tidak punya masa berlaku sendiri — periode diturunkan dari Goal induk.',
    blockTitle: '',
    blockBody: '',
  },
};

function periodStateOf(
  q: { isLoading: boolean; isError: boolean; data?: unknown },
  start: string | null,
  end: string | null,
): PeriodState {
  if (q.isLoading) return 'loading';
  if (q.isError) return 'error';
  // getGoal memakai maybeSingle → null saat id tak ada ATAU RLS menyaringnya habis.
  if (!q.data) return 'unreachable';
  return start && end ? 'ok' : 'no-period';
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
  const [description, setDescription] = useState('');
  const [pic, setPic] = useState<Person | null>(null);

  // PRD §12.1 (baris 540-544): "Strategy tidak punya masa berlaku sendiri karena mengikuti Goal
  // tahunan." Periode DITURUNKAN dari Goal induk, tidak pernah diketik user (§44 AC-11).
  // Warisan disalin saat pembuatan (kolom `strategies.period_start/end` tetap material karena
  // `activate_strategy` mem-gate keduanya NOT NULL), bukan dibaca ulang dari Goal saat render.
  const inheritedStart = parentQ.data?.period_start ?? null;
  const inheritedEnd = parentQ.data?.period_end ?? null;
  const periodState = periodStateOf(parentQ, inheritedStart, inheritedEnd);
  const periodCopy = PERIOD_COPY[periodState];

  async function submit() {
    if (!name.trim()) {
      Alert.alert('Belum lengkap', 'Nama Strategi wajib diisi.');
      return;
    }
    if (!target.trim()) {
      Alert.alert('Belum lengkap', 'Target Strategi wajib diisi.');
      return;
    }
    if (!expectedOutcome.trim()) {
      Alert.alert('Belum lengkap', 'Ekspektasi Hasil Strategi wajib diisi.');
      return;
    }
    // Periode warisan tidak bisa "diperbaiki" dari layar ini. Menyimpan Strategy dengan periode
    // NULL menghasilkan Draft yang TIDAK PERNAH bisa diaktifkan (`activate_strategy` 0078 mem-gate
    // period_start/period_end NOT NULL) — errornya baru muncul jauh dari penyebabnya. Blokir di
    // sini, dan sebutkan perbaikan yang TEPAT untuk state-nya (lihat PERIOD_COPY).
    if (periodState !== 'ok' || !inheritedStart || !inheritedEnd) {
      Alert.alert(periodCopy.blockTitle, periodCopy.blockBody);
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
        period_start: inheritedStart,
        period_end: inheritedEnd,
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
          title="Strategi — Area pengukuran"
          body="Strategi mendefinisikan indikator keberhasilan sebuah Goal. Tetapkan Target yang terukur, lalu turunkan jadi Inisiatif. Card disimpan sebagai Draft dulu; aktifkan setelah kelengkapan terpenuhi."
        />

        <SectionCard>
          <StrategyTemplatePicker
            goalTemplateId={parentQ.data?.goal_template_id}
            onPick={(t) => {
              // PRD §18: "Setelah template dipilih, Nama Strategi, PIC rekomendasi, Target awal,
              // dan Ekspektasi Hasil terisi otomatis." Prefill berbasis kolom hint (0027).
              setName(t.name);
              if (t.target_hint) setTarget(t.target_hint);
              if (t.expected_outcome_hint) setExpectedOutcome(t.expected_outcome_hint);
            }}
          />
          <LabeledInput
            label="Nama Strategi"
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
          <Field
            label="Periode (mengikuti Goal)"
            value={
              <View className="gap-0.5">
                <Text className="text-base text-black dark:text-white">
                  {periodState === 'ok' ? `${inheritedStart} → ${inheritedEnd}` : periodCopy.label}
                </Text>
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">{periodCopy.hint}</Text>
              </View>
            }
          />
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
