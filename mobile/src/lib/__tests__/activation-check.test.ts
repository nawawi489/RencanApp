// Wave 3.2 — activation-check async rewrite (spec §5.2).
// - missingRequiredFor + guardActivationFields jadi async (await getCompletionRule).
// - Merge HARDCODED_CORE + admin extras.
// - Popup copy generic (PRD §7.4) — TIDAK menyebut nama field.
// - Offline fallback: kalau getCompletionRule throw, pakai HARDCODED_CORE only + logger.warn.
jest.mock('../supabase', () => ({ supabase: {} }));

const mockGetCompletionRule = jest.fn();
jest.mock('../card-rules', () => ({
  __esModule: true,
  getCompletionRule: (...args: unknown[]) => mockGetCompletionRule(...args),
}));

const mockWarn = jest.fn();
jest.mock('../logger', () => ({
  __esModule: true,
  createLogger: () => ({
    warn: (...args: unknown[]) => mockWarn(...args),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import {
  guardActivationFields,
  mbrBreakdownGuardMessage,
  missingRequiredFor,
} from '../activation-check';
import type { MbrCompliance } from '../settings-mbr';

const FULL_GOAL = {
  name: 'Goal X', pic_id: 'u1', period_start: '2026-01-01', period_end: '2026-12-31',
  target_value: '100',
};
const FULL_STRAT = { ...FULL_GOAL, target: 'Naik', expected_outcome: 'Hasil' };
const FULL_INIT = { ...FULL_STRAT, reason: 'r', main_risk: 'm', alternative: 'a' };
const FULL_AP = { ...FULL_GOAL, target_result: 'Hasil', team_id: 't1' };
const FULL_PS = { ...FULL_GOAL, impact: 'i' };

beforeEach(() => {
  mockGetCompletionRule.mockReset();
  mockWarn.mockReset();
  mockGetCompletionRule.mockResolvedValue({ requiredFields: [] });
});

describe('missingRequiredFor (async)', () => {
  it('goal lengkap + no admin extras → []', async () => {
    expect(await missingRequiredFor('org-A', 'goal', FULL_GOAL)).toEqual([]);
  });

  it('goal kosong → locked base 5 field', async () => {
    const missing = await missingRequiredFor('org-A', 'goal', {});
    expect(missing).toEqual(expect.arrayContaining(['Nama', 'PIC', 'Periode mulai', 'Periode selesai', 'Target Tahunan']));
  });

  it('strategy lengkap + admin extras kosong ["expected_outcome"] → []', async () => {
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: ['expected_outcome'] });
    expect(await missingRequiredFor('org-A', 'strategy', FULL_STRAT)).toEqual([]);
  });

  it('locked base per cardType — goal target_value tetap wajib (F1)', async () => {
    // Uncheck admin → set requiredFields=[]. Locked base tetap enforce target_value untuk goal.
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: [] });
    const missing = await missingRequiredFor('org-A', 'goal', { ...FULL_GOAL, target_value: '' });
    expect(missing).toContain('Target Tahunan');
  });

  it('locked base per cardType — strategy expected_outcome tetap wajib', async () => {
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: [] });
    const missing = await missingRequiredFor('org-A', 'strategy', { ...FULL_STRAT, expected_outcome: '' });
    expect(missing).toContain('Ekspektasi Hasil');
  });

  it('locked base per cardType — problem_statement impact wajib', async () => {
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: [] });
    const missing = await missingRequiredFor('org-A', 'problem_statement', { ...FULL_PS, impact: '' });
    expect(missing).toContain('Dampak');
  });

  it('locked base per cardType — action_plan team_id + target_result wajib', async () => {
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: [] });
    const missing = await missingRequiredFor('org-A', 'action_plan', { ...FULL_AP, team_id: null });
    expect(missing).toContain('Tim');
  });

  it('locked base per cardType — initiative reason/main_risk/alternative wajib', async () => {
    mockGetCompletionRule.mockResolvedValueOnce({ requiredFields: [] });
    const missing = await missingRequiredFor('org-A', 'initiative', { ...FULL_INIT, reason: '', main_risk: '', alternative: '' });
    expect(missing).toEqual(expect.arrayContaining(['Alasan', 'Risiko Utama', 'Alternatif']));
  });

  it('offline (getCompletionRule throw) → HARDCODED_CORE only + logger.warn', async () => {
    mockGetCompletionRule.mockRejectedValueOnce(new Error('offline'));
    const missing = await missingRequiredFor('org-A', 'goal', {});
    expect(missing).toContain('Nama');
    expect(mockWarn).toHaveBeenCalledWith(expect.objectContaining({ event: 'card_rule_offline_fallback', cardType: 'goal' }));
  });
});

describe('guardActivationFields (async, popup generic per PRD §7.4)', () => {
  it('lengkap → return false; alertImpl tak terpanggil', async () => {
    const alertSpy = jest.fn();
    expect(await guardActivationFields('org-A', 'goal', FULL_GOAL, alertSpy)).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('kosong → return true + popup GENERIC (PRD §7.4)', async () => {
    const alertSpy = jest.fn();
    const blocked = await guardActivationFields('org-A', 'strategy', { name: 'KPI X' }, alertSpy);
    expect(blocked).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, msg] = alertSpy.mock.calls[0];
    expect(title).toBe('Aktifkan Card');
    expect(msg).toBe('Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.');
  });

  it('popup TIDAK menyebut nama field spesifik', async () => {
    const alertSpy = jest.fn();
    await guardActivationFields('org-A', 'strategy', { name: 'KPI X' }, alertSpy);
    const [, msg] = alertSpy.mock.calls[0];
    // Tidak boleh mengandung nama field (PIC, Periode, Target, dst.)
    expect(msg).not.toMatch(/PIC|Periode mulai|Periode selesai|Target/);
  });
});

describe('mbrBreakdownGuardMessage (tetap sync)', () => {
  const kpiToInitiative: MbrCompliance = {
    child_card_type: 'initiative',
    child_count: 2,
    min_count: 3,
    enforcement_mode: 'blokir_akses_turunan',
    is_compliant: false,
  };

  it('kalimat §12.3 persis (next button Rencana Aksi)', () => {
    const { title, message } = mbrBreakdownGuardMessage('Strategi', kpiToInitiative, 'Rencana Aksi');
    expect(title).toBe('Kelengkapan Perencanaan');
    expect(message).toBe(
      'Strategi ini baru punya 2 dari 3 Inisiatif. Tambahkan 1 Inisiatif lagi dulu, baru tombol + Rencana Aksi aktif.',
    );
  });
});
