// Fase 8 — Settings > Governance Violation. Gated view_governance_violation.
// UI-S-GV1: aksi "Selesaikan" + Resolution Note (≥8 char) + "Lihat entity" link + filter
// resolution_status. Migrasi 0022 menambahkan kolom resolution_* + RPC resolve_governance_violation.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, TextInput } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Badge, Button, EmptyState, ErrorState, SectionCard, SkeletonList, TabBar, usePlaceholderColor } from '@/components/ui';
import {
  GOVERNANCE_VIOLATION_SEVERITY_LABEL,
  GOVERNANCE_VIOLATION_SEVERITY_TONE,
  governanceViolationTypeLabel,
} from '@/lib/activity-governance';
import { useGovernanceViolations } from '@/hooks/use-activity-governance';
import { useProfile } from '@/hooks/use-profile';
import { alertFriendlyError } from '@/lib/errors';
import { resolveGovernanceViolation, type CardEntityType } from '@/lib/governance-admin';
import { ENTITY_ROUTE_SEGMENT } from '@/lib/entity-routes';

const STATUS_LABEL: Record<string, string> = {
  open: 'Belum diselesaikan',
  resolved: 'Selesai',
  dismissed: 'Diabaikan',
};

const STATUS_CHIPS: { key: 'semua' | 'open' | 'resolved' | 'dismissed'; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'open', label: 'Terbuka' },
  { key: 'resolved', label: 'Selesai' },
  { key: 'dismissed', label: 'Diabaikan' },
];

export default function SettingsGovernanceViolationScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useProfile();
  const { violations, isLoading, isError, refetch } = useGovernanceViolations();
  const allowed = can('view_governance_violation');

  const [statusChip, setStatusChip] = useState<'semua' | 'open' | 'resolved' | 'dismissed'>('open');
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const placeholderColor = usePlaceholderColor();

  const resolveM = useMutation({
    mutationFn: (args: { id: string; note: string; status: 'resolved' | 'dismissed' }) =>
      resolveGovernanceViolation(args.id, args.note, args.status),
    onSuccess: () => {
      setResolveTarget(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['governance_violations'] });
    },
    onError: (e) => alertFriendlyError('Gagal', e, 'Kesalahan.'),
  });

  const filtered = useMemo(() => {
    if (statusChip === 'semua') return violations;
    const v = violations as Array<typeof violations[number] & { resolution_status?: string | null }>;
    return v.filter((x) => (x.resolution_status ?? 'open') === statusChip);
  }, [violations, statusChip]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
      keyboardVerticalOffset={0}>
      <ScrollView
        className="flex-1 bg-neutral-50 dark:bg-black"
        keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Pelanggaran Tata Kelola' }} />
      <View className="gap-3 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Pelanggaran Tata Kelola</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Pelanggaran guard-rail sistem yang tercatat.
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Pelanggaran Tata Kelola hanya untuk pemegang izin Lihat Governance Violation." />
        ) : isLoading ? (
          <SkeletonList count={5} />
        ) : isError ? (
          // S4-6 — dulu fetch error jatuh ke render list kosong (default `violations = []`)
          // → admin bisa mengira semua bersih.
          <ErrorState
            title="Gagal memuat pelanggaran"
            description="Tidak bisa mengambil daftar pelanggaran governance. Periksa koneksi lalu coba lagi."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            <TabBar tabs={STATUS_CHIPS} active={statusChip} onChange={setStatusChip} />

            {filtered.length === 0 ? (
              <EmptyState
                title="Tidak ada pelanggaran"
                description={statusChip === 'semua' ? 'Belum ada catatan pelanggaran.' : `Tidak ada pelanggaran berstatus ${STATUS_LABEL[statusChip]}.`}
              />
            ) : (
              filtered.map((v) => {
                const sev = v.severity ?? 'low';
                const status = (v as typeof v & { resolution_status?: string }).resolution_status ?? 'open';
                const isOpen = status === 'open';
                const entityType = v.entity_type ?? '';
                const segment = ENTITY_ROUTE_SEGMENT[entityType as CardEntityType];
                const entityRoute = segment ? `/${segment}` : undefined;
                return (
                  <SectionCard key={v.id}>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-base font-semibold text-black dark:text-white">
                        {governanceViolationTypeLabel(v.violation_type)}
                      </Text>
                      <View className="flex-row items-center gap-1.5">
                        <Badge
                          label={GOVERNANCE_VIOLATION_SEVERITY_LABEL[sev] ?? sev}
                          tone={GOVERNANCE_VIOLATION_SEVERITY_TONE[sev] ?? 'neutral'}
                        />
                        {!isOpen ? <Badge label={STATUS_LABEL[status] ?? status} tone="success" /> : null}
                      </View>
                    </View>
                    {entityType ? (
                      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                        {entityType}
                      </Text>
                    ) : null}
                    {(v as typeof v & { resolution_note?: string | null }).resolution_note ? (
                      <Text className="text-xs italic text-neutral-500 dark:text-neutral-400">
                        Catatan: {(v as typeof v & { resolution_note: string }).resolution_note}
                      </Text>
                    ) : null}
                    <View className="flex-row items-center gap-2">
                      {entityRoute && v.entity_id ? (
                        <Button
                          label="Lihat entity"
                          variant="secondary"
                          onPress={() => router.push(`${entityRoute}/${v.entity_id}` as Href)}
                        />
                      ) : null}
                      {isOpen ? (
                        <Button
                          label="Selesaikan"
                          onPress={() => {
                            setResolveTarget(v.id);
                            setNote('');
                          }}
                        />
                      ) : null}
                    </View>
                  </SectionCard>
                );
              })
            )}
          </>
        )}
      </View>

      {/* Resolution modal */}
      <Modal
        visible={resolveTarget !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setResolveTarget(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View
            className="gap-3 rounded-t-3xl bg-white p-5 dark:bg-neutral-900"
            accessibilityLabel="Modal selesaikan pelanggaran"
            accessibilityViewIsModal>
            <Text className="text-lg font-bold text-black dark:text-white">Selesaikan Pelanggaran</Text>
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">
              Tulis catatan penyelesaian (≥ 8 karakter). Aksi ini tercatat di Activity Log.
            </Text>
            <TextInput
              accessibilityLabel="Catatan penyelesaian"
              value={note}
              onChangeText={setNote}
              placeholder="mis. Sudah konfirmasi PIC + revisi target."
              placeholderTextColor={placeholderColor}
              multiline
              className="min-h-[100px] rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
            />
            <View className="flex-row gap-2">
              <Button
                label="Batal"
                variant="secondary"
                onPress={() => setResolveTarget(null)}
              />
              <Button
                label="Diabaikan"
                variant="secondary"
                loading={resolveM.isPending}
                onPress={() =>
                  resolveTarget &&
                  resolveM.mutate({ id: resolveTarget, note: note.trim(), status: 'dismissed' })
                }
              />
              <Button
                label="Tandai Selesai"
                loading={resolveM.isPending}
                disabled={note.trim().length < 8 || resolveM.isPending}
                onPress={() =>
                  resolveTarget &&
                  resolveM.mutate({ id: resolveTarget, note: note.trim(), status: 'resolved' })
                }
              />
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
