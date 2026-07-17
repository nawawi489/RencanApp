# Rencanapp Mobile — Nyantuy Group

Aplikasi mobile **Rencanapp** (**V1.83**, Execution Project Management). Bagian dari repo [RencanApp](../). PRD: [`PRD.md`](../PRD.md) / [`prd/`](../prd) · Urutan build: [`BUILD-PLAN.md`](../BUILD-PLAN.md).

## Stack

Expo (SDK 56) + Expo Router · TypeScript · NativeWind v5 / Tailwind v4 (`react-native-css`) · Supabase (Auth + Postgres + RLS) · TanStack Query · Sentry (`@sentry/react-native`) · Jest (`jest-expo`).

## Status: pengembangan aktif, lewat dari fase fondasi

Implementasi sudah jauh melampaui shell awal. Cakupan saat ini mencakup:

- Auth (masuk/daftar email + kata sandi), sesi persisten via `expo-secure-store`.
- Route guard: `(auth)` untuk yang belum login, `(app)` untuk yang sudah login.
- Navigasi 5 tab: **Home · Notif · Workspace · Inbox · Menu** (Menu memuat People, profil, dan layar admin/pengaturan — lihat [`(tabs)/_layout.tsx`](src/app/(app)/(tabs)/_layout.tsx)).
- Card execution engine penuh: Goal → KPI Area → Strategy → Initiative → Action Plan (one time & repeat), bukti, review, submission versioning.
- People & Score (evaluasi, manual score override, close-period), Governance Violation, Activity Log.
- Inbox/chat per Rencana Aksi: realtime, reaksi, lampiran, reply-quote, system event, unread badge.
- Push notification (device push via outbox + Edge Function drainer).
- Migrasi DB berjalan sampai `00xx` (lihat [`../supabase/migrations`](../supabase/migrations) untuk nomor terbaru) + RLS + seed Nyantuy Group.

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
      (tabs)/                index, notifications, workspace, inbox, menu
      goal/ initiative/ action-plan/ strategy/ task/       Card execution engine
      development-area/ problem-statement/                 Development workspace
      people.tsx people-profile/                           People & Score
      settings-*.tsx                                       Layar admin/pengaturan (per topik)
      evaluation.tsx manual-score-override.tsx deadline-change-request.tsx search.tsx
  lib/         supabase.ts, env.ts, database.types.ts
  providers/   auth-provider.tsx, theme-provider.tsx
  hooks/       custom hooks (mis. use-inbox.ts)
  components/  komponen reusable (app-header, screen, dst.)
```

## Perintah

- `npm start` / `npm run start:staging` / `npm run start:prod` — dev server (Metro), per environment
- `npm run android` / `npm run ios` / `npm run web` (+ varian `:staging` / `:prod` untuk web)
- `npm run type-check` — `tsc --noEmit`
- `npm run lint` — `expo lint` (konfigurasi di [`eslint.config.js`](eslint.config.js))
- `npm test` / `npm run test:watch` / `npm run test:ci` — Jest (`jest-expo`)

## Regenerasi tipe DB

Setelah skema berubah:

```bash
npx supabase gen types typescript --project-id fhnqwytqprsptjshoxfn > src/lib/database.types.ts
```
