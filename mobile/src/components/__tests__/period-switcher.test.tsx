// PeriodSwitcher — panel kompak + modal expand (UI-G-010 / PRD §11.2).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { type PropsWithChildren } from 'react';

import { PeriodSwitcher } from '../period-switcher';
import { PeriodFocusProvider } from '@/providers/period-focus-provider';

// Render pertama membayar biaya compile modul; 5s default terlalu ketat di CI/mesin sibuk
// (pola sama dgn suite RN berat lain di repo).
jest.setTimeout(20000);

const NOW = new Date(2026, 5, 15); // Jun 2026 (Q2)

function Wrap({ children }: PropsWithChildren) {
  return <PeriodFocusProvider now={NOW}>{children}</PeriodFocusProvider>;
}

describe('PeriodSwitcher — compact panel', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('[1] render label "Juni 2026" + breadcrumb "Goal 2026 · Q2 · Juni"', async () => {
    await act(async () => {
      render(
        <Wrap>
          <PeriodSwitcher now={NOW} />
        </Wrap>,
      );
    });
    expect(await screen.findByText('Periode aktif')).toBeTruthy();
    expect(screen.getByText('Juni 2026')).toBeTruthy();
    expect(screen.getByText('Goal 2026 · Q2 · Juni')).toBeTruthy();
    expect(screen.getByLabelText('Ubah periode')).toBeTruthy();
  });
});

// WS-2 (BUG-02 / WS-04) — label panel harus DINAMIS mengikut status periode fokus.
// Kini hardcoded "Periode aktif" (period-switcher.tsx:91); saat user memilih periode
// arsip/masa depan, label tetap "Periode aktif" → menyesatkan (tak ada sinyal bahwa
// aksi turunan terkunci). Fix: turunkan dari focusPeriodStatus(focus, now).
describe('PeriodSwitcher — label periode dinamis (WS-2)', () => {
  const STORAGE_KEY = 'rencanaapp:period-focus';

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('[WS2-a] fokus berjalan (Juni) → "Periode aktif"', async () => {
    await act(async () => {
      render(
        <Wrap>
          <PeriodSwitcher now={NOW} />
        </Wrap>,
      );
    });
    expect(await screen.findByText('Periode aktif')).toBeTruthy();
    expect(screen.queryByText('Periode arsip')).toBeNull();
  });

  it('[WS2-b] fokus ARSIP (Januari 2026) → "Periode arsip"', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'month', year: 2026, month: 1 }));
    await act(async () => {
      render(
        <Wrap>
          <PeriodSwitcher now={NOW} />
        </Wrap>,
      );
    });
    expect(await screen.findByText('Periode arsip')).toBeTruthy();
    expect(screen.queryByText('Periode aktif')).toBeNull();
  });

  it('[WS2-c] fokus MASA DEPAN (Desember 2026) → "Periode akan datang"', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'month', year: 2026, month: 12 }));
    await act(async () => {
      render(
        <Wrap>
          <PeriodSwitcher now={NOW} />
        </Wrap>,
      );
    });
    expect(await screen.findByText('Periode akan datang')).toBeTruthy();
    expect(screen.queryByText('Periode aktif')).toBeNull();
  });
});

describe('PeriodSwitcher — modal expand', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('[2] tap Ubah → modal segmented Bulan/Quarter + 12 baris bulan', async () => {
    await act(async () => {
      render(
        <Wrap>
          <PeriodSwitcher now={NOW} />
        </Wrap>,
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ubah periode'));
    });
    expect(screen.getByLabelText('Mode periode')).toBeTruthy();
    expect(screen.getByLabelText('Bulan')).toBeTruthy();
    expect(screen.getByLabelText('Quarter')).toBeTruthy();
    // Juni anchor = current, Januari = past, Desember = future
    expect(screen.getByLabelText('Juni 2026 — Aktif')).toBeTruthy();
    expect(screen.getByLabelText('Januari 2026 — Arsip')).toBeTruthy();
    expect(screen.getByLabelText('Desember 2026 — Akan datang')).toBeTruthy();
  });

  it('[3] tap baris periode → setFocus + tutup modal', async () => {
    await act(async () => {
      render(
        <Wrap>
          <PeriodSwitcher now={NOW} />
        </Wrap>,
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ubah periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('April 2026 — Arsip'));
    });
    // Panel kompak ter-update.
    expect(screen.getByText('April 2026')).toBeTruthy();
    // Modal tertutup → label baris tidak lagi ada.
    expect(screen.queryByLabelText('Juni 2026 — Aktif')).toBeNull();
    // Persisted.
    const raw = await AsyncStorage.getItem('rencanaapp:period-focus');
    expect(raw).toBe('{"mode":"month","year":2026,"month":4}');
  });

  it('[4] toggle Quarter di modal → list jadi 4 baris Q1..Q4', async () => {
    await act(async () => {
      render(
        <Wrap>
          <PeriodSwitcher now={NOW} />
        </Wrap>,
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ubah periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Quarter'));
    });
    expect(screen.getByLabelText('Q1 2026 — Arsip')).toBeTruthy();
    expect(screen.getByLabelText('Q2 2026 — Aktif')).toBeTruthy();
    expect(screen.getByLabelText('Q3 2026 — Akan datang')).toBeTruthy();
    expect(screen.getByLabelText('Q4 2026 — Akan datang')).toBeTruthy();
    expect(screen.queryByLabelText('Juni 2026 — Aktif')).toBeNull();
  });
});
