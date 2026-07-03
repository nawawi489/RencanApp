// UI Fase 7 + UI-S-SF1 — Settings · Score Formula.
// SF1: editor bobot INLINE pada versi draft (TextInput numeric integer 0..100), validasi total 100% live,
//      4 chip level (Staff/Management/C-Level/CEO — no Custom), Buat Draft per level, sticky footer
//      Save Draft + Aktifkan. Override surface single-actor (D10) tetap di bawah.
// Permission gate: manage_score_formula. Defense-in-depth (gate juga di RPC server).
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View, Pressable } from 'react-native-css/components';

import {
  Badge,
  EmptyState,
  GuidanceNote,
  LabeledInput,
  ScoreLegend,
  SectionCard,
  SkeletonCard,
  usePlaceholderColor,
} from '@/components/ui';
import {
  useActivePeriod,
  useFormulaActions,
  useScoreFormulaTemplates,
  useScoreFormulaVersions,
  useScoreOverride,
} from '@/hooks/use-people-score';
import { useProfile } from '@/hooks/use-profile';
import {
  FORMULA_STATUS_LABEL,
  METRIC_LABEL,
  type FormulaCategory,
  type FormulaLevel,
  type ScoreFormulaVersion,
} from '@/lib/people-score';

const LEVELS: { value: FormulaLevel; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'management', label: 'Management' },
  { value: 'c_level', label: 'C-Level' },
  { value: 'ceo', label: 'CEO' },
];

function parseWeight(text: string): number {
  // Integer-only, clamp 0..100, NaN→0. Regex client ^\d{0,3}$ — non-digit dibuang via slice.
  const digits = (text ?? '').replace(/\D/g, '').slice(0, 3);
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function categoriesFromRaw(raw: unknown): FormulaCategory[] {
  return Array.isArray(raw) ? (raw as FormulaCategory[]) : [];
}

/** Editor inline untuk draft — TextInput per kategori + total badge + Save + Activate. */
function DraftEditor({
  version,
  templateId,
  onActivate,
}: {
  version: ScoreFormulaVersion;
  templateId: string;
  onActivate: (versionId: string) => void;
}) {
  // initial dihitung sekali (komponen di-key oleh parent saat version berubah → fresh state).
  // Tidak pakai useEffect+setState anti-pattern (react-hooks/set-state-in-effect).
  const initial = useMemo(() => categoriesFromRaw(version.categories), [version.categories]);
  const [draft, setDraft] = useState<FormulaCategory[]>(initial);
  const [reason, setReason] = useState('');
  const placeholderColor = usePlaceholderColor();
  const { updateWeights, isUpdatingWeights } = useFormulaActions(templateId);
  const [saveError, setSaveError] = useState<string | null>(null);

  const total = draft.reduce((acc, c) => acc + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const reasonValid = reason.trim().length >= 8;

  function setWeight(code: string, text: string) {
    setDraft((prev) =>
      prev.map((c) => (c.code === code ? { ...c, weight: parseWeight(text) } : c)),
    );
  }

  async function handleSave() {
    setSaveError(null);
    try {
      await updateWeights({ versionId: version.id, categories: draft, changeReason: reason.trim() });
      setReason(''); // clear setelah sukses; data refetch re-seed via useEffect.
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Gagal menyimpan draft.');
    }
  }

  const totalValid = total === 100;
  const canSave = dirty && reasonValid && !isUpdatingWeights;
  const canActivate = !dirty && totalValid && !isUpdatingWeights;

  return (
    <View className="gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-black dark:text-white">
          Draft v{version.version_number}
        </Text>
        <Badge label={FORMULA_STATUS_LABEL.draft ?? 'Draft'} tone="warn" />
      </View>

      {draft.length === 0 ? (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          Kategori belum ter-seed. Hubungi DBA untuk menyemai kategori awal sebelum bobot bisa diatur.
        </Text>
      ) : (
        <View className="gap-2">
          {draft.map((c) => (
            <View key={c.code} className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-xs text-neutral-700 dark:text-neutral-200">
                {METRIC_LABEL[c.code] ?? c.code}
              </Text>
              <TextInput
                accessibilityLabel={`Bobot ${METRIC_LABEL[c.code] ?? c.code}`}
                keyboardType="numeric"
                maxLength={3}
                value={String(c.weight ?? 0)}
                onChangeText={(t) => setWeight(c.code, t)}
                style={{ minWidth: 64, minHeight: 44 }}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-right text-base text-black dark:border-neutral-700 dark:text-white"
              />
              <Text className="text-xs text-neutral-400">%</Text>
            </View>
          ))}

          {/* WeightTotalBadge (DA-SF1-3) — warna + label teks (a11y mengikat). */}
          <View
            className={`self-start rounded-full px-2.5 py-1 ${
              totalValid ? 'bg-green-100 dark:bg-green-950' : 'bg-amber-100 dark:bg-amber-950'
            }`}
            accessible
            accessibilityLabel={
              totalValid
                ? `Total bobot ${total}%, valid untuk aktivasi`
                : `Total bobot ${total}%, harus 100% untuk aktivasi`
            }>
            <Text
              className={`text-xs font-semibold ${
                totalValid ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'
              }`}>
              Total: {total}% {totalValid ? '(valid)' : '(harus 100%)'}
            </Text>
          </View>
        </View>
      )}

      <TextInput
        accessibilityLabel="Alasan perubahan (min 8 karakter)"
        placeholder="Alasan perubahan (min 8 karakter)…"
        placeholderTextColor={placeholderColor}
        value={reason}
        onChangeText={setReason}
        multiline
        className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-black dark:border-neutral-700 dark:text-white"
      />
      {!reasonValid && reason.length > 0 ? (
        <Text className="text-xs text-amber-700 dark:text-amber-300">
          Alasan minimal 8 karakter.
        </Text>
      ) : null}

      {saveError ? (
        <Text accessibilityRole="alert" className="text-xs font-semibold text-red-700 dark:text-red-400">
          {saveError}
        </Text>
      ) : null}

      {/* FormulaStickyFooter (DA-SF1-4) — Save Draft + Aktifkan, accessibilityState eksplisit. */}
      <View className="mt-1 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Simpan Draft"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={handleSave}
          style={{ minHeight: 44 }}
          className={`flex-1 items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 dark:border-neutral-700 ${
            canSave ? 'active:opacity-70' : 'opacity-40'
          }`}>
          <Text className="text-sm font-semibold text-black dark:text-white">
            {isUpdatingWeights ? 'Menyimpan…' : 'Simpan Draft'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aktifkan v${version.version_number}`}
          accessibilityState={{ disabled: !canActivate }}
          disabled={!canActivate}
          onPress={() => onActivate(version.id)}
          style={{ minHeight: 44 }}
          className={`flex-1 items-center justify-center rounded-xl bg-brand-dark px-4 py-2 ${
            canActivate ? 'active:opacity-80' : 'opacity-40'
          }`}>
          <Text className="text-sm font-semibold text-white">Aktifkan</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FormulaVersionCardReadOnly({ version }: { version: ScoreFormulaVersion }) {
  const cats = categoriesFromRaw(version.categories);
  const sum = cats.reduce((acc, c) => acc + Number(c.weight || 0), 0);
  const tone = version.status === 'active' ? 'success' : 'neutral';
  // Versioning/audit metadata (SF UI follow-up): effective_date + change_reason + tanggal aktivasi.
  // Field-field ini sudah ada di DB (migrasi 0020); di sini dirender supaya audit trail kelihatan.
  const effectiveLabel =
    version.status === 'active' && version.effective_date
      ? `Aktif sejak ${version.effective_date}`
      : version.status === 'archived' && version.effective_date
        ? `Pernah aktif sejak ${version.effective_date}`
        : null;
  const activatedLabel = version.activated_at
    ? `Diaktifkan ${version.activated_at.slice(0, 10)}`
    : null;
  return (
    <View
      className="gap-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
      accessible
      accessibilityLabel={`Versi ${version.version_number} ${FORMULA_STATUS_LABEL[version.status] ?? version.status}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-black dark:text-white">
          v{version.version_number}
        </Text>
        <Badge label={FORMULA_STATUS_LABEL[version.status] ?? version.status} tone={tone} />
      </View>
      {effectiveLabel ? (
        <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">{effectiveLabel}</Text>
      ) : null}
      {cats.length ? (
        <View className="gap-1">
          {cats.map((c) => (
            <View key={c.code} className="flex-row items-center justify-between">
              <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                {METRIC_LABEL[c.code] ?? c.code}
              </Text>
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                {c.weight}%
              </Text>
            </View>
          ))}
          <Text className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            Total: {sum}%
          </Text>
        </View>
      ) : (
        <Text className="text-xs text-neutral-400">Belum ada kategori.</Text>
      )}
      {version.change_reason ? (
        <Text className="text-[11px] italic text-neutral-500 dark:text-neutral-400">
          “{version.change_reason}”
        </Text>
      ) : null}
      {activatedLabel ? (
        <Text className="text-[11px] text-neutral-400 dark:text-neutral-500">{activatedLabel}</Text>
      ) : null}
    </View>
  );
}

function LevelChips({
  activeLevel,
  onChange,
}: {
  activeLevel: FormulaLevel;
  onChange: (level: FormulaLevel) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {LEVELS.map((l) => {
        const active = activeLevel === l.value;
        return (
          <Pressable
            key={l.value}
            accessibilityRole="tab"
            accessibilityLabel={l.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(l.value)}
            style={{ minHeight: 44 }}
            className={`items-center justify-center rounded-full px-4 py-2 ${
              active ? 'bg-brand-dark' : 'border border-neutral-300 dark:border-neutral-700'
            } active:opacity-70`}>
            <Text
              className={`text-xs font-semibold ${
                active ? 'text-white' : 'text-black dark:text-white'
              }`}>
              {l.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FormulaTemplateSection({
  templateId,
  templateName,
  templateLevel,
  canManage,
}: {
  templateId: string;
  templateName: string;
  templateLevel: string;
  canManage: boolean;
}) {
  const { versions, isLoading } = useScoreFormulaVersions(templateId);
  const { activate, createDraft, isCreatingDraft, isPending } = useFormulaActions(templateId);
  const [activeLevel, setActiveLevel] = useState<FormulaLevel>(
    (templateLevel as FormulaLevel) ?? 'staff',
  );
  const [error, setError] = useState<string | null>(null);
  const [createReason, setCreateReason] = useState('');
  const placeholderColor = usePlaceholderColor();
  const today = new Date().toISOString().slice(0, 10);

  const levelVersions = versions.filter((v) => v.level === activeLevel);
  const draftVersion = levelVersions.find((v) => v.status === 'draft');
  const otherVersions = levelVersions.filter((v) => v.status !== 'draft');

  async function handleActivate(versionId: string) {
    setError(null);
    try {
      await activate(versionId, today);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengaktifkan versi.');
    }
  }

  async function handleCreateDraft() {
    setError(null);
    if (createReason.trim().length < 8) {
      setError('Alasan minimal 8 karakter.');
      return;
    }
    try {
      await createDraft({
        templateId,
        level: activeLevel,
        changeReason: createReason.trim(),
        categories: null, // server auto-clone dari versi terbaru
      });
      setCreateReason('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal membuat draft.';
      // §6 DEC-11: 1 draft per template+level enforce
      if (/draft_already_exists/i.test(msg)) {
        setError('Sudah ada draft untuk level ini. Buka draft existing untuk edit.');
      } else {
        setError(msg);
      }
    }
  }

  return (
    <SectionCard>
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-black dark:text-white">{templateName}</Text>
        <Badge label={activeLevel} tone="neutral" />
      </View>

      <LevelChips activeLevel={activeLevel} onChange={setActiveLevel} />

      {isLoading ? (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">Memuat versi…</Text>
      ) : (
        <View className="gap-2">
          {draftVersion ? (
            canManage ? (
              <DraftEditor
                key={`${draftVersion.id}:${JSON.stringify(draftVersion.categories)}`}
                version={draftVersion}
                templateId={templateId}
                onActivate={handleActivate}
              />
            ) : (
              <FormulaVersionCardReadOnly version={draftVersion} />
            )
          ) : canManage ? (
            <View className="gap-2 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Belum ada draft untuk level <Text className="font-semibold">{activeLevel}</Text>.
                Buat draft untuk mulai mengatur bobot.
              </Text>
              <TextInput
                accessibilityLabel="Alasan pembuatan draft (min 8 karakter)"
                placeholder="Alasan pembuatan draft (min 8 karakter)…"
                placeholderTextColor={placeholderColor}
                value={createReason}
                onChangeText={setCreateReason}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-black dark:border-neutral-700 dark:text-white"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Buat Draft"
                accessibilityState={{ disabled: isCreatingDraft }}
                disabled={isCreatingDraft}
                onPress={handleCreateDraft}
                style={{ minHeight: 44 }}
                className={`items-center justify-center self-start rounded-xl bg-brand-dark px-4 py-2 ${
                  isCreatingDraft ? 'opacity-40' : 'active:opacity-80'
                }`}>
                <Text className="text-sm font-semibold text-white">
                  {isCreatingDraft ? 'Membuat…' : '+ Buat Draft'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {otherVersions.length > 0 ? (
            <View className="gap-2">
              <Text className="px-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                Riwayat versi {activeLevel}
              </Text>
              {otherVersions.map((v) => (
                <FormulaVersionCardReadOnly key={v.id} version={v} />
              ))}
            </View>
          ) : null}

          {levelVersions.length === 0 && !canManage ? (
            <Text className="text-sm text-neutral-400">Belum ada versi formula.</Text>
          ) : null}
        </View>
      )}

      {error ? (
        <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700 dark:text-red-400">
          {error}
        </Text>
      ) : null}
      {isPending && !isCreatingDraft ? (
        <Text className="text-xs text-neutral-400">Menyimpan…</Text>
      ) : null}
    </SectionCard>
  );
}

export default function SettingsScoreFormulaScreen() {
  const { profile, isLoading: profileLoading, can } = useProfile();
  const { period, isLoading: periodLoading } = useActivePeriod();
  const periodId = period?.id ?? '';
  const { override, isPending } = useScoreOverride(periodId);
  const canManage = can('manage_score_formula');
  const { templates } = useScoreFormulaTemplates();

  const [targetUserId, setTargetUserId] = useState('');
  const [manualScore, setManualScore] = useState('');
  const [reason, setReason] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  if (profileLoading) return <SkeletonCard />;

  if (!can('manage_score_formula')) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Stack.Screen options={{ title: 'Score Formula' }} />
        <Text accessibilityRole="alert" className="text-base text-neutral-600 dark:text-neutral-300">
          Anda tidak memiliki akses untuk mengelola Score Formula.
        </Text>
      </View>
    );
  }

  async function submitOverride() {
    setInlineError(null);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setInlineError('Alasan override wajib diisi.');
      return;
    }
    if (!targetUserId.trim()) {
      setInlineError('Target user wajib diisi.');
      return;
    }
    if (targetUserId.trim() === profile?.id) {
      setInlineError('Anda tidak bisa mengubah score Anda sendiri.');
      return;
    }
    const scoreNum = Number(manualScore);
    if (!Number.isFinite(scoreNum)) {
      setInlineError('Skor manual harus angka.');
      return;
    }
    if (scoreNum < 0 || scoreNum > 100) {
      setInlineError('Skor manual harus dalam rentang 0–100.');
      return;
    }
    try {
      await override({ userId: targetUserId.trim(), manualScore: scoreNum, reason: trimmedReason });
      Alert.alert('Berhasil', 'Override skor tersimpan.');
      setTargetUserId('');
      setManualScore('');
      setReason('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan override.';
      setInlineError(msg);
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Score Formula' }} />
      <View className="gap-5 p-5">
        <ScoreLegend />

        <SectionCard>
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-black dark:text-white">Periode aktif</Text>
            {period ? (
              <Badge label={FORMULA_STATUS_LABEL.active ?? 'Aktif'} tone="success" />
            ) : (
              <Badge label="—" tone="neutral" />
            )}
          </View>
          {periodLoading ? (
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">Memuat…</Text>
          ) : period ? (
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">
              {period.period_name} · {period.period_start} – {period.period_end}
            </Text>
          ) : (
            <GuidanceNote
              title="Belum ada periode skoring"
              body="Buka periode skoring agar perhitungan & override skor tersedia."
            />
          )}
        </SectionCard>

        {templates.length ? (
          <View className="gap-3">
            <Text className="px-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              Template & Versi Formula
            </Text>
            {templates.map((t) => (
              <FormulaTemplateSection
                key={t.id}
                templateId={t.id}
                templateName={t.name}
                templateLevel={t.level}
                canManage={canManage}
              />
            ))}
          </View>
        ) : null}

        <SectionCard>
          <Text className="text-base font-semibold text-black dark:text-white">
            Manual Override Skor
          </Text>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            Single-actor. Anti-self ditegakkan. Auto score tetap disimpan utuh (append-only).
          </Text>
          {!period ? (
            <EmptyState
              title="Tidak ada periode aktif"
              description="Override hanya bisa pada periode aktif."
            />
          ) : (
            <View className="gap-3">
              <LabeledInput
                label="User ID target"
                value={targetUserId}
                onChangeText={setTargetUserId}
                placeholder="uuid user"
              />
              <LabeledInput
                label="Skor manual (0-100)"
                value={manualScore}
                onChangeText={setManualScore}
                placeholder="contoh: 82"
                keyboardType="numeric"
              />
              <LabeledInput
                label="Alasan override"
                value={reason}
                onChangeText={setReason}
                placeholder="koreksi data, dll"
                multiline
              />
              {inlineError ? (
                <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {inlineError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Simpan Override"
                disabled={isPending}
                className={`min-h-[44px] items-center justify-center rounded-xl px-4 py-3 ${
                  isPending ? 'bg-neutral-300 dark:bg-neutral-700' : 'bg-brand-dark active:opacity-80'
                }`}
                onPress={submitOverride}>
                <Text className="text-base font-semibold text-white">
                  {isPending ? 'Menyimpan…' : 'Simpan Override'}
                </Text>
              </Pressable>
            </View>
          )}
        </SectionCard>
      </View>
    </ScrollView>
  );
}
