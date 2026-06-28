// PeriodFocusProvider — default Bulan berjalan, persist AsyncStorage, fallback aman tanpa provider.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native-css/components';

import { PeriodFocusProvider, usePeriodFocus } from '../period-focus-provider';

function Probe() {
  const { focus, setFocus, setMode, hydrated } = usePeriodFocus();
  const label =
    focus.mode === 'month'
      ? `M${focus.year}-${focus.month}`
      : `Q${focus.year}-${focus.quarter}`;
  return (
    <>
      <Text testID="label">{label}</Text>
      <Text testID="hydrated">{hydrated ? 'yes' : 'no'}</Text>
      <Text testID="setFocus" onPress={() => setFocus({ mode: 'quarter', year: 2026, quarter: 3 })}>
        setFocus
      </Text>
      <Text testID="setMode" onPress={() => setMode('quarter')}>
        setMode
      </Text>
    </>
  );
}

describe('PeriodFocusProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('[1] default = bulan dari `now` saat AsyncStorage kosong', async () => {
    await act(async () => {
      render(
        <PeriodFocusProvider now={new Date(2026, 5, 15)}>
          <Probe />
        </PeriodFocusProvider>,
      );
    });
    expect(screen.getByTestId('label')).toHaveTextContent('M2026-6');
    expect(screen.getByTestId('hydrated')).toHaveTextContent('yes');
  });

  it('[2] hydrate dari AsyncStorage menimpa default', async () => {
    await AsyncStorage.setItem(
      'rencanaapp:period-focus',
      JSON.stringify({ mode: 'quarter', year: 2025, quarter: 4 }),
    );
    await act(async () => {
      render(
        <PeriodFocusProvider now={new Date(2026, 5, 15)}>
          <Probe />
        </PeriodFocusProvider>,
      );
    });
    expect(screen.getByTestId('label')).toHaveTextContent('Q2025-4');
  });

  it('[3] setFocus persist ke AsyncStorage', async () => {
    await act(async () => {
      render(
        <PeriodFocusProvider now={new Date(2026, 5, 15)}>
          <Probe />
        </PeriodFocusProvider>,
      );
    });
    await act(async () => {
      screen.getByTestId('setFocus').props.onPress();
    });
    expect(screen.getByTestId('label')).toHaveTextContent('Q2026-3');
    const raw = await AsyncStorage.getItem('rencanaapp:period-focus');
    expect(raw).toBe('{"mode":"quarter","year":2026,"quarter":3}');
  });

  it('[4] setMode toggle Bulan→Quarter pakai quarter dari `now`, pertahankan year', async () => {
    await AsyncStorage.setItem(
      'rencanaapp:period-focus',
      JSON.stringify({ mode: 'month', year: 2025, month: 2 }),
    );
    await act(async () => {
      render(
        <PeriodFocusProvider now={new Date(2026, 5, 15)}>
          <Probe />
        </PeriodFocusProvider>,
      );
    });
    // Year hydrated dari storage (2025), tapi quarter dari anchor `now` (Jun 2026 = Q2).
    await act(async () => {
      screen.getByTestId('setMode').props.onPress();
    });
    expect(screen.getByTestId('label')).toHaveTextContent('Q2025-2');
  });

  it('[5] tanpa provider → fallback default (no crash)', async () => {
    await act(async () => {
      render(<Probe />);
    });
    // Default berbasis new Date() lokal — kita cek bentuk, bukan nilai eksak.
    expect(screen.getByTestId('label').props.children).toMatch(/^M\d{4}-\d{1,2}$/);
    expect(screen.getByTestId('hydrated').props.children).toBe('yes');
  });
});
