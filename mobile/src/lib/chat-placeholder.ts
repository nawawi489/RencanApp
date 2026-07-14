// chat-placeholder.ts — pure fn untuk placeholder composer chat.
// Menginterpolasi nama room agar konteks tetap muncul lintas jenis pekerjaan
// (spec inbox-chat-prototype-gap FR-4: dimensi variabel adalah nama, bukan
// jenis; chat_rooms.action_plan_id NOT NULL UNIQUE).

const FALLBACK = 'Tulis pesan…';

export function composerPlaceholder(roomName?: string | null): string {
  if (roomName == null) return FALLBACK;
  const trimmed = roomName.trim();
  if (!trimmed) return FALLBACK;
  return `Tulis pesan ke ${trimmed}`;
}
