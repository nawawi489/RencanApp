// BL-19c — UI-S-PR1: ubah nama sendiri. Sebelum ini `profiles` tidak punya SATU PUN
// jalur tulis di `src/`, jadi nama yang salah ketik saat pembuatan akun hanya bisa
// diperbaiki admin lewat DB.
//
// Tanpa gate permission — ini baris milik user sendiri. Kolom lain (email, role, org)
// tampil READ-ONLY dan memang tidak dikirim: 0093 sengaja mempersempit `update_own_profile`
// ke `full_name` saja, dan jabatan tetap ditetapkan admin karena organisasi sudah punya
// entitas Positions sebagai sumber kebenarannya.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Button, Field, GuidanceNote, LabeledInput, SectionCard, SkeletonList } from '@/components/ui';
import { useProfile, useUpdateOwnProfile } from '@/hooks/use-profile';
import { alertFriendlyError } from '@/lib/errors';
import { orgTimezoneLabel } from '@/lib/org-timezone';
import { MAX_FULL_NAME_LENGTH } from '@/lib/profile-self';

export default function SettingsProfileScreen() {
  const router = useRouter();
  const { profile, isLoading } = useProfile();
  const { updateOwnProfile, isPending } = useUpdateOwnProfile();

  // `null` = belum disentuh → tampilkan nilai dari server. Tanpa penanda ini, form yang
  // sengaja dikosongkan user akan terisi ulang setiap kali query menyegarkan.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? profile?.full_name ?? '';

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Belum lengkap', 'Nama lengkap wajib diisi.');
      return;
    }
    if (trimmed.length > MAX_FULL_NAME_LENGTH) {
      Alert.alert('Terlalu panjang', `Nama lengkap maksimal ${MAX_FULL_NAME_LENGTH} karakter.`);
      return;
    }
    try {
      await updateOwnProfile(trimmed);
      setDraft(null);
      router.back();
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Nama tidak tersimpan. Coba lagi.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Profil Saya' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Profil Saya</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Nama yang tampil di seluruh Rencanapp — Card, komentar, dan daftar People.
          </Text>
        </View>

        {isLoading ? (
          <SkeletonList count={2} />
        ) : (
          <>
            <SectionCard>
              <LabeledInput
                label="Nama lengkap"
                value={name}
                onChangeText={setDraft}
                required
                placeholder="mis. Siti Rahmawati"
              />
              <Button label="Simpan" onPress={submit} loading={isPending} />
            </SectionCard>

            <GuidanceNote
              title="Yang hanya bisa diubah admin"
              body="Email, Role, dan Organisasi ditetapkan administrator. Jabatan mengikuti entitas Posisi di Organisasi, bukan teks bebas di profil — hubungi admin bila salah satunya perlu diperbaiki."
            />

            <SectionCard>
              <Field label="Email" value={profile?.email ?? '—'} />
              <Field label="Role" value={profile?.role_name ?? '—'} />
              <Field label="Organisasi" value={profile?.org_name ?? '—'} />
              <Field label="Zona waktu organisasi" value={orgTimezoneLabel(profile?.org_timezone)} />
            </SectionCard>
          </>
        )}
      </View>
    </ScrollView>
  );
}
