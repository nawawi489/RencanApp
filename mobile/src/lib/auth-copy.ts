// Copy UI khusus jalur autentikasi (login.tsx, reset). Terkunci agar test merujuk
// konstanta, bukan literal. Pola sama dengan workspace-copy.ts.
//
// Catatan: server (Supabase Auth) menegakkan panjang password saat sign-UP, bukan
// sign-IN. Karena app ini login-only (PRD §39), client adalah SATU-satunya sinyal
// panjang di jalur login — konstanta ini dipakai baik oleh guard client di
// login.tsx maupun terjemahan pesan Supabase 'password should be at least' (yang
// muncul di jalur reset-password).

export const AUTH_COPY = {
  passwordTooShort: 'Kata sandi minimal 6 karakter.',
  networkUnavailable: 'Tidak dapat terhubung ke server. Cek koneksi internet Anda.',
  // Fallback untuk error tak terduga (mis. 5xx server / kondisi GoTrue aneh).
  // WAJIB dipakai alih-alih membocorkan pesan teknis mentah ke user — pernah
  // muncul "{}" mentah di banner login saat GoTrue balas 500.
  unexpected: 'Terjadi kesalahan. Coba lagi sebentar atau hubungi admin.',
} as const;
