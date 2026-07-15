import { parseMentions } from '../mention-parse';

describe('parseMentions', () => {
  it('body kosong → array kosong', () => {
    expect(parseMentions('', ['Budi'])).toEqual([]);
  });

  it('tanpa @nama cocok → satu segmen text utuh', () => {
    expect(parseMentions('halo tim', ['Budi'])).toEqual([{ kind: 'text', text: 'halo tim' }]);
  });

  it('names kosong → satu segmen text utuh (tanpa parse)', () => {
    expect(parseMentions('halo @Budi', [])).toEqual([{ kind: 'text', text: 'halo @Budi' }]);
  });

  it('satu mention di tengah → text + mention + text', () => {
    expect(parseMentions('halo @Budi apa kabar', ['Budi'])).toEqual([
      { kind: 'text', text: 'halo ' },
      { kind: 'mention', text: '@Budi' },
      { kind: 'text', text: ' apa kabar' },
    ]);
  });

  it('mention di awal → mention + text', () => {
    expect(parseMentions('@Budi tolong', ['Budi'])).toEqual([
      { kind: 'mention', text: '@Budi' },
      { kind: 'text', text: ' tolong' },
    ]);
  });

  it('mention di akhir → text + mention', () => {
    expect(parseMentions('tolong @Budi', ['Budi'])).toEqual([
      { kind: 'text', text: 'tolong ' },
      { kind: 'mention', text: '@Budi' },
    ]);
  });

  it('greedy: nama panjang menang atas prefix pendek', () => {
    // 'Budi Santoso' harus menang, bukan 'Budi'.
    expect(parseMentions('halo @Budi Santoso', ['Budi', 'Budi Santoso'])).toEqual([
      { kind: 'text', text: 'halo ' },
      { kind: 'mention', text: '@Budi Santoso' },
    ]);
  });

  it('case-insensitive match, teks output dari body asli (bukan nama kanonik)', () => {
    expect(parseMentions('halo @budi apa', ['Budi'])).toEqual([
      { kind: 'text', text: 'halo ' },
      { kind: 'mention', text: '@budi' },
      { kind: 'text', text: ' apa' },
    ]);
  });

  it('@ tanpa nama cocok → tetap text biasa', () => {
    expect(parseMentions('email @@bar', ['Budi'])).toEqual([
      { kind: 'text', text: 'email @@bar' },
    ]);
  });

  it('dua mention berurutan → dua segmen mention', () => {
    expect(parseMentions('@Budi @Sari go', ['Budi', 'Sari'])).toEqual([
      { kind: 'mention', text: '@Budi' },
      { kind: 'text', text: ' ' },
      { kind: 'mention', text: '@Sari' },
      { kind: 'text', text: ' go' },
    ]);
  });
});
