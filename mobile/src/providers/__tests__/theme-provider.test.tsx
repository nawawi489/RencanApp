/**
 * @jest-environment jsdom
 */
// Regression net untuk MENU-03 / THEME-01: kunci perilaku theme-provider agar
// dark mode benar-benar apply lintas layar. Verifikasi runtime dilakukan lewat
// preview_inspect di web (docs/testing-report-2026-07-05-ui.md finding), dan
// unit test ini menjaga wiring supaya regression future ke-tangkap di CI.
//
// Ref: docs/spec-ui-testfix-2026-07-05.md AC-THEME01-2..4
//      docs/tdd-plan-ui-testfix-batch1-2026-07-05.md (batch 2)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, render } from '@testing-library/react-native';
import { Appearance, Platform, Text } from 'react-native';

jest.setTimeout(30000);

const mockSetColorScheme = jest.fn();

// Force Platform.OS='web' agar jalur class .dark di documentElement dieksekusi.
// Cara aman tanpa memock seluruh react-native (spread akan memicu side-effect
// modul warn ProgressBarAndroid / SafeAreaView).
Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
// Spy Appearance.setColorScheme; kalau tidak ada properti, definisikan.
(Appearance as { setColorScheme?: (s: 'light' | 'dark' | null) => void }).setColorScheme = (
  ...args
) => mockSetColorScheme(...args);

// eslint-disable-next-line import/first
import {
  ThemeProvider,
  useThemePreference,
  type ThemeMode,
} from '../theme-provider';

function Probe({ onReady }: { onReady: (v: ReturnType<typeof useThemePreference>) => void }) {
  const value = useThemePreference();
  onReady(value);
  return <Text>{value.mode + ':' + value.effective}</Text>;
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  mockSetColorScheme.mockReset();
  await AsyncStorage.clear();
  if (typeof document !== 'undefined') {
    document.documentElement.className = '';
  }
});

afterEach(() => {
  cleanup();
});

describe('ThemeProvider — MENU-03 / THEME-01 regression', () => {
  it('[1] AC-THEME01-2 (web): setMode("dark") → documentElement class "dark" ada, "light" hilang', async () => {
    let latest: ReturnType<typeof useThemePreference> | null = null;
    await render(
      <ThemeProvider>
        <Probe onReady={(v) => (latest = v)} />
      </ThemeProvider>,
    );
    // Tunggu useEffect mount menyelesaikan pembacaan AsyncStorage.
    await flush();
    expect(latest).not.toBeNull();

    await act(async () => {
      latest!.setMode('dark');
      await Promise.resolve();
    });

    const classes = [...document.documentElement.classList];
    expect(classes).toContain('dark');
    expect(classes).not.toContain('light');
  });

  it('[2] AC-THEME01-2 (web): setMode("light") membalik — "light" ada, "dark" hilang', async () => {
    let latest: ReturnType<typeof useThemePreference> | null = null;
    await render(
      <ThemeProvider>
        <Probe onReady={(v) => (latest = v)} />
      </ThemeProvider>,
    );
    await flush();

    await act(async () => {
      latest!.setMode('dark');
      await Promise.resolve();
    });
    expect([...document.documentElement.classList]).toContain('dark');

    await act(async () => {
      latest!.setMode('light');
      await Promise.resolve();
    });
    const classes = [...document.documentElement.classList];
    expect(classes).toContain('light');
    expect(classes).not.toContain('dark');
  });

  it('[3] AC-THEME01-4: nilai persist ke AsyncStorage di key "rencanaapp:theme"', async () => {
    let latest: ReturnType<typeof useThemePreference> | null = null;
    await render(
      <ThemeProvider>
        <Probe onReady={(v) => (latest = v)} />
      </ThemeProvider>,
    );
    await flush();

    await act(async () => {
      latest!.setMode('dark');
      await Promise.resolve();
    });
    // AsyncStorage.setItem di setMode di-fire-and-forget; beri satu tick.
    await flush();
    expect(await AsyncStorage.getItem('rencanaapp:theme')).toBe('dark');
  });

  it('[4] AC-THEME01-4: mount membaca AsyncStorage — nilai persisted dipulihkan', async () => {
    await AsyncStorage.setItem('rencanaapp:theme', 'dark');

    let latest: ReturnType<typeof useThemePreference> | null = null;
    await render(
      <ThemeProvider>
        <Probe onReady={(v) => (latest = v)} />
      </ThemeProvider>,
    );
    await flush();

    expect(latest!.mode).toBe('dark');
    expect(latest!.effective).toBe('dark');
    expect([...document.documentElement.classList]).toContain('dark');
  });

  it('[5] AC-THEME01-4: nilai persist invalid → fallback ke "system" tanpa crash', async () => {
    await AsyncStorage.setItem('rencanaapp:theme', 'kentang' as ThemeMode);

    let latest: ReturnType<typeof useThemePreference> | null = null;
    await render(
      <ThemeProvider>
        <Probe onReady={(v) => (latest = v)} />
      </ThemeProvider>,
    );
    await flush();

    expect(latest!.mode).toBe('system');
  });

  it('[6] AC-THEME01-6: native setColorScheme dipanggil untuk pilihan eksplisit', async () => {
    let latest: ReturnType<typeof useThemePreference> | null = null;
    await render(
      <ThemeProvider>
        <Probe onReady={(v) => (latest = v)} />
      </ThemeProvider>,
    );
    await flush();
    // Setelah mount, apply('system') pertama akan dipanggil dengan null.
    mockSetColorScheme.mockClear();

    await act(async () => {
      latest!.setMode('dark');
      await Promise.resolve();
    });
    expect(mockSetColorScheme).toHaveBeenCalledWith('dark');

    await act(async () => {
      latest!.setMode('light');
      await Promise.resolve();
    });
    expect(mockSetColorScheme).toHaveBeenCalledWith('light');

    await act(async () => {
      latest!.setMode('system');
      await Promise.resolve();
    });
    // 'system' → null (reset ke OS).
    expect(mockSetColorScheme).toHaveBeenCalledWith(null);
  });

  it('[7] AC-THEME01-2 (web): default sebelum useEffect membaca storage — class root konsisten', async () => {
    // Tanpa persisted value: initial mode='system', effective mengikuti prefers-color-scheme.
    let latest: ReturnType<typeof useThemePreference> | null = null;
    await render(
      <ThemeProvider>
        <Probe onReady={(v) => (latest = v)} />
      </ThemeProvider>,
    );
    await flush();

    // Setelah mount + apply: class root harus 'light' ATAU 'dark' (bukan kosong),
    // agar dark:* variants selalu bisa cascade konsisten.
    const classes = [...document.documentElement.classList];
    expect(classes.includes('light') || classes.includes('dark')).toBe(true);
    expect(latest!.mode).toBe('system');
  });
});
