// Parser render-side untuk @mention di body pesan. Murni (tanpa React).
// Cocokkan token '@Nama' (bisa satu atau dua kata) terhadap daftar nama anggota room, lalu belah
// body menjadi segmen 'text' vs 'mention'. Case-sensitive-loose (case-insensitive match; render
// pakai teks asli agar tak mengubah tampilan user).

export type MentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string };

/**
 * Belah `body` menjadi segmen text/mention berdasarkan `names` (nama anggota room).
 * Match greedy per posisi: nama TERPANJANG yang cocok di posisi '@' menang (agar 'Budi Santoso'
 * menang atas 'Budi' saat keduanya anggota). Case-insensitive; teks output pakai apa yang
 * user ketik (bukan nama kanonik) supaya rendering tak berubah.
 */
export function parseMentions(body: string, names: string[]): MentionSegment[] {
  if (!body) return [];
  if (names.length === 0) return [{ kind: 'text', text: body }];

  // Urutkan nama TERPANJANG dulu → greedy match "Budi Santoso" mengalahkan "Budi".
  const sorted = [...names].filter((n) => n.length > 0).sort((a, b) => b.length - a.length);

  const out: MentionSegment[] = [];
  let cursor = 0;
  let buffer = '';
  const lower = body.toLowerCase();

  while (cursor < body.length) {
    if (body[cursor] !== '@') {
      buffer += body[cursor];
      cursor++;
      continue;
    }
    // Kandidat mention di posisi cursor.
    const rest = lower.slice(cursor + 1);
    const matched = sorted.find((n) => rest.startsWith(n.toLowerCase()));
    if (!matched) {
      buffer += body[cursor];
      cursor++;
      continue;
    }
    if (buffer) {
      out.push({ kind: 'text', text: buffer });
      buffer = '';
    }
    const mentionText = '@' + body.slice(cursor + 1, cursor + 1 + matched.length);
    out.push({ kind: 'mention', text: mentionText });
    cursor += 1 + matched.length;
  }
  if (buffer) out.push({ kind: 'text', text: buffer });
  return out;
}
