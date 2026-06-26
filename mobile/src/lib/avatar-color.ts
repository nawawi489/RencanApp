// Warna avatar deterministik per orang (ganti gradient seragam yang tidak ter-scan).
// Palet dikurasi: semua cukup gelap untuk teks putih (kontras ≥ 4.5:1 / WCAG AA).

export const AVATAR_PALETTE = [
  '#1d4ed8', // blue-700
  '#6d28d9', // violet-700
  '#0f766e', // teal-700
  '#b45309', // amber-700
  '#be123c', // rose-700
  '#15803d', // green-700
  '#0369a1', // sky-700
  '#9333ea', // purple-600
] as const;

/** Hash stabil dari seed (id/nama) → indeks palet. Sama input → sama warna. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  // Unsigned shift menghindari Math.abs(INT_MIN) === INT_MIN bug → index negatif → undefined.
  const index = (hash >>> 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

/** Inisial dari nama: ambil 2 huruf pertama dari kata-kata. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
