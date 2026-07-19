// Variabel publik Expo (di-bundle ke klien). Aman untuk URL + publishable/anon key Supabase.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variabel EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY belum diset. Salin .env.example menjadi .env lalu isi nilainya.',
  );
}

// Guard placeholder: nilai template (mis. profil `production` di eas.json sebelum di-wire,
// atau hasil `cp .env.example .env` yang belum diisi) lolos check "kosong" di atas tapi
// menunjuk host fiktif. Tanpa guard ini, build produksi boot menembak
// `REPLACE-prod-project-ref.supabase.co`. Fail fast menutup kelas bug tersebut.
const PLACEHOLDER_MARKERS = ['replace', 'example', '<', '>'];

function looksLikePlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

if (looksLikePlaceholder(supabaseUrl) || looksLikePlaceholder(supabaseAnonKey)) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY masih berisi nilai placeholder ' +
      '(mis. "REPLACE...", "<...>"). Isi nilai Supabase yang sebenarnya sebelum build.',
  );
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
};
