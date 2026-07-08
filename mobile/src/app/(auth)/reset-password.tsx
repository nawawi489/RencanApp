import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { BRAND_TAGLINE, BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui';
import { AUTH_COPY } from '@/lib/auth-copy';
import { supabase } from '@/lib/supabase';
import { useThemePreference } from '@/providers/theme-provider';

// Sejajar dengan AUTH-02b di login: Supabase default minimal 6 karakter.
const PASSWORD_MIN_LENGTH = 6;

type Feedback = { kind: 'error' | 'success'; message: string };

// Alur Supabase updateUser di jalur recovery bisa mengembalikan pesan generik EN.
// Terjemahkan pola yang lazim agar konsisten dengan bahasa UI.
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  // Prioritas: network dulu — kalau server tak terjangkau, pesan kata sandi
  // menyesatkan (seakan credential salah).
  if (m.includes('failed to fetch') || m.includes('network request failed') || m.includes('network')) {
    return AUTH_COPY.networkUnavailable;
  }
  if (m.includes('should be at least')) return AUTH_COPY.passwordTooShort;
  if (m.includes('new password should be different')) return 'Kata sandi baru harus berbeda dari sebelumnya.';
  if (m.includes('auth session missing') || m.includes('jwt')) {
    return 'Sesi reset kadaluarsa. Ulangi permintaan "Lupa password" dari halaman Masuk.';
  }
  return 'Gagal menyimpan kata sandi. Coba lagi.';
}

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const router = useRouter();

  async function submit() {
    setFeedback(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFeedback({ kind: 'error', message: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    if (password !== confirm) {
      setFeedback({ kind: 'error', message: 'Konfirmasi kata sandi tidak cocok.' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Recovery session dibuang agar user login ulang dengan kata sandi baru —
      // menghindari state limbo di device jika token recovery masih valid.
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
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
            Buat kata sandi baru untuk akun Anda.
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
          <View className="flex-row items-center rounded-xl border border-neutral-300 px-4 dark:border-neutral-700">
            <TextInput
              className="flex-1 py-3 text-base text-black dark:text-white"
              placeholder="Kata sandi baru"
              placeholderTextColor={placeholder}
              secureTextEntry={!show}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoComplete="password-new"
            />
            <Pressable
              className="p-2 active:opacity-60"
              onPress={() => setShow((s) => !s)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={eyeColor} />
            </Pressable>
          </View>
          <TextInput
            className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
            placeholder="Ulangi kata sandi baru"
            placeholderTextColor={placeholder}
            secureTextEntry={!show}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="none"
            autoComplete="password-new"
          />

          <Button
            label="Simpan kata sandi baru"
            onPress={submit}
            loading={loading}
          />

          <Pressable
            className="min-h-[44px] items-center justify-center py-1 active:opacity-60"
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="button"
            accessibilityLabel="Batal, kembali ke halaman masuk">
            <Text className="text-sm font-semibold text-brand-dark dark:text-brand">Kembali ke Masuk</Text>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
