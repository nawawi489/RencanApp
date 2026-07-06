// Regression: ISSUE-003 — timestamptz dirender UTC (slice string ISO mentah) di detail
// instance & riwayat review, mis. deadline 17:30 WIB tampil "10:30".
// formatDateTime kini menerima timezone IANA organisasi dan memformat di zona itu.
// Found by /qa on 2026-07-07
// Report: .gstack/qa-reports/qa-report-localhost-8081-2026-07-07.md
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null, isLoading: false, can: () => false }) }));

// eslint-disable-next-line import/first -- jest.mock must be declared before the import it mocks
import { formatDateTime } from '../submission-card';

describe('ISSUE-003 — formatDateTime timezone organisasi', () => {
  it('memformat UTC ke zona organisasi (Asia/Jakarta, +7)', () => {
    expect(formatDateTime('2026-07-06T10:30:00+00:00', 'Asia/Jakarta')).toBe('2026-07-06 17:30');
  });

  it('lintas hari: 17:20 UTC = 00:20 WIB hari berikutnya', () => {
    expect(formatDateTime('2026-07-06T17:20:00+00:00', 'Asia/Jakarta')).toBe('2026-07-07 00:20');
  });

  it('zona lain dihormati (Asia/Makassar, +8)', () => {
    expect(formatDateTime('2026-07-06T10:30:00Z', 'Asia/Makassar')).toBe('2026-07-06 18:30');
  });

  it('tanggal tak valid → fallback slice lama (tidak crash)', () => {
    expect(formatDateTime('bukan-tanggal', 'Asia/Jakarta')).toBe('bukan-tanggal');
  });

  it('timezone tak dikenal → fallback slice lama (tidak crash)', () => {
    expect(formatDateTime('2026-07-06T10:30:00Z', 'Zona/Ngawur')).toBe('2026-07-06 10:30');
  });
});
