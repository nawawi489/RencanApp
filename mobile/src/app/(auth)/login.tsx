import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { BRAND_TAGLINE, BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui';
import { AUTH_COPY } from '@/lib/auth-copy';
import { supabase } from '@/lib/supabase';
import { useThemePreference } from '@/providers/theme-provider';

// AUTH-02b: Supabase Auth menegakkan panjang password saat sign-UP, bukan sign-IN.
// Karena app ini login-only (PRD §39), client adalah SOLE signal panjang password
// di jalur login. Server tetap re-validate email/kredensial, jadi ini tidak
// menciptakan risiko keamanan baru — hanya UX yang lebih jelas.
const PASSWORD_MIN_LENGTH = 6;

type Feedback = { kind: 'error' | 'success'; message: string };

// Pesan Supabase di-Indonesiakan agar selaras dengan bahasa UI.
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email atau kata sandi salah.';
  if (m.includes('email not confirmed')) return 'Email belum diverifikasi. Periksa kotak masuk Anda.';
  if (m.includes('user already registered')) return 'Email sudah terdaftar. Silakan masuk.';
  if (m.includes('password should be at least')) return AUTH_COPY.passwordTooShort;
  if (m.includes('rate limit')) return 'Terlalu banyak percobaan. Coba lagi sebentar.';
  if (m.includes('network')) return 'Koneksi bermasalah. Periksa jaringan Anda.';
  return message;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Akun dibuat oleh admin perusahaan (PRD V1.8.2) — login-only, tanpa self-signup.
  async function submit() {
    setFeedback(null);
    if (!email.trim() || !password) {
      setFeedback({ kind: 'error', message: 'Email dan kata sandi wajib diisi.' });
      return;
    }
    // AUTH-02b: password TIDAK di-trim (spasi boleh bagian password); email tetap di-trim.
    // Field-empty menang urutan; guard length hanya jalan jika password non-kosong.
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFeedback({ kind: 'error', message: AUTH_COPY.passwordTooShort });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Terjadi kesalahan.';
      setFeedback({ kind: 'error', message: translateAuthError(raw) });
    } finally {
      setLoading(false);
    }
  }

  function contactAdmin() {
    setFeedback({
      kind: 'success',
      message:
        'Akun dibuat oleh administrator perusahaan. Minta admin Anda membuat/mengaktifkan akun, lalu masuk dengan email kerja Anda.',
    });
  }

  async function resetPassword() {
    setFeedback(null);
    if (!email.trim()) {
      setFeedback({ kind: 'error', message: 'Isi email dulu untuk reset kata sandi.' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      // Pesan netral (tak membocorkan apakah email terdaftar).
      setFeedback({
        kind: 'success',
        message: 'Jika email terdaftar, link reset kata sandi sudah dikirim. Periksa kotak masuk Anda.',
      });
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
          <Text className="text-3xl font-extrabold text-[#092753] dark:text-white">
            Rencana<Text className="text-green-700 dark:text-green-400">app</Text>
          </Text>
          <Text className="text-sm font-semibold text-[#667085] dark:text-neutral-300">{BRAND_TAGLINE}</Text>
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
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={eyeColor} />
            </Pressable>
          </View>

          <Button label="Masuk" onPress={submit} loading={loading} />

          <Pressable
            className="min-h-[44px] items-center justify-center py-1 active:opacity-60"
            onPress={resetPassword}
            accessibilityRole="button"
            accessibilityLabel="Lupa kata sandi, kirim link reset">
            <Text className="text-sm font-semibold text-brand-dark dark:text-brand">Lupa password?</Text>
          </Pressable>
        </View>

        <Text className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          Akun dibuat oleh admin perusahaan. Gunakan email kerja yang sudah diberi akses.
        </Text>

        <View className="mt-3">
          <Button label="Hubungi Admin" variant="secondary" onPress={contactAdmin} />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
