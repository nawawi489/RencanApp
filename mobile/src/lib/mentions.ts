// Helper @mention untuk composer chat. Murni (tanpa React) → mudah diuji unit.
// Alur: ketik '@' + token → picker anggota; pilih → sisip '@{nama} ' + catat id; saat kirim, hanya
// id yang '@{nama}'-nya MASIH ada di body yang dikirim (buang mention yang sudah user hapus).

export type MentionPick = { id: string; name: string };

/**
 * Query mention aktif = token setelah '@' terakhir yang belum ditutup spasi, di UJUNG teks.
 * '@' persis di ujung → '' (picker tampilkan semua anggota). Tidak ada '@' terbuka → null.
 */
export function matchMentionQuery(text: string): string | null {
  const m = /@([^@\s]*)$/.exec(text);
  return m ? m[1] : null;
}

/** Ganti '@query' di ujung dengan '@{name} ' (spasi penutup agar picker menutup). */
export function applyMention(text: string, name: string): string {
  return text.replace(/@([^@\s]*)$/, `@${name} `);
}

/** Id mention yang MASIH direferensikan '@{name}' di body (buang yang dihapus). Unik. */
export function collectMentionIds(body: string, selected: MentionPick[]): string[] {
  const ids = new Set<string>();
  for (const p of selected) {
    if (body.includes(`@${p.name}`)) ids.add(p.id);
  }
  return [...ids];
}
