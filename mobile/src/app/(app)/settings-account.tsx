// S5-8 — layar "Kelola Akun". Dua aksi user-owned yang wajib ada demi UU PDP
// (dan Data safety di Play Console): ekspor data pribadi + permintaan
// penghapusan akun. Anonimisasi tetap dijalankan admin lewat layar Hak Akses.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Share } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Button, GuidanceNote, LabeledInput, SectionCard } from '@/components/ui';
import { exportMyData, requestAccountDeletion } from '@/lib/account';
import { alertFriendlyError } from '@/lib/errors';

export default function SettingsAccountScreen() {
  const [reason, setReason] = useState('');
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData();
      // Sharing api native menerima string content lewat `message`. Tanpa akses
      // filesystem yang stabil di web, JSON dilempar ke Share sheet apa adanya;
      // user memilih tujuan (email/Notes/dsb). Ini "portabilitas format
      // machine-readable" yang cukup untuk syarat V1.
      const json = JSON.stringify(data, null, 2);
      await Share.share({
        title: 'Data Akun Rencanapp',
        message: json,
      });
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Data tidak bisa diekspor. Coba lagi nanti.');
    } finally {
      setExporting(false);
    }
  }

  function handleRequest() {
    // Konfirmasi eksplisit — request penghapusan sulit dibatalkan begitu
    // admin memproses (baris skor jadi permanen ter-anonim). Alert modal
    // yang blok bukan yg auto-dismiss.
    Alert.alert(
      'Ajukan penghapusan akun?',
      'Admin organisasi Anda akan diberi tahu. Data kinerja historis akan dianonimkan (tidak dihapus penuh) karena diperlukan untuk audit. Anda akan kehilangan akses login setelah diproses.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ajukan',
          style: 'destructive',
          onPress: async () => {
            setRequesting(true);
            try {
              await requestAccountDeletion(reason.trim() || undefined);
              setRequested(true);
              setReason('');
              Alert.alert(
                'Permintaan diajukan',
                'Admin akan memproses permintaan Anda. Anda tetap bisa login sampai anonimisasi selesai.',
              );
            } catch (e) {
              alertFriendlyError('Gagal', e, 'Permintaan tidak terkirim. Coba lagi.');
            } finally {
              setRequesting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Kelola Akun' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Kelola Akun</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Ekspor data pribadi Anda atau ajukan penghapusan akun. Sesuai UU 27/2022 tentang Pelindungan Data Pribadi.
          </Text>
        </View>

        <SectionCard>
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="download-outline" size={20} color="#1564b3" />
              <Text className="text-lg font-semibold text-black dark:text-white">Ekspor Data Saya</Text>
            </View>
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">
              Unduh profil, ringkasan aktivitas, dan daftar Card yang Anda miliki dalam format JSON.
            </Text>
            <Button label="Ekspor sekarang" onPress={handleExport} loading={exporting} variant="secondary" />
          </View>
        </SectionCard>

        <GuidanceNote
          title="Apa yang terjadi setelah anonimisasi"
          body="Nama Anda menjadi 'Pengguna [dihapus]', email diganti alamat sintetis, dan Anda tak bisa login. Baris skor + log audit tetap ada karena diperlukan untuk kepatuhan, tapi terputus dari identitas Anda."
        />

        <SectionCard>
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="trash-outline" size={20} color="#b42318" />
              <Text className="text-lg font-semibold text-black dark:text-white">Ajukan Penghapusan Akun</Text>
            </View>
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">
              Admin organisasi Anda akan memproses permintaan ini. Anda tetap bisa login sampai selesai.
            </Text>
            <LabeledInput
              label="Alasan (opsional)"
              value={reason}
              onChangeText={setReason}
              placeholder="mis. Sudah tidak bekerja di organisasi"
              multiline
            />
            {requested ? (
              <Text className="text-sm text-emerald-700 dark:text-emerald-400">
                Permintaan sudah tercatat. Admin akan menghubungi jika perlu.
              </Text>
            ) : null}
            <Button
              label={requested ? 'Perbarui permintaan' : 'Ajukan penghapusan'}
              onPress={handleRequest}
              loading={requesting}
              variant="danger"
            />
          </View>
        </SectionCard>
      </View>
    </ScrollView>
  );
}
