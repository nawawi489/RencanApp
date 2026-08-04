// UI #35 — User & Permission. Admin lihat anggota org → atur hak akses (toggle per key).
// Gate manage_users_permissions (server penegak akhir di set_user_permission). Default-role terkunci
// (badge "Bawaan role"). Grant/revoke butuh reason (modal in-tree, bukan Alert native — testable);
// revoke = destruktif (danger). Token DESIGN.md: brand-dark, min-h-44, warna+label.
//
// S4-4 (nonaktifkan pengguna) + S4-5 (penugasan ulang role) menempel di panel
// detail pengguna yang sama — dua kapabilitas operator ini tak butuh layar
// tersendiri dan konsumennya identik.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform } from 'react-native';
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
import { useThemedIcon } from '@/providers/theme-provider';
import { useRoleTemplates } from '@/hooks/use-org-structure';
import { listOrgProfilesAdmin, personLabel, type OrgProfileAdminRow } from '@/lib/cards';
import { alertFriendlyError, surfaceServerError } from '@/lib/errors';
import type { AdminPermissionRow } from '@/lib/permissions-admin';
import { setUserActive, updateUserRole } from '@/lib/users-admin';

type Person = OrgProfileAdminRow;
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
  const router = useRouter();
  const { profile, isLoading: profileLoading, can } = useProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState('');
  const placeholderColor = usePlaceholderColor();
  const [modalError, setModalError] = useState<string | null>(null);
  const mutedIcon = useThemedIcon('#6b7280', '#a3a3a3');
  const brandIcon = useThemedIcon('#1564b3', '#93c5fd');

  const { data: profiles, isLoading: membersLoading, isError: membersError, refetch } = useQuery({
    queryKey: ['org-profiles-admin'],
    queryFn: () => listOrgProfilesAdmin(),
  });
  const { rows, isLoading: permsLoading, isError: permsError, refetch: refetchPerms } = useUserPermissionsAdmin(selectedId ?? '');
  const { scopes } = useUserPermissionScopes(selectedId ?? '');
  const { setPermission, isPending } = usePermissionActions(profile?.id ?? null);
  const { setScope } = useScopeActions();
  const { roleTemplates } = useRoleTemplates();
  const qc = useQueryClient();

  // S4-4 — modal konfirmasi nonaktifkan/aktifkan; S4-5 — modal pilih role.
  const [pendingActive, setPendingActive] = useState<{ next: boolean } | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const activeM = useMutation({
    mutationFn: (args: { targetId: string; active: boolean }) =>
      setUserActive(args.targetId, args.active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-profiles-admin'] });
      qc.invalidateQueries({ queryKey: ['org-profiles'] });
      setPendingActive(null);
    },
    onError: (e) => alertFriendlyError('Gagal', e, 'Perubahan status pengguna gagal.'),
  });
  const roleM = useMutation({
    mutationFn: (args: { targetId: string; roleTemplateId: string }) =>
      updateUserRole(args.targetId, args.roleTemplateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-profiles-admin'] });
      qc.invalidateQueries({ queryKey: ['profile', selectedId] });
      setPendingRoleId(null);
      setRolePickerOpen(false);
    },
    onError: (e) => alertFriendlyError('Gagal', e, 'Perubahan role gagal.'),
  });

  // Daftar org bisa sepanjang headcount — memo supaya filter tak jalan ulang tiap
  // render dan identitas array stabil untuk FlatList (UI #35 dulu .map() unvirtualized).
  const members = useMemo(
    () => ((profiles ?? []) as Person[]).filter((p) => p.id !== profile?.id),
    [profiles, profile?.id],
  );

  // renderItem stabil (setSelectedId setter identitasnya tetap) → baris tak remount tiap render.
  const renderMember = useCallback(
    ({ item: p }: { item: Person }) => (
      <Pressable
        className={`flex-row items-center gap-3 rounded-2xl border p-4 active:opacity-70 ${p.is_active ? 'border-neutral-200 dark:border-neutral-800' : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950'}`}
        accessibilityRole="button"
        accessibilityLabel={`Atur hak akses ${personLabel(p)}${p.is_active ? '' : ' (nonaktif)'}`}
        onPress={() => setSelectedId(p.id)}>
        <Avatar name={personLabel(p)} seed={p.id} />
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text
              className={`flex-1 text-base font-bold ${p.is_active ? 'text-black dark:text-white' : 'text-neutral-500 dark:text-neutral-500'}`}
              numberOfLines={1}>
              {personLabel(p)}
            </Text>
            {p.is_active ? null : <Badge label="Nonaktif" tone="warn" />}
          </View>
          {p.email ? (
            <Text className="text-xs text-neutral-400" numberOfLines={1}>
              {p.email}
            </Text>
          ) : null}
          {p.role_name ? (
            <Text className="text-xs text-neutral-500 dark:text-neutral-500" numberOfLines={1}>
              {p.role_name}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={mutedIcon} />
      </Pressable>
    ),
    [mutedIcon],
  );

  if (profileLoading) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Pengguna & Hak Akses' }} />
        <SkeletonList count={4} />
      </View>
    );
  }

  if (!can('manage_users_permissions')) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Pengguna & Hak Akses' }} />
        <AccessDenied message="Hanya pemegang izin Kelola User & Permission yang dapat membuka bagian ini." />
      </View>
    );
  }

  const selected = members.find((p) => p.id === selectedId) ?? null;

  // Header daftar anggota — dipakai sebagai ListHeaderComponent FlatList maupun di
  // atas state loading/error (agar tombol Tambah User selalu terjangkau).
  const listHeader = (
    <View className="gap-5">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Pengguna & Hak Akses</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Pilih anggota untuk mengatur hak akses. Perubahan tercatat di Activity Log.
        </Text>
      </View>
      {/* PRD §39: akun dibuat admin (invite-only) — entry point pembuatan akun baru. */}
      <Button
        label="Tambah User"
        accessibilityLabel="Tambah User baru"
        onPress={() => router.push('/settings-user-new' as Href)}
      />
    </View>
  );

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white dark:bg-black"
      keyboardVerticalOffset={0}>
      <Stack.Screen options={{ title: 'Pengguna & Hak Akses' }} />
      {!selected ? (
        // ----- Daftar anggota. Satu FlatList = scroll container (F3: virtualisasi +
        // hindari VirtualizedList-di-dalam-ScrollView). Header (judul + Tambah User)
        // tetap ter-mount lintas transisi loading→loaded — kalau loading & loaded
        // dipisah jadi dua pohon, node tombol ter-unmount di tengah dan handle
        // yang sudah dipegang test/press jadi basi.
        <FlatList<Person>
          data={membersLoading || membersError ? [] : members}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 20, gap: 20 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            membersLoading ? (
              <SkeletonList count={5} />
            ) : membersError ? (
              <ErrorState
                title="Gagal memuat anggota"
                description="Tidak bisa mengambil daftar anggota organisasi."
                onRetry={() => refetch()}
              />
            ) : (
              <EmptyState
                icon={<Ionicons name="people-outline" size={28} color={mutedIcon} />}
                title="Belum ada pengguna lain untuk dikelola"
                description="Anggota organisasi selain Anda akan muncul di sini."
              />
            )
          }
          renderItem={renderMember}
        />
      ) : (
        // ----- Editor hak akses per user
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 20 }}
          keyboardShouldPersistTaps="handled">
          <View className="gap-5">
            <Pressable
              className="min-h-[44px] flex-row items-center gap-2 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Kembali ke daftar anggota"
              onPress={() => setSelectedId(null)}>
              <Ionicons name="chevron-back" size={18} color={brandIcon} />
              <Text className="text-base text-brand-dark">Daftar anggota</Text>
            </Pressable>

            <View className="flex-row items-center gap-3">
              <Avatar name={personLabel(selected)} seed={selected.id} size={52} />
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text
                    className="flex-1 text-xl font-bold text-black dark:text-white"
                    numberOfLines={1}>
                    {personLabel(selected)}
                  </Text>
                  {selected.is_active ? null : <Badge label="Nonaktif" tone="warn" />}
                </View>
                {selected.email ? (
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                    {selected.email}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* S4-4 + S4-5 — kapabilitas operator: nonaktifkan akun (offboarding) &
                pindahkan role (promosi/demosi). Server tolak self-target dan cakupan
                lintas-org; UI hanya menampilkan tombol + minta konfirmasi via modal. */}
            <View className="gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold text-black dark:text-white">
                    Status akun
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    {selected.is_active
                      ? 'Aktif — bisa login dan mengakses workspace.'
                      : 'Nonaktif — login diblokir; data tetap terjaga untuk riwayat.'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: selected.is_active }}
                  accessibilityLabel="Aktifkan akun"
                  onPress={() =>
                    setPendingActive({ next: !selected.is_active })
                  }
                  hitSlop={10}
                  className={`h-7 w-12 justify-center rounded-full px-0.5 active:opacity-70 ${
                    selected.is_active ? 'bg-brand-dark' : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}>
                  <View
                    className={`h-6 w-6 rounded-full bg-white ${selected.is_active ? 'self-end' : 'self-start'}`}
                  />
                </Pressable>
              </View>
              <View className="h-px bg-neutral-200 dark:bg-neutral-800" />
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold text-black dark:text-white">Role</Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    {selected.role_name ?? 'Belum ada role'}
                  </Text>
                </View>
                <Button
                  label="Ubah"
                  variant="secondary"
                  onPress={() => {
                    setPendingRoleId(selected.role_template_id);
                    setRolePickerOpen(true);
                  }}
                />
              </View>
            </View>

            {permsLoading ? (
              <SkeletonList count={5} />
            ) : permsError ? (
              <ErrorState
                title="Gagal memuat hak akses"
                description="Tidak bisa mengambil hak akses anggota ini."
                onRetry={() => refetchPerms()}
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
        </ScrollView>
      )}

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
                Alasan <Text className="text-red-700 dark:text-red-400">*</Text>
              </Text>
              <TextInput
                className="h-20 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
                accessibilityLabel="Alasan wajib"
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

      {/* S4-4 — konfirmasi aktifkan/nonaktifkan akun. Tidak perlu reason (bukan perubahan
          hak akses, cuma flip is_active). Server tolak self-deactivate. */}
      {pendingActive && selected ? (
        <View className="absolute inset-0 items-center justify-center bg-black/40 p-6">
          <View
            className="w-full gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-900"
            accessibilityViewIsModal>
            <Text className="text-lg font-bold text-black dark:text-white">
              {pendingActive.next ? 'Aktifkan akun' : 'Nonaktifkan akun'}
            </Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              {pendingActive.next
                ? `${personLabel(selected)} akan bisa login dan mengakses workspace lagi.`
                : `${personLabel(selected)} tidak akan bisa login. Data card & log tetap terjaga (nonaktif ≠ hapus).`}
            </Text>
            <View className="gap-2">
              <Button
                label={pendingActive.next ? 'Aktifkan' : 'Nonaktifkan'}
                variant={pendingActive.next ? 'primary' : 'danger'}
                loading={activeM.isPending}
                disabled={activeM.isPending}
                onPress={() =>
                  activeM.mutate({ targetId: selected.id, active: pendingActive.next })
                }
              />
              <Button
                label="Batal"
                variant="secondary"
                onPress={() => setPendingActive(null)}
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* S4-5 — pilih role baru. Server tolak self-promote + role dari org lain. */}
      {rolePickerOpen && selected ? (
        <View className="absolute inset-0 items-center justify-center bg-black/40 p-6">
          <View
            className="w-full gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-900"
            accessibilityViewIsModal>
            <Text className="text-lg font-bold text-black dark:text-white">Ubah Role</Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Pilih role baru untuk {personLabel(selected)}. Permission bawaan role
              akan langsung berlaku; permission kustom (non-bawaan) tetap.
            </Text>
            <View className="gap-1.5">
              {roleTemplates.length === 0 ? (
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  Belum ada role di organisasi ini. Buat lewat Governance dulu.
                </Text>
              ) : (
                roleTemplates.map((rt) => {
                  const active = pendingRoleId === rt.id;
                  return (
                    <Pressable
                      key={rt.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Role ${rt.name}`}
                      onPress={() => setPendingRoleId(rt.id)}
                      className={`min-h-[44px] flex-row items-center justify-between gap-3 rounded-xl border px-4 py-3 active:opacity-70 ${
                        active
                          ? 'border-brand-dark bg-brand-dark/10 dark:bg-brand-dark/20'
                          : 'border-neutral-300 dark:border-neutral-700'
                      }`}>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-black dark:text-white">
                          {rt.name}
                        </Text>
                        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                          {rt.level}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={20} color={brandIcon} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </View>
            <View className="gap-2">
              <Button
                label="Simpan role"
                loading={roleM.isPending}
                disabled={
                  roleM.isPending ||
                  !pendingRoleId ||
                  pendingRoleId === selected.role_template_id
                }
                onPress={() =>
                  pendingRoleId &&
                  roleM.mutate({ targetId: selected.id, roleTemplateId: pendingRoleId })
                }
              />
              <Button
                label="Batal"
                variant="secondary"
                onPress={() => {
                  setRolePickerOpen(false);
                  setPendingRoleId(null);
                }}
              />
            </View>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
