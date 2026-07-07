// Item 2 — ErrorBoundary root. React tak punya cara built-in menangkap crash render; tanpa
// boundary, satu error di komponen mana pun mematikan seluruh app (white screen). Boundary ini
// membungkus SELURUH tree di root layout — termasuk provider — sehingga fallback tetap tampil
// meski provider yang crash. Karena itu fallback default sengaja MANDIRI (primitives + inline
// style, tanpa context tema/NativeWind yang mungkin ikut tumbang).
import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getLogger } from '@/lib/logger';

type Props = {
  children: ReactNode;
  /** Fallback kustom; menerima `reset` untuk mencoba render ulang. Default: layar minimal mandiri. */
  fallback?: (reset: () => void) => ReactNode;
};

type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    // WSA-18: detail teknis HANYA ke telemetry, tidak pernah ke user.
    getLogger().error('[ErrorBoundary]', error, info?.componentStack ?? '');
  }

  private reset = (): void => this.setState({ hasError: false });

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return <DefaultFallback onRetry={this.reset} />;
  }
}

function DefaultFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.container} accessible accessibilityRole="alert">
      <Text style={styles.title}>Terjadi masalah</Text>
      <Text style={styles.body}>
        Aplikasi mengalami kendala tak terduga. Coba muat ulang halaman ini.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Muat ulang"
        style={styles.button}>
        <Text style={styles.buttonLabel}>Muat ulang</Text>
      </Pressable>
    </View>
  );
}

// Inline style (bukan NativeWind) agar tidak bergantung provider/tema yang mungkin ikut crash.
// `brand-dark` #1564b3 + teks putih memenuhi kontras a11y (DESIGN §4); tinggi tombol 48 ≥ 44px.
const styles = {
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
    gap: 12,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 18, fontWeight: '600' as const, color: '#0f172a', textAlign: 'center' as const },
  body: { fontSize: 14, color: '#475569', textAlign: 'center' as const },
  button: {
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center' as const,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1564b3',
  },
  buttonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '600' as const },
};
