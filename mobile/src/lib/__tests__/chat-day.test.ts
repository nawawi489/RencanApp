// Leaf pure — nowIso di-inject sebagai parameter, tanpa fake timers, tanpa RNTL.
// Kontrak: dayKey → 'YYYY-MM-DD' device tz | null (invalid); dividerLabel → 'Hari ini' | 'Kemarin' | 'd MMM' (id-ID) | null.
import { dayKey, dividerLabel } from '../chat-day';

describe('dayKey', () => {
  it('mengembalikan YYYY-MM-DD untuk ISO valid', () => {
    const local = new Date(2026, 5, 24, 12, 30, 0); // 24 Juni 2026 12:30 device tz
    expect(dayKey(local.toISOString())).toBe('2026-06-24');
  });

  it('null bila iso tidak dapat diparse', () => {
    expect(dayKey('not-a-date')).toBeNull();
  });

  it('tidak bertabrakan antar-tahun (23 Jun 2025 ≠ 23 Jun 2026)', () => {
    const a = new Date(2025, 5, 23, 12, 0, 0).toISOString();
    const b = new Date(2026, 5, 23, 12, 0, 0).toISOString();
    expect(dayKey(a)).not.toBe(dayKey(b));
  });
});

describe('dividerLabel', () => {
  const now = new Date(2026, 6, 14, 12, 0, 0).toISOString(); // 14 Juli 2026 device tz

  it("hari yang sama dgn now → 'Hari ini'", () => {
    const iso = new Date(2026, 6, 14, 5, 0, 0).toISOString();
    expect(dividerLabel(iso, now)).toBe('Hari ini');
  });

  it("H-1 → 'Kemarin'", () => {
    const iso = new Date(2026, 6, 13, 23, 30, 0).toISOString();
    expect(dividerLabel(iso, now)).toBe('Kemarin');
  });

  it("lebih tua → format 'd MMM' id-ID", () => {
    const iso = new Date(2026, 5, 23, 10, 0, 0).toISOString();
    expect(dividerLabel(iso, now)).toBe('23 Jun');
  });

  it('null bila iso invalid', () => {
    expect(dividerLabel('not-a-date', now)).toBeNull();
  });
});
