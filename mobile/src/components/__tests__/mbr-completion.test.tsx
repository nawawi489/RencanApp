// Komponen bersama Fase 5: MbrCompletionIndicator (visual) + guardMbrActivation (gating popup).
// Dipakai ulang di KPI Area / Initiative / ActionPlan detail. Otoritas akhir tetap server.
import { render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first -- jest.mock must precede the import it pulls in transitively
import { MbrCompletionIndicator, guardMbrActivation } from '../mbr-completion';
// eslint-disable-next-line import/first
import type { MbrCompliance } from '@/lib/settings-mbr';

jest.setTimeout(30000);

function compliance(over: Partial<MbrCompliance>): MbrCompliance {
  return {
    child_card_type: 'initiative',
    child_count: 2,
    min_count: 3,
    enforcement_mode: 'hanya_peringatan',
    is_compliant: false,
    ...over,
  };
}

describe('MbrCompletionIndicator', () => {
  it('[1] compliance undefined → tidak render apa-apa (null)', async () => {
    const { toJSON } = await render(<MbrCompletionIndicator compliance={undefined} />);
    expect(toJSON()).toBeNull();
  });

  it('[2] non-compliant → label "Kelengkapan Perencanaan" + rasio "2/3"', async () => {
    await render(<MbrCompletionIndicator compliance={compliance({})} />);
    expect(screen.getByLabelText('Kelengkapan Perencanaan')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('[3] compliant → "Lengkap" (afirmatif)', async () => {
    await render(
      <MbrCompletionIndicator compliance={compliance({ child_count: 3, is_compliant: true })} />,
    );
    expect(screen.getByText('Lengkap')).toBeTruthy();
  });
});

describe('guardMbrActivation', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore?.();
  });

  it('[4] blokir_aktivasi + non-compliant → blocked=true + Alert "Tidak Dapat Melanjutkan" + tombol "+ Tambah Initiative"', () => {
    const onAddChild = jest.fn();
    const blocked = guardMbrActivation(
      compliance({ enforcement_mode: 'blokir_aktivasi' }),
      { childLabel: 'Initiative', onAddChild },
    );
    expect(blocked).toBe(true);
    const calls = (Alert.alert as jest.Mock).mock.calls;
    expect(calls[0][0]).toBe('Tidak Dapat Melanjutkan');
    // tombol kedua memicu onAddChild
    const buttons = calls[0][2] as { text: string; onPress?: () => void }[];
    const addBtn = buttons.find((b) => b.text.includes('Tambah Initiative'));
    expect(addBtn).toBeTruthy();
    addBtn!.onPress?.();
    expect(onAddChild).toHaveBeenCalled();
  });

  it('[5] blokir_aktivasi + compliant → blocked=false, tanpa popup', () => {
    const blocked = guardMbrActivation(
      compliance({ enforcement_mode: 'blokir_aktivasi', child_count: 3, is_compliant: true }),
      { childLabel: 'Initiative', onAddChild: jest.fn() },
    );
    expect(blocked).toBe(false);
    expect((Alert.alert as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('[6] hanya_peringatan non-compliant → blocked=false (mode bukan blokir aktivasi)', () => {
    const blocked = guardMbrActivation(
      compliance({ enforcement_mode: 'hanya_peringatan' }),
      { childLabel: 'Initiative', onAddChild: jest.fn() },
    );
    expect(blocked).toBe(false);
  });

  it('[7] compliance undefined → blocked=false (fail-open; server otoritatif)', () => {
    const blocked = guardMbrActivation(undefined, { childLabel: 'Initiative', onAddChild: jest.fn() });
    expect(blocked).toBe(false);
  });
});
