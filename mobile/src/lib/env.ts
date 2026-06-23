// Variabel publik Expo (di-bundle ke klien). Aman untuk URL + publishable/anon key Supabase.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variabel EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY belum diset. Salin .env.example menjadi .env lalu isi nilainya.',
  );
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
};
