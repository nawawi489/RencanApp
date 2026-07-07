// UI #35 — User & Permission. Admin lihat anggota org → atur hak akses (toggle per key).
// Gate manage_users_permissions (server penegak akhir di set_user_permission). Default-role terkunci
// (badge "Bawaan role"). Grant/revoke butuh reason (modal in-tree, bukan Alert native — testable);
// revoke = destruktif (danger). Token DESIGN.md: brand-dark, min-h-44, warna+label.
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Avatar, Badge, Button, EmptyState, ErrorState, SkeletonList, usePlaceholderColor } from '@/components/ui';
import {
  usePermissionActions,
  useScopeActions,
  useUserPermissionScopes,
  useUserPermissionsAdmin,
} from '@/hooks/use-permissions-admin';
import { useProfile } from '@/hooks/use-profile';
import { listOrgProfiles, personLabel, type PersonRef } from '@/lib/cards';
import { alertFriendlyError, surfaceServerError } from '@/lib/errors';
import type { AdminPermissionRow } from '@/lib/permissions-admin';

type Person = NonNullable<PersonRef>;
const REASON_MAX = 500;

const SCOPE_OPTIONS: { value: 'own' | 'team' | 'dept' | 'org'; label: string }[] = [
  { value: 'own', label: 'Own' },
  { value: 'team', label: 'Tim' },
  { value: 'dept', label: 'Dept' },
  { value: 'org', label: 'Org' },
];

/** Toggle aksesibel (role=switch). Default-role → terkunci (non-interaktif).
 *  UI-S-PRM1 — scope pill selector di bawah toggle (only saat granted + not locked). */
function PermToggle({
  row,
  scope,
  onToggle,
  onScopeChange,
}: {
  row: AdminPermissionRow;
  scope: 'own' | 'team' | 'dept' | 'org';
  onToggle: () => void;
  onScopeChange: (next: 'own' | 'team' | 'dept' | 'org') => void;
}) {
  const locked = row.is_default;
  return (
    <View className="gap-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-black dark:text-white">{row.label}</Text>
          {locked ? <Badge label="Bawaan role" tone="info" /> : null}
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: row.granted, disabled: locked }}
          accessibilityLabel={row.label}
          disabled={locked}
          onPress={onToggle}
          hitSlop={10}
          className={`h-7 w-12 justify-center rounded-full px-0.5 ${
            row.granted ? 'bg-brand-dark' : 'bg-neutral-300 dark:bg-neutral-700'
          } ${locked ? 'opacity-40' : 'active:opacity-70'}`}>
          <View className={`h-6 w-6 rounded-full bg-white ${row.granted ? 'self-end' : 'self-start'}`} />
        </Pressable>
      </View>
      {row.granted && !locked ? (
        <View>
          <Text className="px-1 pb-1 text-[10px] font-semibold uppercase text-neutral-500 dark:text-neutral-400">Scope</Text>
          <View
            className="flex-row gap-1"
            accessibilityRole="radiogroup"
            accessibilityLabel={`Scope untuk ${row.label}`}>
            {SCOPE_OPTIONS.map((opt) => {
              const active = scope === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Scope ${opt.label}`}
                  onPress={() => !active && onScopeChange(opt.value)}
                  className={`min-h-[44px] flex-1 items-center justify-center rounded-full px-2 ${
                    active ? 'bg-brand-dark' : 'border border-neutral-300 dark:border-neutral-700'
                  } active:opacity-70`}>
                  <Text
                    className={`text-xs font-semibold ${
                      active ? 'text-white' : 'text-black dark:text-white'
                    }`}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

type PendingChange = { row: AdminPermissionRow; next: boolean };

export default function SettingsPermissionUsersScreen() {
  const { profile, isLoading: profileLoading, can } = useProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState('');
  const placeholderColor = usePlaceholderColor();
  const [modalError, setModalError] = useState<string | null>(null);

  const { data: profiles, isLoading: membersLoading, isError: membersError, refetch } = useQuery({
    queryKey: ['org-profiles'],
    queryFn: listOrgProfiles,
  });
  const { rows, isLoading: permsLoading, isError: permsError } = useUserPermissionsAdmin(selectedId ?? '');
  const { scopes } = useUserPermissionScopes(selectedId ?? '');
  const { setPermission, isPending } = usePermissionActions(profile?.id ?? null);
  const { setScope } = useScopeActions();

  if (profileLoading) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'User & Permission' }} />
        <SkeletonList count={4} />
      </View>
    );
  }

  if (!can('manage_users_permissions')) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'User & Permission' }} />
        <AccessDenied message="Hanya pemegang izin Kelola User & Permission yang dapat membuka bagian ini." />
      </View>
    );
  }

  const members = ((profiles ?? []) as Person[]).filter((p) => p.id !== profile?.id);
  const selected = members.find((p) => p.id === selectedId) ?? null;

  function openConfirm(row: AdminPermissionRow) {
    setReason('');
    setModalError(null);
    setPending({ row, next: !row.granted });
  }

  async function confirmChange() {
    if (!pending || !selectedId) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setModalError('Alasan perubahan hak akses wajib diisi.');
      return;
    }
    setModalError(null);
    try {
      await setPermission({
        targetUserId: selectedId,
        permissionKey: pending.row.key,
        granted: pending.next,
        reason: trimmed,
      });
      setPending(null);
      setReason('');
    } catch (e) {
      setModalError(surfaceServerError('Ubah hak akses', e, 'Gagal menyimpan perubahan hak akses.'));
    }
  }

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ title: 'User & Permission' }} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        {!selected ? (
          // ----- Daftar anggota
          <View className="gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold text-black dark:text-white">User & Permission</Text>
              <Text className="text-base text-neutral-500 dark:text-neutral-400">
                Pilih anggota untuk mengatur hak akses. Perubahan tercatat di Activity Log.
              </Text>
            </View>
            {membersLoading ? (
              <SkeletonList count={5} />
            ) : membersError ? (
              <ErrorState
                title="Gagal memuat anggota"
                description="Tidak bisa mengambil daftar anggota organisasi."
                onRetry={() => refetch()}
              />
            ) : members.length === 0 ? (
              <EmptyState
                icon={<Text className="text-2xl">👥</Text>}
                title="Belum ada pengguna lain untuk dikelola"
                description="Anggota organisasi selain Anda akan muncul di sini."
              />
            ) : (
              members.map((p) => (
                <Pressable
                  key={p.id}
                  className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4 active:opacity-70 dark:border-neutral-800"
                  accessibilityRole="button"
                  accessibilityLabel={`Atur hak akses ${personLabel(p)}`}
                  onPress={() => setSelectedId(p.id)}>
                  <Avatar name={personLabel(p)} seed={p.id} />
                  <View className="flex-1">
                    <Text className="text-base font-bold text-black dark:text-white" numberOfLines={1}>
                      {personLabel(p)}
                    </Text>
                    {p.email ? (
                      <Text className="text-xs text-neutral-400" numberOfLines={1}>
                        {p.email}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-lg text-neutral-400">›</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : (
          // ----- Editor hak akses per user
          <View className="gap-5">
            <Pressable
              className="min-h-[44px] flex-row items-center gap-2 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Kembali ke daftar anggota"
              onPress={() => setSelectedId(null)}>
              <Text className="text-base text-brand-dark">‹ Daftar anggota</Text>
            </Pressable>

            <View className="flex-row items-center gap-3">
              <Avatar name={personLabel(selected)} seed={selected.id} size={52} />
              <View className="flex-1">
                <Text className="text-xl font-bold text-black dark:text-white" numberOfLines={1}>
                  {personLabel(selected)}
                </Text>
                {selected.email ? (
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                    {selected.email}
                  </Text>
                ) : null}
              </View>
            </View>

            {permsLoading ? (
              <SkeletonList count={5} />
            ) : permsError ? (
              <ErrorState
                title="Gagal memuat hak akses"
                description="Tidak bisa mengambil hak akses anggota ini."
              />
            ) : (
              <View className="gap-2">
                {rows.map((row) => (
                  <PermToggle
                    key={row.key}
                    row={row}
                    scope={(scopes[row.key] as 'own' | 'team' | 'dept' | 'org') ?? 'org'}
                    onToggle={() => openConfirm(row)}
                    onScopeChange={(next) =>
                      selectedId &&
                      setScope({ targetUserId: selectedId, permissionKey: row.key, scope: next }).catch(
                        (e: unknown) =>
                          alertFriendlyError('Gagal scope', e, 'Kesalahan.'),
                      )
                    }
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ----- Modal konfirmasi (in-tree) reason wajib; revoke = danger ----- */}
      {pending ? (
        <View className="absolute inset-0 items-center justify-center bg-black/40 p-6">
          <View
            className="w-full gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-900"
            accessibilityViewIsModal>
            <Text className="text-lg font-bold text-black dark:text-white">
              {pending.next ? 'Beri Hak Akses' : 'Cabut Hak Akses'}
            </Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              {pending.next ? 'Memberikan' : 'Mencabut'} &ldquo;{pending.row.label}&rdquo; untuk{' '}
              {selected ? personLabel(selected) : 'anggota ini'}.
            </Text>
            <View className="gap-1.5">
              <Text className="text-sm font-medium text-black dark:text-white">
                Alasan <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className="h-20 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
                accessibilityLabel="Alasan"
                placeholder="mis. dibutuhkan untuk koordinasi lintas tim"
                placeholderTextColor={placeholderColor}
                value={reason}
                onChangeText={(t) => setReason(t.slice(0, REASON_MAX))}
                multiline
                textAlignVertical="top"
              />
              <Text className="self-end text-xs text-neutral-400">
                {reason.length}/{REASON_MAX}
              </Text>
            </View>
            {modalError ? (
              <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700 dark:text-red-400">
                {modalError}
              </Text>
            ) : null}
            <View className="gap-2">
              <Button
                label={pending.next ? 'Konfirmasi' : 'Cabut'}
                variant={pending.next ? 'primary' : 'danger'}
                loading={isPending}
                disabled={isPending}
                onPress={confirmChange}
              />
              <Button
                label="Batal"
                variant="secondary"
                onPress={() => {
                  setPending(null);
                  setReason('');
                  setModalError(null);
                }}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
