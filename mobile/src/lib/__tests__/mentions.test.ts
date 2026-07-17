import { applyMention, collectMentionIds, matchMentionQuery } from '../mentions';

describe('matchMentionQuery', () => {
  it('token setelah @ di ujung → query', () => {
    expect(matchMentionQuery('halo @bud')).toBe('bud');
  });
  it('@ persis di ujung → string kosong (tampilkan semua)', () => {
    expect(matchMentionQuery('halo @')).toBe('');
  });
  it('tak ada @ terbuka → null', () => {
    expect(matchMentionQuery('halo tim')).toBeNull();
  });
  it('@ diikuti spasi (token tertutup) → null', () => {
    expect(matchMentionQuery('halo @Budi ')).toBeNull();
  });
  it('@ di tengah, bukan ujung → null', () => {
    expect(matchMentionQuery('@Budi apa kabar')).toBeNull();
  });
});

describe('applyMention', () => {
  it('mengganti @query di ujung dengan @Nama + spasi', () => {
    expect(applyMention('halo @bud', 'Budi Santoso')).toBe('halo @Budi Santoso ');
  });
  it('@ kosong di ujung → sisip nama', () => {
    expect(applyMention('halo @', 'Budi')).toBe('halo @Budi ');
  });
});

describe('collectMentionIds', () => {
  const selected = [
    { id: 'u1', name: 'Budi' },
    { id: 'u2', name: 'Sari' },
  ];
  it('hanya id yang @nama-nya masih ada di body', () => {
    expect(collectMentionIds('halo @Budi', selected)).toEqual(['u1']);
  });
  it('mention yang dihapus tidak dikirim', () => {
    expect(collectMentionIds('halo semua', selected)).toEqual([]);
  });
  it('dua mention hadir → dua id (unik)', () => {
    expect(collectMentionIds('@Budi dan @Sari', selected)).toEqual(['u1', 'u2']);
  });
  it('nama sama terpilih dua kali → id unik', () => {
    const dup = [
      { id: 'u1', name: 'Budi' },
      { id: 'u1', name: 'Budi' },
    ];
    expect(collectMentionIds('@Budi', dup)).toEqual(['u1']);
  });
});
