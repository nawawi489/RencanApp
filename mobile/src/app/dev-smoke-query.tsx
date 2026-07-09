// Smoke test manual untuk pipeline React Query → logger. Route sengaja di root (bukan
// di dalam `(app)`) agar bisa diakses tanpa login saat verifikasi web dev preview.
// Guard produksi: konten tak dirender jika EXPO_PUBLIC_APP_ENV === 'production'.
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

function isProduction(): boolean {
  return process.env.EXPO_PUBLIC_APP_ENV === 'production';
}

// Query yang selalu gagal; disable by default, aktif via `enabled` saat tombol ditekan
// → satu jejak log per klik (bukan on mount).
function FailingQueryProbe({ armed }: { armed: boolean }) {
  useQuery({
    queryKey: ['dev-smoke-failing-query'],
    enabled: armed,
    retry: false,
    queryFn: async () => {
      throw new Error(`Query smoke test — ${new Date().toISOString()}`);
    },
  });
  return null;
}

export default function DevSmokeQuery() {
  const [queryArmed, setQueryArmed] = useState(false);

  const failingMutation = useMutation({
    mutationKey: ['dev-smoke-failing-mutation'],
    retry: false,
    mutationFn: async () => {
      throw new Error(`Mutation smoke test — ${new Date().toISOString()}`);
    },
  });

  if (isProduction()) {
    return (
      <View style={styles.container}>
        <Text style={styles.notice}>Halaman ini tidak tersedia di build produksi.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} accessible accessibilityRole="none">
      <Text style={styles.title}>React Query Smoke Test</Text>
      <Text style={styles.body}>
        Tekan tombol → error dari queryFn/mutationFn diserap QueryCache/MutationCache onError →
        logger namespace `ReactQuery`. Buka DevTools console untuk melihat JSON structured log.
      </Text>
      <Pressable
        onPress={() => setQueryArmed(true)}
        accessibilityRole="button"
        accessibilityLabel="Trigger query error"
        style={styles.button}>
        <Text style={styles.buttonLabel}>Trigger query error</Text>
      </Pressable>
      <Pressable
        onPress={() => failingMutation.mutate()}
        accessibilityRole="button"
        accessibilityLabel="Trigger mutation error"
        style={styles.button}>
        <Text style={styles.buttonLabel}>Trigger mutation error</Text>
      </Pressable>
      <FailingQueryProbe armed={queryArmed} />
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
