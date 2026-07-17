// Pure fn — placeholder composer chat, diinterpolasi dari nama room.
// Kontrak: nama valid → 'Tulis pesan ke {nama}'; kosong/null/whitespace → 'Tulis pesan…'.
import { composerPlaceholder } from '../chat-placeholder';

describe('composerPlaceholder', () => {
  it('menginterpolasi nama room saat tersedia', () => {
    expect(composerPlaceholder('Campaign Paket Hemat')).toBe('Tulis pesan ke Campaign Paket Hemat');
  });

  it('fallback ke "Tulis pesan…" saat null / undefined / whitespace / kosong', () => {
    expect(composerPlaceholder(null)).toBe('Tulis pesan…');
    expect(composerPlaceholder(undefined)).toBe('Tulis pesan…');
    expect(composerPlaceholder('')).toBe('Tulis pesan…');
    expect(composerPlaceholder('   ')).toBe('Tulis pesan…');
  });

  it('membuang whitespace ujung dalam nama', () => {
    expect(composerPlaceholder('  SOP Shift Pagi  ')).toBe('Tulis pesan ke SOP Shift Pagi');
  });
});
