// Smoke test end-to-end wire Sentry. Diakses via URL /dev-sentry-test (tidak di-link
// dari navigasi). Tombol hanya render saat EXPO_PUBLIC_APP_ENV !== 'production' — safety
// guard bila route ini bocor ke build produksi (mis. developer lupa hapus).
//
// Cara pakai:
//   1. Build preview via `eas build --profile preview` → install di device
//   2. Buka via deep-link `ems://dev-sentry-test` atau navigate manual
//   3. Tekan salah satu tombol → cek dashboard Sentry `rencanapp-staging` (< 1 menit)
import { Pressable, Text, View } from 'react-native';

import { createLogger } from '@/lib/logger';

const log = createLogger('DevSmokeTest');

function isProduction(): boolean {
  return process.env.EXPO_PUBLIC_APP_ENV === 'production';
}

export default function DevSentryTest() {
  if (isProduction()) {
    return (
      <View style={styles.container}>
        <Text style={styles.notice}>Halaman ini tidak tersedia di build produksi.</Text>
      </View>
    );
  }

  const triggerSync = () => {
    const stamp = new Date().toISOString();
    log.error(new Error(`Sentry smoke test (sync) — ${stamp}`));
  };

  const triggerAsync = () => {
    // Promise rejection tak di-await → ditangkap oleh installGlobalErrorHandler ATAU
    // langsung diteruskan ke logger. Simulasi async yang lebih realistis dari sekadar
    // throw sinkron di handler.
    setTimeout(() => {
      const stamp = new Date().toISOString();
      log.error(new Error(`Sentry smoke test (async) — ${stamp}`));
    }, 0);
  };

  return (
    <View style={styles.container} accessible accessibilityRole="none">
      <Text style={styles.title}>Sentry Smoke Test</Text>
      <Text style={styles.body}>
        Tekan tombol → error masuk ke logger → transport Sentry (jika DSN di-set) meneruskan ke
        dashboard. Verifikasi di project `rencanapp-staging`.
      </Text>
      <Pressable
        onPress={triggerSync}
        accessibilityRole="button"
        accessibilityLabel="Trigger sync error"
        style={styles.button}>
        <Text style={styles.buttonLabel}>Trigger sync error</Text>
      </Pressable>
      <Pressable
        onPress={triggerAsync}
        accessibilityRole="button"
        accessibilityLabel="Trigger async error"
        style={styles.button}>
        <Text style={styles.buttonLabel}>Trigger async error</Text>
      </Pressable>
    </View>
  );
}

const styles = {
  container: { flex: 1, padding: 24, gap: 12, backgroundColor: '#ffffff' },
  title: { fontSize: 18, fontWeight: '600' as const, color: '#0f172a' },
  body: { fontSize: 14, color: '#475569', marginBottom: 8 },
  notice: { fontSize: 14, color: '#475569', textAlign: 'center' as const },
  button: {
    minHeight: 48,
    justifyContent: 'center' as const,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1564b3',
    alignItems: 'center' as const,
  },
  buttonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '600' as const },
};
