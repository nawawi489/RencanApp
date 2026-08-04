// Tambah User — akun dibuat admin (PRD §39: invite-only, tanpa public self-register).
// Gate manage_users_permissions (server penegak akhir di Edge Function create-user).
// Guard eskalasi: C-Level hanya bisa dibuat CEO; role CEO tidak tersedia dari layar ini.
// Password sementara diketik admin & dibagikan manual — tanpa dependensi email/SMTP.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';

import { AccessDenied } from '@/components/access-denied';
import { OptionPicker } from '@/components/option-picker';
import { Button, GuidanceNote, LabeledInput, SectionCard, SkeletonList } from '@/components/ui';
import { useSafeBack } from '@/hooks/use-safe-back';
import { useRoleTemplates } from '@/hooks/use-org-structure';
import { useProfile } from '@/hooks/use-profile';
import { useCreateUserAdmin } from '@/hooks/use-users-admin';
import { showAlert } from '@/lib/alert';
import { surfaceServerError } from '@/lib/errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

type RoleLevel = 'staff' | 'management' | 'c_level';
const ROLE_OPTIONS: { value: RoleLevel; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'management', label: 'Management' },
  { value: 'c_level', label: 'C-Level' },
];

const LEVEL_LABEL: Record<string, string> = {
  staff: 'Staff', management: 'Management', c_level: 'C-Level', ceo: 'CEO',
};

export default function SettingsUserNewScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { profile, isLoading: profileLoading, can } = useProfile();
  const { createUser, isPending } = useCreateUserAdmin();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleLevel, setRoleLevel] = useState<RoleLevel>('staff');
  const [roleTemplateId, setRoleTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // S7-3: error inline per-field menggantikan Alert.alert('Belum lengkap', …) yang tidak
  // menunjuk field mana yang salah. Screen reader akan mengumumkan pesan lewat LabeledInput.
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});
  const { roleTemplates } = useRoleTemplates();

  if (profileLoading) {
    return (
      <View className="flex-1 bg-neutral-50 p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Tambah User' }} />
        <SkeletonList count={3} />
      </View>
    );
  }

  if (!can('manage_users_permissions')) {
    return (
      <View className="flex-1 bg-neutral-50 p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Tambah User' }} />
        <AccessDenied message="Hanya pemegang izin Kelola User & Permission yang dapat menambah user." />
      </View>
    );
  }

  const isCeo = profile?.role_level === 'ceo';

  async function submit() {
    // S7-3: kumpulkan semua error field sekaligus supaya admin melihat SEMUA yang salah,
    // bukan satu per satu (pola Alert lama exit di error pertama). Set-and-return kalau ada.
    const nextErrors: typeof fieldErrors = {};
    if (!fullName.trim()) {
      nextErrors.fullName = 'Nama lengkap wajib diisi.';
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      nextErrors.email = 'Periksa kembali format alamat email.';
    }
    if (password.length < PASSWORD_MIN) {
      nextErrors.password = `Password sementara minimal ${PASSWORD_MIN} karakter.`;
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setError(null);
    try {
      const created = await createUser({
        email: normalizedEmail,
        password,
        fullName: fullName.trim(),
        roleLevel,
        roleTemplateId,
      });
      // Akun berhasil dibuat tapi penempatan org/role-nya gagal (BL-14 §5). Jangan tampilkan
      // sebagai sukses biasa: user ada di org yang salah dan gejalanya nanti workspace kosong,
      // bukan error. Tetap di layar + banner persisten supaya sinyalnya tidak hilang begitu
      // Alert ditutup.
      if (created.warning) {
        setError(created.warning.message);
        showAlert(
          'User dibuat — perlu diperiksa',
          `Akun ${normalizedEmail} sudah bisa dipakai untuk login, tetapi penempatan organisasi/role-nya gagal. Periksa user ini di User & Permission sebelum membagikan password sementara.`,
        );
        return;
      }
      showAlert(
        'User dibuat',
        `Akun ${normalizedEmail} siap digunakan. Bagikan password sementara secara aman dan sarankan menggantinya lewat Reset Password setelah login pertama.`,
      );
      safeBack();
    } catch (e) {
      setError(surfaceServerError('Tambah User', e, 'Gagal membuat user. Coba lagi.'));
    }
  }

  return (
    <KeyboardAwareScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Tambah User' }} />
      <View className="gap-4 p-5">
        <GuidanceNote
          title="Akun dibuat oleh admin"
          body="Rencanapp tidak memiliki pendaftaran mandiri. Buat akun di sini, lalu bagikan email + password sementara ke user secara aman. Hak akses lanjutan diatur di User & Permission."
        />

        <SectionCard>
          <LabeledInput
            label="Nama lengkap"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              if (fieldErrors.fullName) setFieldErrors((e) => ({ ...e, fullName: undefined }));
            }}
            required
            placeholder="mis. Rina Jaya"
            error={fieldErrors.fullName}
          />
          <LabeledInput
            label="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: undefined }));
            }}
            required
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="mis. rina@perusahaan.co.id"
            error={fieldErrors.email}
          />
          <LabeledInput
            label="Password sementara"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
            }}
            required
            autoCapitalize="none"
            autoComplete="new-password"
            /* S7-4: sembunyikan password sementara admin — terbaca siapa pun di dekat layar
               sebelum ini. LabeledInput menambahkan tombol reveal built-in (§4.1 44px). */
            secureTextEntry
            placeholder={`Minimal ${PASSWORD_MIN} karakter`}
            error={fieldErrors.password}
          />

          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-black dark:text-white">
              Role<Text className="text-red-700 dark:text-red-400"> *</Text>
            </Text>
            <View className="flex-row gap-1" accessibilityRole="radiogroup" accessibilityLabel="Role user baru">
              {ROLE_OPTIONS.map((opt) => {
                const active = roleLevel === opt.value;
                const locked = opt.value === 'c_level' && !isCeo;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled: locked }}
                    accessibilityLabel={`Role ${opt.label}`}
                    disabled={locked}
                    onPress={() => !active && setRoleLevel(opt.value)}
                    className={`min-h-[44px] flex-1 items-center justify-center rounded-full px-2 ${
                      active ? 'bg-brand-dark' : 'border border-neutral-300 dark:border-neutral-700'
                    } ${locked ? 'opacity-40' : 'active:opacity-70'}`}>
                    <Text
                      className={`text-xs font-semibold ${active ? 'text-white' : 'text-black dark:text-white'}`}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!isCeo ? (
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Role C-Level hanya dapat dibuat oleh CEO. Role CEO tidak dapat dibuat dari sini.
              </Text>
            ) : (
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Role CEO tidak dapat dibuat dari sini.
              </Text>
            )}
          </View>

          {/* BL-19d — Role Template kustom akhirnya bisa dipilih; sebelumnya bisa dibuat
              tapi tak pernah bisa di-assign karena server selalu memungut baris seeded.
              Template ber-level `ceo` TIDAK ditawarkan: server menolaknya, dan menawarkan
              pilihan yang pasti gagal itu jebakan. Level template menang atas chip di atas
              — dinyatakan eksplisit supaya admin tidak menyangka chip-nya yang berlaku. */}
          <OptionPicker
            label="Role Template (opsional)"
            options={roleTemplates
              .filter((t) => t.level !== 'ceo')
              .map((t) => ({
                value: t.id,
                label: t.name,
                hint: `Level ${LEVEL_LABEL[t.level] ?? t.level}${t.is_system ? ' · sistem' : ''}`,
              }))}
            value={roleTemplateId}
            onChange={setRoleTemplateId}
            placeholder="Pakai template bawaan sesuai Role"
            clearLabel="Pakai template bawaan sesuai Role"
            emptyText="Belum ada Role Template. Buat di Organisasi → Role."
          />
          {roleTemplateId ? (
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">
              Level user mengikuti Role Template yang dipilih, bukan pilihan Role di atas.
            </Text>
          ) : null}
        </SectionCard>

        {error ? (
          <Text accessibilityRole="alert" className="text-sm font-semibold text-red-700 dark:text-red-400">
            {error}
          </Text>
        ) : null}

        <Button label="Buat User" onPress={submit} loading={isPending} disabled={isPending} />
      </View>
    </KeyboardAwareScrollView>
  );
}
