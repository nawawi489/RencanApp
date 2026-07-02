// Completeness popups (PRD V1.8.2 §7.4 + §7.5). Pure helpers — Alert.alert di-mock via injection.
jest.mock('../supabase', () => ({ supabase: {} }));

import {
  confirmAddDescendantIfIncomplete,
  guardActivationFields,
  mbrBreakdownGuardMessage,
  missingRequiredFor,
} from '../activation-check';
import type { MbrCompliance } from '../settings-mbr';

const FULL = {
  name: 'Goal X',
  pic_id: 'u1',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
  target: 'Naik 20%',
  target_result: 'Naik 20%',
  reason: 'r',
  main_risk: 'm',
  alternative: 'a',
};

describe('missingRequiredFor', () => {
  it('goal lengkap → []', () => {
    expect(missingRequiredFor('goal', FULL)).toEqual([]);
  });
  it('goal kosong → 4 field shared', () => {
    expect(missingRequiredFor('goal', {})).toEqual([
      'Nama', 'PIC', 'Periode mulai', 'Periode selesai',
    ]);
  });
  it('kpi_area + Target wajib', () => {
    const m = missingRequiredFor('kpi_area', { ...FULL, target: '   ' });
    expect(m).toEqual(['Target']);
  });
  it('strategy + reason/main_risk/alternative wajib', () => {
    const m = missingRequiredFor('strategy', {
      ...FULL, reason: '', main_risk: ' ', alternative: '',
    });
    expect(m).toEqual(['Alasan', 'Risiko Utama', 'Alternatif']);
  });
  it('initiative + target_result wajib', () => {
    const m = missingRequiredFor('initiative', { ...FULL, target_result: '' });
    expect(m).toEqual(['Target Hasil']);
  });
  it('development_area: shared field only (tidak ada extra)', () => {
    expect(missingRequiredFor('development_area', FULL)).toEqual([]);
    expect(missingRequiredFor('development_area', { name: 'x' })).toEqual([
      'PIC', 'Periode mulai', 'Periode selesai',
    ]);
  });
  it('problem_statement: shared field only', () => {
    expect(missingRequiredFor('problem_statement', FULL)).toEqual([]);
  });
});

describe('guardActivationFields', () => {
  it('lengkap → return false; alertImpl tak terpanggil', () => {
    const alertSpy = jest.fn();
    expect(guardActivationFields('goal', FULL, alertSpy)).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });
  it('kosong → return true + popup berisi label CARD + daftar field', () => {
    const alertSpy = jest.fn();
    const blocked = guardActivationFields('kpi_area', { name: 'KPI X' }, alertSpy);
    expect(blocked).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, msg] = alertSpy.mock.calls[0];
    expect(title).toBe('Lengkapi data wajib');
    expect(msg).toContain('KPI Area ini belum bisa diaktifkan');
    expect(msg).toContain('PIC');
    expect(msg).toContain('Periode mulai');
    expect(msg).toContain('Target');
  });
  it('strategy 3 reason fields kosong → semua dilist', () => {
    const alertSpy = jest.fn();
    const card = { ...FULL, reason: '', main_risk: '', alternative: '' };
    guardActivationFields('strategy', card, alertSpy);
    const [, msg] = alertSpy.mock.calls[0];
    expect(msg).toContain('Alasan');
    expect(msg).toContain('Risiko Utama');
    expect(msg).toContain('Alternatif');
  });
});

// WSA-04 — pesan guard tree §12.3: pola persis spec, mengacu type parent + next button.
describe('mbrBreakdownGuardMessage', () => {
  const kpiToStrategy: MbrCompliance = {
    child_card_type: 'strategy',
    child_count: 2,
    min_count: 3,
    enforcement_mode: 'blokir_akses_turunan',
    is_compliant: false,
  };

  it('KPI Area 2/3 Strategy → kalimat §12.3 persis (next button Initiative)', () => {
    const { title, message } = mbrBreakdownGuardMessage('KPI Area', kpiToStrategy, 'Initiative');
    expect(title).toBe('Kelengkapan Perencanaan');
    expect(message).toBe(
      'KPI Area ini baru punya 2 dari 3 Strategy. Tambahkan 1 Strategy lagi dulu, baru tombol + Initiative aktif.',
    );
  });
});

describe('confirmAddDescendantIfIncomplete', () => {
  const compliantMbr: MbrCompliance = {
    child_card_type: 'kpi_area',
    child_count: 3,
    min_count: 3,
    enforcement_mode: 'hanya_peringatan',
    is_compliant: true,
  };
  const incompleteMbr: MbrCompliance = {
    child_card_type: 'kpi_area',
    child_count: 2,
    min_count: 3,
    enforcement_mode: 'hanya_peringatan',
    is_compliant: false,
  };

  it('compliant → langsung onProceed (no popup)', () => {
    const onProceed = jest.fn();
    const alertSpy = jest.fn();
    confirmAddDescendantIfIncomplete({
      compliance: compliantMbr,
      parentLabel: 'Goal A',
      childLabel: 'KPI Area',
      onProceed,
      alertImpl: alertSpy,
    });
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  // WSA-04 — fail-CLOSED: data compliance belum ada → JANGAN buka form; tampilkan
  // pesan tunggu, onProceed tidak dipanggil (spec §12.3: klik tidak membuka form).
  it('compliance undefined (fail-closed) → onProceed TIDAK dipanggil + popup tunggu', () => {
    const onProceed = jest.fn();
    const alertSpy = jest.fn();
    confirmAddDescendantIfIncomplete({
      compliance: undefined,
      parentLabel: 'Goal',
      childLabel: 'KPI Area',
      onProceed,
      alertImpl: alertSpy,
    });
    expect(onProceed).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  // WSA-04 — non-compliant: pesan spec §12.3, TANPA CTA proceed (hanya "Tutup"),
  // onProceed tidak pernah dipanggil.
  it('non-compliant → popup spec §12.3, hanya "Tutup", onProceed tak pernah dipanggil', () => {
    const onProceed = jest.fn();
    const alertSpy = jest.fn();
    confirmAddDescendantIfIncomplete({
      compliance: incompleteMbr,
      parentLabel: 'Goal A',
      childLabel: 'KPI Area',
      onProceed,
      alertImpl: alertSpy,
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [, msg, buttons] = alertSpy.mock.calls[0];
    expect(msg).toContain('Goal A ini baru punya 2 dari 3 KPI Area');
    expect(msg).toContain('Tambahkan 1 KPI Area lagi dulu');
    // Hanya 1 tombol "Tutup"; tidak ada CTA yang membuka form.
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text).toBe('Tutup');
    expect(onProceed).not.toHaveBeenCalled();
  });
});
