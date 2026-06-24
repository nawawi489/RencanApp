import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { BRAND_TAGLINE, BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Mode = 'masuk' | 'daftar';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('masuk');

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert('Data belum lengkap', 'Email dan kata sandi wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'masuk') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: email.trim().split('@')[0] } },
        });
        if (error) throw error;
        Alert.alert(
          'Pendaftaran berhasil',
          'Akun dibuat. Jika verifikasi email aktif, periksa email Anda sebelum masuk.',
        );
      }
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#ffffff', '#eef4fb']} style={{ flex: 1 }}>
      <ScrollView contentContainerClassName="grow justify-center px-6 py-12">
        <View className="items-center gap-3">
          <View className="rounded-3xl bg-white p-4 shadow-sm">
            <BrandLogo size={56} />
          </View>
          <Text className="text-3xl font-extrabold text-black">
            Rencana<Text className="text-green-700">app</Text>
          </Text>
          <Text className="text-sm font-semibold text-neutral-600">{BRAND_TAGLINE}</Text>
          <Text className="text-center text-sm text-neutral-500">
            Masuk ke pusat eksekusi target, Action Plan, dan review kerja tim.
          </Text>
        </View>

        <View className="mt-8 gap-3 rounded-2xl border border-neutral-200 bg-white p-5">
          <TextInput
            className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black"
            placeholder="Email perusahaan"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View className="flex-row items-center rounded-xl border border-neutral-300 px-4">
            <TextInput
              className="flex-1 py-3 text-base text-black"
              placeholder="Kata sandi"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              className="p-2 active:opacity-60"
              onPress={() => setShowPassword((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#667085" />
            </Pressable>
          </View>

          <Button label={mode === 'masuk' ? 'Masuk' : 'Daftar'} onPress={submit} loading={loading} />

          <Pressable
            className="items-center py-1"
            onPress={() => setMode(mode === 'masuk' ? 'daftar' : 'masuk')}>
            <Text className="text-sm font-semibold text-brand-dark">
              {mode === 'masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
            </Text>
          </Pressable>
        </View>

        <Text className="mt-6 text-center text-xs text-neutral-500">
          Akun dibuat oleh admin perusahaan. Gunakan email kerja yang sudah diberi akses.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}
