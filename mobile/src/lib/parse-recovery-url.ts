// Supabase recovery link mengarahkan user ke `redirectTo` dengan token di URL
// fragment (#…) atau query (?…). Client React Native kita menyetel
// `detectSessionInUrl: false`, jadi parsing manual di sisi app.
//
// Kontrak: input string URL apa pun; output pasangan token bila DAN HANYA BILA
// URL benar-benar membawa recovery session (type=recovery + keduanya ada).

export type RecoveryTokens = {
  accessToken: string;
  refreshToken: string;
};

export function parseRecoveryUrl(url: string | null | undefined): RecoveryTokens | null {
  if (!url) return null;
  // Ambil bagian setelah '#' atau '?', mana pun ada. Prioritas '#' karena itu
  // format default Supabase; fallback '?' menutup varian jalur lain (mis. web).
  const hashIdx = url.indexOf('#');
  const qIdx = url.indexOf('?');
  const idx = hashIdx >= 0 ? hashIdx : qIdx;
  if (idx < 0) return null;
  const raw = url.slice(idx + 1);
  const params = new URLSearchParams(raw);
  if (params.get('type') !== 'recovery') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}
