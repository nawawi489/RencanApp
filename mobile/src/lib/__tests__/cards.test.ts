// Contoh test untuk membuktikan runner berjalan (hijau).
// cards.ts meng-import ./supabase di top-level, jadi kita mock agar tidak
// membuat client / butuh env saat import. Test ini hanya menguji logika murni.
jest.mock('../supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first -- jest.mock must be declared before the import it mocks
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  STATUS_TONE,
} from '../cards';

describe('cards label maps', () => {
  it('memetakan status initiative ke label Indonesia', () => {
    expect(INITIATIVE_STATUS_LABEL.active).toBe('Aktif');
    expect(INITIATIVE_STATUS_LABEL.done).toBe('Selesai');
  });

  it('memetakan status action plan ke label Indonesia', () => {
    expect(ACTION_PLAN_STATUS_LABEL.submitted).toBe('Menunggu Review');
    expect(ACTION_PLAN_STATUS_LABEL.revision).toBe('Revisi Diperlukan');
  });

  it('memberi tone semantik yang benar per status', () => {
    expect(STATUS_TONE.revision).toBe('danger');
    expect(STATUS_TONE.done).toBe('success');
    expect(STATUS_TONE.submitted).toBe('warn');
  });
});
