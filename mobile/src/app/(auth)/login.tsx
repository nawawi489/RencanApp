import { useState } from 'react';
import { Alert } from 'react-native';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native-css/components';

import { supabase } from '@/lib/supabase';

type Mode = 'masuk' | 'daftar';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
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
    <View className="flex-1 justify-center bg-white px-6 dark:bg-black">
      <View className="gap-2">
        <Text className="text-3xl font-bold text-black dark:text-white">EMS</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Execution Management System — Nyantuy Group
        </Text>
      </View>

      <View className="mt-8 gap-3">
        <TextInput
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Email"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Kata sandi"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          className="mt-2 items-center rounded-xl bg-brand px-4 py-3 active:opacity-80"
          disabled={loading}
          onPress={submit}>
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">
              {mode === 'masuk' ? 'Masuk' : 'Daftar'}
            </Text>
          )}
        </Pressable>

        <Pressable
          className="items-center py-2"
          onPress={() => setMode(mode === 'masuk' ? 'daftar' : 'masuk')}>
          <Text className="text-sm text-brand">
            {mode === 'masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
