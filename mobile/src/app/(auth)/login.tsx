import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { BRAND_TAGLINE, BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useThemePreference } from '@/providers/theme-provider';

type Mode = 'masuk' | 'daftar';
type Feedback = { kind: 'error' | 'success'; message: string };

// Pesan Supabase di-Indonesiakan agar selaras dengan bahasa UI.
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email atau kata sandi salah.';
  if (m.includes('email not confirmed')) return 'Email belum diverifikasi. Periksa kotak masuk Anda.';
  if (m.includes('user already registered')) return 'Email sudah terdaftar. Silakan masuk.';
  if (m.includes('password should be at least')) return 'Kata sandi minimal 6 karakter.';
  if (m.includes('rate limit')) return 'Terlalu banyak percobaan. Coba lagi sebentar.';
  if (m.includes('network')) return 'Koneksi bermasalah. Periksa jaringan Anda.';
  return message;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('masuk');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function submit() {
    setFeedback(null);
    if (!email.trim() || !password) {
      setFeedback({ kind: 'error', message: 'Email dan kata sandi wajib diisi.' });
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
        setFeedback({
          kind: 'success',
          message:
            'Pendaftaran berhasil. Jika verifikasi email aktif, periksa email Anda sebelum masuk.',
        });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Terjadi kesalahan.';
      setFeedback({ kind: 'error', message: translateAuthError(raw) });
    } finally {
      setLoading(false);
    }
  }

  const { effective } = useThemePreference();
  const isDark = effective === 'dark';
  const gradient = isDark
    ? (['#000000', '#0b1220'] as const)
    : (['#ffffff', '#eef4fb'] as const);
  const placeholder = isDark ? '#6b7280' : '#9ca3af';
  const eyeColor = isDark ? '#94a3b8' : '#667085';

  return (
    <LinearGradient colors={gradient} style={{ flex: 1 }}>
      <ScrollView contentContainerClassName="grow justify-center px-6 py-12">
        <View className="items-center gap-3">
          <View className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
            <BrandLogo size={56} />
          </View>
          <Text className="text-3xl font-extrabold text-black dark:text-white">
            Rencana<Text className="text-green-700 dark:text-green-400">app</Text>
          </Text>
          <Text className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">{BRAND_TAGLINE}</Text>
          <Text className="text-center text-sm text-neutral-500 dark:text-neutral-400">
            Masuk ke pusat eksekusi target, Action Plan, dan review kerja tim.
          </Text>
        </View>

        <View className="mt-8 gap-3 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          {feedback ? (
            <View
              className={`rounded-xl border px-4 py-3 ${
                feedback.kind === 'error'
                  ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
                  : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40'
              }`}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite">
              <Text
                className={`text-sm font-semibold ${
                  feedback.kind === 'error'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-green-700 dark:text-green-300'
                }`}>
                {feedback.message}
              </Text>
            </View>
          ) : null}
          <TextInput
            className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
            placeholder="Email perusahaan"
            placeholderTextColor={placeholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View className="flex-row items-center rounded-xl border border-neutral-300 px-4 dark:border-neutral-700">
            <TextInput
              className="flex-1 py-3 text-base text-black dark:text-white"
              placeholder="Kata sandi"
              placeholderTextColor={placeholder}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              className="p-2 active:opacity-60"
              onPress={() => setShowPassword((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={eyeColor} />
            </Pressable>
          </View>

          <Button label={mode === 'masuk' ? 'Masuk' : 'Daftar'} onPress={submit} loading={loading} />

          <Pressable
            className="items-center py-1"
            onPress={() => setMode(mode === 'masuk' ? 'daftar' : 'masuk')}>
            <Text className="text-sm font-semibold text-brand-dark dark:text-brand">
              {mode === 'masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
            </Text>
          </Pressable>
        </View>

        <Text className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          Akun dibuat oleh admin perusahaan. Gunakan email kerja yang sudah diberi akses.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}
