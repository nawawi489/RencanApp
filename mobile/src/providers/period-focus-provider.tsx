// Period Focus Engine — provider state (PRD V1.8.2 §7.6).
//
// Sumber kebenaran fokus periode aktif (Bulan default, Quarter rollup) untuk seluruh
// layar Workspace/tree/detail. Persisted di AsyncStorage; aman tanpa provider untuk
// test (fallback default = bulan berjalan saat modul di-import — diuji eksplisit).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  defaultFocus,
  parseFocusJson,
  type PeriodFocus,
  type PeriodMode,
} from '@/lib/period-focus';

const STORAGE_KEY = 'rencanaapp:period-focus';

type PeriodFocusContextValue = {
  focus: PeriodFocus;
  /** Ganti fokus secara penuh (mis. dari modal switcher). */
  setFocus: (next: PeriodFocus) => void;
  /** Pindah mode tanpa kehilangan year; otomatis pilih bulan/quarter "sekarang" di year tsb. */
  setMode: (mode: PeriodMode) => void;
};

const PeriodFocusContext = createContext<PeriodFocusContextValue | undefined>(undefined);

type ProviderProps = PropsWithChildren<{
  /** Untuk test: override `now` agar deterministik. Default = new Date() saat mount. */
  now?: Date;
}>;

export function PeriodFocusProvider({ children, now }: ProviderProps) {
  // Mount-time default (bukan re-evaluated tiap render). Test injects `now`.
  const [initialNow] = useState(() => now ?? new Date());
  const [focus, setFocusState] = useState<PeriodFocus>(() => defaultFocus(initialNow));

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseFocusJson(raw);
        if (parsed) setFocusState(parsed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setFocus = useCallback((next: PeriodFocus) => {
    setFocusState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setMode = useCallback(
    (mode: PeriodMode) => {
      setFocusState((cur) => {
        if (cur.mode === mode) return cur;
        // Saat user toggle Bulan↔Quarter, pertahankan year saat ini; bulan/quarter
        // dipilih dari `initialNow` (anchor stabil di sesi) supaya deterministik.
        const next: PeriodFocus =
          mode === 'month'
            ? { mode: 'month', year: cur.year, month: initialNow.getMonth() + 1 }
            : { mode: 'quarter', year: cur.year, quarter: Math.ceil((initialNow.getMonth() + 1) / 3) };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [initialNow],
  );

  const value = useMemo<PeriodFocusContextValue>(
    () => ({ focus, setFocus, setMode }),
    [focus, setFocus, setMode],
  );

  return <PeriodFocusContext.Provider value={value}>{children}</PeriodFocusContext.Provider>;
}

/**
 * Fallback aman tanpa provider (sama pola dgn `useThemePreference`): kembalikan fokus
 * default berbasis `new Date()` lokal + setter no-op. Penting agar test ringan tetap
 * bisa render komponen yang konsumsi hook ini tanpa wajib bungkus provider.
 */
export function usePeriodFocus(): PeriodFocusContextValue {
  const ctx = useContext(PeriodFocusContext);
  if (ctx) return ctx;
  return {
    focus: defaultFocus(new Date()),
    setFocus: () => {},
    setMode: () => {},
  };
}
