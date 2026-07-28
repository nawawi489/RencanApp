// BL-19c — UI-S-OR3: identitas Organisasi (nama + zona waktu).
// Gating: manage_settings, sama dengan tab Role Template di /settings-org-structure.
//
// Zona waktu BUKAN kosmetik: `organizations.timezone` adalah zona tempat `deadline_at`
// dihitung dan yang diresolusi `org_today()` untuk mendeteksi instance terlewat. Salah zona
// menggeser tenggat seluruh organisasi tanpa satu pun error — karena itu layar ini menaruh
// peringatannya di dekat field, bukan di dokumentasi.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { OptionPicker } from '@/components/option-picker';
import { Button, GuidanceNote, LabeledInput, SectionCard, SkeletonList } from '@/components/ui';
import { useSafeBack } from '@/hooks/use-safe-back';
import { useOrganizationActions } from '@/hooks/use-org-structure';
import { useProfile } from '@/hooks/use-profile';
import { alertFriendlyError } from '@/lib/errors';
import { DEFAULT_ORG_TIMEZONE, orgTimezoneOptions } from '@/lib/org-timezone';

export default function SettingsOrganizationScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { profile, isLoading, can } = useProfile();
  const { updateOrganization, isPending } = useOrganizationActions();

  // `null` = belum disentuh → ikut nilai server (pola sama dengan settings-profile).
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [tzDraft, setTzDraft] = useState<string | null>(null);
  // S7-3: error inline per-field menggantikan Alert.alert('Belum lengkap', …).
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});

  const allowed = can('manage_settings');
  const name = nameDraft ?? profile?.org_name ?? '';
  const timezone = tzDraft ?? profile?.org_timezone ?? DEFAULT_ORG_TIMEZONE;
  const options = orgTimezoneOptions(profile?.org_timezone);

  async function submit() {
    const trimmed = name.trim();
    const nextErrors: typeof fieldErrors = {};
    if (!trimmed) {
      nextErrors.name = 'Nama Organisasi wajib diisi.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    try {
      await updateOrganization({ name: trimmed, timezone });
      setNameDraft(null);
      setTzDraft(null);
      safeBack();
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Perubahan tidak tersimpan. Coba lagi.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Profil Organisasi' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Profil Organisasi</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Nama Organisasi dan zona waktu yang dipakai seluruh perhitungan deadline.
          </Text>
        </View>

        {!allowed ? (
          <AccessDenied message='Layar ini memerlukan izin "manage_settings". Hubungi administrator bila perlu akses.' />
        ) : isLoading ? (
          <SkeletonList count={2} />
        ) : (
          <>
            <SectionCard>
              <LabeledInput
                label="Nama Organisasi"
                value={name}
                onChangeText={(t) => {
                  setNameDraft(t);
                  if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
                }}
                required
                placeholder="mis. PT Rencana Nusantara"
                error={fieldErrors.name}
              />
              <OptionPicker
                label="Zona waktu"
                required
                options={options}
                value={timezone}
                onChange={(v) => setTzDraft(v ?? DEFAULT_ORG_TIMEZONE)}
                clearLabel="Kembalikan ke Asia/Jakarta (WIB)"
              />
              <Button label="Simpan" onPress={submit} loading={isPending} />
            </SectionCard>

            <GuidanceNote
              title="Zona waktu memengaruhi deadline"
              body="Jam deadline Tugas dan deteksi pekerjaan terlewat dihitung memakai zona ini. Mengubahnya menggeser arti setiap jam deadline yang sudah tersimpan — ubah hanya bila lokasi kerja organisasi memang berpindah."
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}
