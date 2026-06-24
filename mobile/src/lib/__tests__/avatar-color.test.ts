import { AVATAR_PALETTE, avatarColor, initials } from '../avatar-color';

describe('avatarColor', () => {
  it('deterministik: input sama → warna sama', () => {
    expect(avatarColor('user-1')).toBe(avatarColor('user-1'));
    expect(avatarColor('Rina Jaya')).toBe(avatarColor('Rina Jaya'));
  });

  it('selalu dari palet terkurasi', () => {
    for (const seed of ['a', 'Rina', 'user-42', 'Dika Saputra', '']) {
      expect(AVATAR_PALETTE).toContain(avatarColor(seed));
    }
  });

  it('menyebar beberapa seed ke >1 warna', () => {
    const seeds = ['Rina', 'Arman', 'Maya', 'Dika', 'Budi', 'Sari', 'Tono', 'Wati'];
    const unique = new Set(seeds.map(avatarColor));
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('initials', () => {
  it('dua kata → 2 huruf', () => {
    expect(initials('Rina Jaya')).toBe('RJ');
    expect(initials('Dika Saputra')).toBe('DS');
  });
  it('satu kata → 2 huruf pertama', () => {
    expect(initials('Rina')).toBe('RI');
  });
  it('kosong → ?', () => {
    expect(initials('   ')).toBe('?');
  });
});
