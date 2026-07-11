// Completeness popups (PRD V1.8.2 §7.4 + §7.5). Pure helpers — Alert.alert di-mock via injection.
jest.mock('../supabase', () => ({ supabase: {} }));

import {
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
  it('strategy + Target wajib', () => {
    const m = missingRequiredFor('strategy', { ...FULL, target: '   ' });
    expect(m).toEqual(['Target']);
  });
  it('initiative + reason/main_risk/alternative wajib', () => {
    const m = missingRequiredFor('initiative', {
      ...FULL, reason: '', main_risk: ' ', alternative: '',
    });
    expect(m).toEqual(['Alasan', 'Risiko Utama', 'Alternatif']);
  });
  it('action_plan + target_result wajib', () => {
    const m = missingRequiredFor('action_plan', { ...FULL, target_result: '' });
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
    const blocked = guardActivationFields('strategy', { name: 'KPI X' }, alertSpy);
    expect(blocked).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, msg] = alertSpy.mock.calls[0];
    expect(title).toBe('Lengkapi data wajib');
    expect(msg).toContain('Strategy ini belum bisa diaktifkan');
    expect(msg).toContain('PIC');
    expect(msg).toContain('Periode mulai');
    expect(msg).toContain('Target');
  });
  it('initiative 3 reason fields kosong → semua dilist', () => {
    const alertSpy = jest.fn();
    const card = { ...FULL, reason: '', main_risk: '', alternative: '' };
    guardActivationFields('initiative', card, alertSpy);
    const [, msg] = alertSpy.mock.calls[0];
    expect(msg).toContain('Alasan');
    expect(msg).toContain('Risiko Utama');
    expect(msg).toContain('Alternatif');
  });
});

// WSA-04 — pesan guard tree §12.3: pola persis spec, mengacu type parent + next button.
describe('mbrBreakdownGuardMessage', () => {
  const kpiToInitiative: MbrCompliance = {
    child_card_type: 'initiative',
    child_count: 2,
    min_count: 3,
    enforcement_mode: 'blokir_akses_turunan',
    is_compliant: false,
  };

  it('Strategy 2/3 Initiative → kalimat §12.3 persis (next button Action Plan)', () => {
    const { title, message } = mbrBreakdownGuardMessage('Strategy', kpiToInitiative, 'Action Plan');
    expect(title).toBe('Kelengkapan Perencanaan');
    expect(message).toBe(
      'Strategy ini baru punya 2 dari 3 Initiative. Tambahkan 1 Initiative lagi dulu, baru tombol + Action Plan aktif.',
    );
  });
});
