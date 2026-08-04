import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { createLogger } from '@/lib/logger';

const log = createLogger('ThemeProvider');

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'rencanaapp:theme';
const VALID: ThemeMode[] = ['system', 'light', 'dark'];

type ThemeContextValue = {
  mode: ThemeMode;
  effective: 'light' | 'dark';
  setMode: (next: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function apply(mode: ThemeMode) {
  const scheme = (mode === 'system' ? null : mode) as 'light' | 'dark' | null;
  // Native: NativeWind v5 (lewat react-native-css) membaca Appearance — null = ikut OS.
  // RN runtime menerima null untuk reset, tapi type def-nya hanya 'light'|'dark'.
  const setter = (Appearance as { setColorScheme?: (s: 'light' | 'dark' | null) => void })
    .setColorScheme;
  if (typeof setter === 'function') {
    setter(scheme);
  }
  // Web: react-native-web TIDAK implement setColorScheme. Pakai class initiative di root
  // (global.css mendefinisikan @custom-variant dark utk konsumsi class .dark).
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    if (mode === 'system') {
      const sysDark =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(sysDark ? 'dark' : 'light');
    } else {
      root.classList.add(mode);
    }
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const system = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const next = VALID.includes(raw as ThemeMode) ? (raw as ThemeMode) : 'system';
        setModeState(next);
        apply(next);
      })
      .catch((err) => {
        log.warn('gagal baca AsyncStorage', err);
        if (!cancelled) apply('system');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Web: saat mode 'system', `apply()` hanya membaca prefers-color-scheme sekali (di mount).
  // Tanpa listener, mengganti tema OS ketika app terbuka tak mengubah class .dark/.light di
  // root sampai reload. Re-apply saat OS scheme berubah agar 'Sistem' live. `system` berasal
  // dari useColorScheme() react-native(-web) yang sudah ikut berubah realtime.
  useEffect(() => {
    if (mode === 'system') apply('system');
  }, [system, mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    apply(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((err) =>
      log.warn('gagal simpan AsyncStorage', err),
    );
  }, []);

  const effective: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  // Identitas value stabil → consumer app-wide tak re-render tiap render provider.
  const value = useMemo<ThemeContextValue>(
    () => ({ mode, effective, setMode }),
    [mode, effective, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  // Fallback aman untuk test/unit render tanpa provider: jangan crash, kembalikan default.
  if (!ctx) return { mode: 'system', effective: 'light', setMode: () => {} };
  return ctx;
}

/**
 * Resolve a light/dark hex pair for props that can't take a NativeWind className
 * (e.g. `Ionicons`' `color` prop). Wraps the `effective === 'dark' ? dark : light`
 * ternary repeated across icon-heavy screens (DESIGN.md §10 Iconography).
 */
export function useThemedIcon(light: string, dark: string): string {
  const { effective } = useThemePreference();
  return effective === 'dark' ? dark : light;
}
