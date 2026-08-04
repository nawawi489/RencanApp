// PRD V1.83 §19 — Strategy Template Library CRUD.
// Admin dapat membuat, mengedit, menonaktifkan, dan menghapus template.
// Update template tidak otomatis mengubah Strategy aktif.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Platform } from 'react-native';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccessDenied } from '@/components/access-denied';
import {
  Badge,
  Button,
  EmptyState,
  SectionCard,
  SkeletonList,
  usePlaceholderColor,
} from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { showAlert } from '@/lib/alert';
import {
  createStrategyTemplate,
  deleteStrategyTemplate,
  listAllStrategyTemplates,
  listGoalTemplates,
  updateStrategyTemplate,
  type GoalTemplate,
  type NewStrategyTemplate,
  type StrategyTemplateWithParent,
} from '@/lib/goals';
import { surfaceServerError } from '@/lib/errors';

type FormData = {
  name: string;
  division: string;
  division_label: string;
  target_hint: string;
  expected_outcome_hint: string;
  goal_template_id: string;
};

const EMPTY_FORM: FormData = {
  name: '',
  division: '',
  division_label: '',
  target_hint: '',
  expected_outcome_hint: '',
  goal_template_id: '',
};

export default function SettingsStrategyTemplatesScreen() {
  const { can } = useProfile();
  const allowed = can('manage_kpi_area_templates') || can('manage_goal_templates');
  const insets = useSafeAreaInsets();
  const placeholderColor = usePlaceholderColor();
  const [q, setQ] = useState('');
  const qc = useQueryClient();

  // ------ data
  const tplQ = useQuery({
    queryKey: ['strategy_templates', 'all'],
    queryFn: listAllStrategyTemplates,
    enabled: allowed,
  });

  const goalTplQ = useQuery({
    queryKey: ['goal_templates'],
    queryFn: listGoalTemplates,
    enabled: allowed,
  });

  // ------ modal state
  const [editing, setEditing] = useState<StrategyTemplateWithParent | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    const firstGt = goalTplQ.data?.[0];
    setForm({ ...EMPTY_FORM, goal_template_id: firstGt?.id ?? '' });
    setEditing(null);
    setFormError(null);
    setCreating(true);
  }

  function openEdit(tpl: StrategyTemplateWithParent) {
    setForm({
      name: tpl.name,
      division: tpl.division,
      division_label: tpl.division_label,
      target_hint: tpl.target_hint ?? '',
      expected_outcome_hint: tpl.expected_outcome_hint ?? '',
      goal_template_id: tpl.goal_template_id,
    });
    setEditing(tpl);
    setFormError(null);
    setCreating(true);
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  }

  // ------ mutations
  const invalidate = () => qc.invalidateQueries({ queryKey: ['strategy_templates'] });

  const createM = useMutation({
    mutationFn: (input: NewStrategyTemplate) => createStrategyTemplate(input),
    onSuccess: () => { invalidate(); closeModal(); },
  });

  const updateM = useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof updateStrategyTemplate>[1] }) =>
      updateStrategyTemplate(args.id, args.patch),
    onSuccess: () => { invalidate(); closeModal(); },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteStrategyTemplate(id),
    onSuccess: invalidate,
  });

  const toggleM = useMutation({
    mutationFn: (args: { id: string; is_active: boolean }) =>
      updateStrategyTemplate(args.id, { is_active: args.is_active }),
    onSuccess: invalidate,
  });

  function handleSave() {
    setFormError(null);
    if (!form.name.trim()) { setFormError('Nama wajib diisi.'); return; }
    if (!form.division.trim()) { setFormError('Kode divisi wajib diisi.'); return; }
    if (!form.division_label.trim()) { setFormError('Label divisi wajib diisi.'); return; }
    if (!form.goal_template_id) { setFormError('Goal Template wajib dipilih.'); return; }

    if (editing) {
      updateM.mutate(
        { id: editing.id, patch: {
          name: form.name.trim(),
          division: form.division.trim(),
          division_label: form.division_label.trim(),
          target_hint: form.target_hint.trim() || null,
          expected_outcome_hint: form.expected_outcome_hint.trim() || null,
        }},
        { onError: (e) => setFormError(surfaceServerError('Simpan', e, 'Gagal menyimpan perubahan.')) },
      );
    } else {
      createM.mutate(
        {
          goal_template_id: form.goal_template_id,
          name: form.name.trim(),
          division: form.division.trim(),
          division_label: form.division_label.trim(),
          target_hint: form.target_hint.trim() || null,
          expected_outcome_hint: form.expected_outcome_hint.trim() || null,
        },
        { onError: (e) => setFormError(surfaceServerError('Buat', e, 'Gagal membuat template.')) },
      );
    }
  }

  function confirmDelete(tpl: StrategyTemplateWithParent) {
    showAlert(
      'Hapus Template',
      `Hapus "${tpl.name}"? Template yang sudah dipakai Strategy aktif tidak terpengaruh.`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: () => deleteM.mutate(tpl.id) },
      ],
    );
  }

  // ------ filtered + grouped
  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (tplQ.data ?? []).filter((r) => {
      if (!needle) return true;
      const hay = `${r.name ?? ''} ${r.goal_templates?.name ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
    const map = new Map<string, { parent: { id: string; name: string } | null; rows: StrategyTemplateWithParent[] }>();
    for (const r of filtered) {
      const key = r.goal_template_id ?? 'orphan';
      const slot = map.get(key) ?? { parent: r.goal_templates, rows: [] };
      slot.rows.push(r);
      map.set(key, slot);
    }
    return Array.from(map.entries());
  }, [tplQ.data, q]);

  const isPending = createM.isPending || updateM.isPending;

  return (
    <>
      <ScrollView
        className="flex-1 bg-neutral-50 dark:bg-black"
        keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Strategi Template' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Strategi Template</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Library Strategi siap pakai. Admin dapat membuat, mengedit, dan menonaktifkan template.
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Pengelolaan Strategi Template memerlukan izin Goal/Strategi Template." />
        ) : tplQ.isLoading ? (
          <SkeletonList count={5} />
        ) : (
          <>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <TextInput
                  accessibilityLabel="Cari Strategi Template"
                  placeholder="Cari nama Strategi atau Goal Template…"
                  placeholderTextColor={placeholderColor}
                  value={q}
                  onChangeText={setQ}
                  className="min-h-[44px] rounded-xl border border-neutral-300 px-4 text-base text-black dark:border-neutral-700 dark:text-white"
                />
              </View>
              <Button
                label="+ Buat"
                accessibilityLabel="Buat Strategy Template"
                onPress={openCreate}
              />
            </View>

            {grouped.length === 0 ? (
              <EmptyState
                title="Belum ada Strategy Template"
                description="Admin dapat membuat template custom nanti. User tetap bisa membuat Strategy manual tanpa template."
                action={{ label: 'Buat Strategy Template', onPress: openCreate }}
              />
            ) : (
              grouped.map(([key, slot]) => (
                <View key={key} className="gap-2">
                  <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                    Goal Template · {slot.parent?.name ?? 'Tanpa parent'}
                  </Text>
                  {slot.rows.map((r) => (
                    <TemplateRow
                      key={r.id}
                      tpl={r}
                      onEdit={() => openEdit(r)}
                      onToggle={() => toggleM.mutate({ id: r.id, is_active: !(r as any).is_active })}
                      onDelete={() => confirmDelete(r)}
                    />
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </View>
      </ScrollView>

      {/* Create / Edit modal */}
      <Modal
        visible={creating}
        animationType="slide"
        transparent
        onRequestClose={closeModal}>
        {/* KAV lives INSIDE the Modal: RN renders a Modal into its own native window,
            so a KAV that is only a React-tree ancestor pads the invisible screen behind
            the sheet. max-h-[88%] + inner ScrollView keep Save reachable while typing. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/40"
          keyboardVerticalOffset={0}>
          <View
            className="max-h-[88%] gap-3 rounded-t-3xl bg-white p-5 dark:bg-neutral-900"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            accessibilityLabel={editing ? 'Modal edit template' : 'Modal buat template'}
            accessibilityViewIsModal>
            <Text className="text-lg font-bold text-black dark:text-white">
              {editing ? 'Edit Strategy Template' : 'Buat Strategy Template'}
            </Text>

            <ScrollView className="grow-0" keyboardShouldPersistTaps="handled">
              <View className="gap-3">
                {!editing && (
                  <GoalTemplatePicker
                    templates={goalTplQ.data ?? []}
                    selected={form.goal_template_id}
                    onChange={(id) => setForm((f) => ({ ...f, goal_template_id: id }))}
                  />
                )}

                <Field
                  label="Nama"
                  value={form.name}
                  onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="mis. Sales Revenue"
                  placeholderColor={placeholderColor}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Field
                      label="Kode Divisi"
                      value={form.division}
                      onChange={(v) => setForm((f) => ({ ...f, division: v }))}
                      placeholder="mis. sales"
                      placeholderColor={placeholderColor}
                    />
                  </View>
                  <View className="flex-1">
                    <Field
                      label="Label Divisi"
                      value={form.division_label}
                      onChange={(v) => setForm((f) => ({ ...f, division_label: v }))}
                      placeholder="mis. Sales"
                      placeholderColor={placeholderColor}
                    />
                  </View>
                </View>
                <Field
                  label="Hint Target (opsional)"
                  value={form.target_hint}
                  onChange={(v) => setForm((f) => ({ ...f, target_hint: v }))}
                  placeholder="mis. Rp 500 juta/bulan"
                  placeholderColor={placeholderColor}
                />
                <Field
                  label="Hint Outcome (opsional)"
                  value={form.expected_outcome_hint}
                  onChange={(v) => setForm((f) => ({ ...f, expected_outcome_hint: v }))}
                  placeholder="mis. Peningkatan penjualan 20%"
                  placeholderColor={placeholderColor}
                />

                {formError && (
                  <Text className="text-sm text-red-600 dark:text-red-400">{formError}</Text>
                )}
              </View>
            </ScrollView>

            <View className="flex-row gap-2">
              <Button grow label="Batal" variant="secondary" onPress={closeModal} />
              <Button
                grow
                label={editing ? 'Simpan' : 'Buat'}
                onPress={handleSave}
                loading={isPending}
                disabled={isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- sub-components

function TemplateRow({
  tpl,
  onEdit,
  onToggle,
  onDelete,
}: {
  tpl: StrategyTemplateWithParent;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isActive = tpl.is_active !== false;
  return (
    <SectionCard>
      <View className="flex-row items-center gap-2">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              className={`text-base font-semibold ${isActive ? 'text-black dark:text-white' : 'text-neutral-400 line-through'}`}
              numberOfLines={1}>
              {tpl.name}
            </Text>
            {!isActive && <Badge label="Nonaktif" tone="neutral" />}
          </View>
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            Divisi: {tpl.division_label || tpl.division}
            {tpl.target_hint ? ` · ${tpl.target_hint}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isActive ? `Nonaktifkan ${tpl.name}` : `Aktifkan ${tpl.name}`}
          className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70"
          onPress={onToggle}>
          <Text className="text-lg">{isActive ? '✅' : '⏸️'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${tpl.name}`}
          className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70"
          onPress={onEdit}>
          <Text className="text-lg">✏️</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Hapus ${tpl.name}`}
          className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70"
          onPress={onDelete}>
          <Text className="text-lg">🗑️</Text>
        </Pressable>
      </View>
    </SectionCard>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  placeholderColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  placeholderColor: string;
}) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        className="min-h-[44px] rounded-xl border border-neutral-300 px-4 text-base text-black dark:border-neutral-700 dark:text-white"
      />
    </View>
  );
}

function GoalTemplatePicker({
  templates,
  selected,
  onChange,
}: {
  templates: GoalTemplate[];
  selected: string;
  onChange: (id: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <Text className="text-sm text-amber-600 dark:text-amber-400">
        Belum ada Goal Template. Buat Goal Template dulu sebelum membuat Strategy Template.
      </Text>
    );
  }
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">Goal Template</Text>
      <View className="flex-row flex-wrap gap-2">
        {templates.map((gt) => (
          <Pressable
            key={gt.id}
            accessibilityRole="button"
            accessibilityLabel={`Pilih ${gt.name}`}
            accessibilityState={{ selected: selected === gt.id }}
            className={`min-h-[44px] items-center justify-center rounded-xl border px-4 py-2 ${
              selected === gt.id
                ? 'border-brand bg-brand/10 dark:border-brand-light dark:bg-brand-light/10'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
            onPress={() => onChange(gt.id)}>
            <Text
              className={`text-sm font-semibold ${
                selected === gt.id
                  ? 'text-brand dark:text-brand-light'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}>
              {gt.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
