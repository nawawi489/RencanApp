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

/**
 * Variabel shell yang TIDAK terekspansi — mis. `$STAGING_SUPABASE_URL` atau
 * `${STAGING_SUPABASE_URL}`.
 *
 * Ini bukan kasus hipotetis: blok `environment:` CircleCI memperlakukan nilainya sebagai
 * string literal tanpa ekspansi shell, sehingga `EXPO_PUBLIC_SUPABASE_URL: $STAGING_SUPABASE_URL`
 * mem-bundle teks `$STAGING_SUPABASE_URL` apa adanya. Nilai itu **lolos kedua guard di atas**
 * (tidak kosong, tidak mengandung marker placeholder), lalu `createClient()` gagal saat modul
 * dimuat dan aplikasi merender halaman putih TANPA error konsol. Staging web mati diam-diam
 * sejak 2026-07-21 dengan cara ini, melewati 56 commit dan puluhan deploy "sukses".
 */
function looksLikeUnexpandedShellVar(value: string): boolean {
  return /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(value.trim());
}

if (looksLikeUnexpandedShellVar(supabaseUrl) || looksLikeUnexpandedShellVar(supabaseAnonKey)) {
  // Pesan ini SENGAJA tidak memuat nama variabel CI mana pun secara literal. Gate CI
  // memindai bundel hasil export untuk mendeteksi env yang tidak terinterpolasi; kalau
  // pesan di sini menyebut token itu apa adanya, ia ikut ter-bundle dan gate-nya
  // mencocokkan dirinya sendiri. Itu benar-benar terjadi dan menggagalkan deploy #395.
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY berisi nama variabel shell yang ' +
      'tidak terekspansi (nilainya diawali tanda dolar). Blok `environment:` CircleCI tidak ' +
      'melakukan interpolasi — pindahkan penetapannya ke `command:`.',
  );
}

if (looksLikePlaceholder(supabaseUrl) || looksLikePlaceholder(supabaseAnonKey)) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY masih berisi nilai placeholder ' +
      '(mis. "REPLACE...", "<...>"). Isi nilai Supabase yang sebenarnya sebelum build.',
  );
}

/**
 * URL wajib benar-benar URL. Guard di atas menangkap bentuk yang sudah dikenal; ini menangkap
 * sisanya (string acak, host tanpa skema, nilai terpotong) sebelum `createClient()` melakukannya
 * di tempat yang errornya tidak terlihat siapa pun.
 */
try {
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('skema harus http/https');
  }
} catch {
  throw new Error(
    `EXPO_PUBLIC_SUPABASE_URL bukan URL http(s) yang valid: "${supabaseUrl}". ` +
      'Periksa nilai env pada build/deploy.',
  );
}

// S2-7: verified-host origin used as `redirectTo` for password recovery. Must
// be an HTTPS origin registered for Universal Links (iOS AASA) and Android
// App Links (assetlinks.json). Dev/local falls back to the app's ems:// deep
// link if unset, but staging/prod builds MUST set this env — the CI has a
// gate that fails the deploy if it's blank.
const rawAppLinkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST;
let appLinkHost: string | undefined;
if (rawAppLinkHost && rawAppLinkHost.trim() !== '') {
  try {
    const parsed = new URL(rawAppLinkHost);
    if (parsed.protocol !== 'https:') {
      throw new Error('EXPO_PUBLIC_APP_LINK_HOST must be https:// to be verifiable as a Universal/App Link');
    }
    // Normalize — no trailing slash so callers can concatenate a path safely.
    appLinkHost = parsed.origin;
  } catch (err) {
    throw new Error(
      `EXPO_PUBLIC_APP_LINK_HOST bukan URL https valid: "${rawAppLinkHost}". ` +
        `Perbaiki nilai env (staging/prod wajib set; dev lokal boleh kosong). ` +
        `Detail: ${(err as Error).message}`,
    );
  }
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  // App Links / Universal Links origin. `undefined` at dev-local time; login
  // screen falls back to the ems:// scheme in that case.
  appLinkHost,
};
