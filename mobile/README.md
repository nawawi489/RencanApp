# Rencanapp Mobile — Nyantuy Group

Aplikasi mobile **Rencanapp** (**V1.83**, Execution Project Management). Bagian dari repo [RencanApp](../). PRD: [`prd/`](../prd) · Urutan build: [`BUILD-PLAN.md`](../BUILD-PLAN.md).

## Stack

Expo (SDK 56) + Expo Router · TypeScript · NativeWind v5 / Tailwind v4 (`react-native-css`) · Supabase (Auth + Postgres + RLS) · TanStack Query.

## Status: Fase 0 — Fondasi & Shell

- Auth (masuk/daftar email + kata sandi), sesi persisten via AsyncStorage.
- Route guard: `(auth)` untuk yang belum login, `(app)` untuk yang sudah login.
- Navigasi 5 surface: **Home · Notifications · Workspace · Inbox · People** (shell), + **Settings** lewat ikon profil.
- DB Fase 0 + RLS + seed Nyantuy Group (lihat [`../supabase/migrations`](../supabase/migrations)).

## Menjalankan

```bash
cd mobile
npm install                 # jika belum
cp .env.example .env        # lalu isi nilai Supabase (lihat di bawah)
npm start                   # buka di Expo Go / dev client (tekan a=Android, i=iOS, w=web)
```

### Variabel lingkungan (`.env`)

```
EXPO_PUBLIC_SUPABASE_URL=https://fhnqwytqprsptjshoxfn.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Gunakan **publishable/anon key**, bukan `service_role`. Nilai `EXPO_PUBLIC_*` di-bundle ke klien.

## Struktur

```
src/
  app/
    _layout.tsx              Provider (QueryClient, Auth, SafeArea, Theme) + gate awal
    (auth)/login.tsx         Layar masuk/daftar
    (app)/
      (tabs)/                5 surface utama
      settings.tsx           Profil + keluar + daftar pengaturan (bertahap)
  lib/        supabase.ts, env.ts, database.types.ts
  providers/  auth-provider.tsx
  components/ screen.tsx
```

## Perintah

- `npm start` — dev server (Metro)
- `npm run android` / `npm run ios` / `npm run web`
- `npx tsc --noEmit` — typecheck

## Regenerasi tipe DB

Setelah skema berubah:

```bash
npx supabase gen types typescript --project-id fhnqwytqprsptjshoxfn > src/lib/database.types.ts
```
