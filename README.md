# RencanApp

**RencanApp** adalah repositori implementasi produk **Rencanapp**, sebuah **Execution Project Management V1.83** untuk membantu perusahaan memecah target besar menjadi aksi nyata yang bisa dijalankan, dipantau, direview, dibuktikan, dan dituntaskan.

Rencanapp dirancang untuk menggantikan pola follow-up manual yang tersebar di chat dengan alur kerja yang memiliki konteks, delegasi yang jelas, bukti kerja, hasil terukur, dan audit trail yang rapi.

## Daftar Isi

1. [Judul Proyek dan Deskripsi Umum](#judul-proyek-dan-deskripsi-umum)
2. [Prasyarat Sistem](#prasyarat-sistem)
3. [Panduan Instalasi Langkah-demi-Langkah](#panduan-instalasi-langkah-demi-langkah)
4. [Panduan Penggunaan](#panduan-penggunaan)
5. [Struktur Direktori Proyek](#struktur-direktori-proyek)
6. [Panduan Kontribusi](#panduan-kontribusi)
7. [Lisensi](#lisensi)
8. [Informasi Kontak dan Dukungan](#informasi-kontak-dan-dukungan)
9. [Testing dan Deployment](#testing-dan-deployment)
10. [Dokumentasi Tambahan](#dokumentasi-tambahan)

## Judul Proyek dan Deskripsi Umum

### Nama Resmi

- **Nama repositori:** `RencanApp`
- **Nama produk:** `Rencanapp`
- **Aturan penamaan:** pakai `Rencanapp` untuk nama produk pada UI, dokumen produk, dan desain; pakai `RencanApp` hanya saat merujuk repo, path, atau identifier teknis yang sudah baku.
- **Versi produk acuan:** `V1.83`
- **Versi paket aplikasi mobile saat ini:** `1.0.0` (`mobile/package.json`)
- **Status pengembangan:** `Aktif`. Implementasi sudah melewati fase fondasi — card execution engine (Goal/KPI Area/Strategy/Initiative/Action Plan, one time & repeat), People & Score, chat/Inbox (realtime, reaksi, lampiran), dan push notification sudah berjalan. Rujuk [`BUILD-PLAN.md`](./BUILD-PLAN.md) untuk definisi tiap fase dan [`supabase/migrations/`](./supabase/migrations/) untuk migrasi terbaru sebagai penanda progres paling akurat.

### Tujuan Utama

Rencanapp membantu organisasi memastikan pekerjaan tidak berjalan tanpa arah. Sistem ini menghubungkan tujuan bisnis dan pekerjaan harian melalui struktur card berikut:

- **Performance Workspace:** `Goal -> KPI Area -> Strategy -> Initiative -> Action Plan`
- **Development Workspace:** `Development Area -> Problem Statement / Development Goal -> Initiative -> Action Plan`

### Masalah yang Diselesaikan

Proyek ini ditujukan untuk mengatasi beberapa masalah umum dalam eksekusi kerja:

- follow-up pekerjaan yang masih bergantung pada chat dan ingatan manual,
- tugas yang tidak memiliki konteks strategis yang jelas,
- sulitnya menelusuri siapa PIC, reviewer, deadline, dan hasil kerja,
- kurangnya bukti, review, dan jejak audit dalam pelaksanaan kerja,
- sulitnya membedakan antara progress, hasil, dan kualitas eksekusi.

### Fitur Inti Produk

Secara produk, Rencanapp V1.83 mencakup:

- manajemen card berbasis hirarki untuk performance dan development workspace,
- Action Plan `one time` dan `repeat`,
- bukti kerja, nilai hasil, review, dan submission versioning,
- permission berbasis tanggung jawab melalui PIC, Reviewer, dan turunan card,
- surface utama: `Home`, `Notifications`, `Workspace`, `Inbox`, dan `People`,
- governance melalui `Activity Log` dan `Governance Violation`.

### Fitur yang Sudah Tersedia di Kode Saat Ini

Berdasarkan implementasi repo saat ini, fitur yang sudah tersedia adalah:

- autentikasi email/password menggunakan Supabase Auth, sesi persisten via `expo-secure-store`,
- route guard antara area `(auth)` dan `(app)`,
- navigasi 5 tab (`Home`, `Notif`, `Workspace`, `Inbox`, `Menu` — `People` dan pengaturan digabung ke tab `Menu`),
- card execution engine penuh: hierarki Goal → KPI Area → Strategy → Initiative → Action Plan (one time & repeat), bukti kerja, review, submission versioning,
- People & Score: evaluasi, manual score override, close-period,
- Governance Violation dan Activity Log,
- Inbox/chat per Rencana Aksi: realtime, reaksi, lampiran, reply-quote, system event, unread badge,
- push notification (outbox + Edge Function drainer ke device),
- puluhan migrasi database Supabase (lihat [`supabase/migrations/`](./supabase/migrations/)) dengan RLS dan seed data awal `Nyantuy Group`.

## Prasyarat Sistem

### Perangkat Lunak Utama

Sebelum menjalankan proyek, siapkan dependensi berikut:

| Komponen | Kebutuhan |
| --- | --- |
| Sistem operasi | Windows, macOS, atau Linux |
| Git | Diperlukan untuk clone repository |
| Node.js | Gunakan **Node.js LTS** yang kompatibel dengan Expo SDK 56 |
| npm | Mengikuti instalasi Node.js |
| Supabase Project | Wajib untuk Auth dan database |
| Expo Go / Emulator / Browser | Dibutuhkan untuk menjalankan aplikasi |

### Prasyarat Pengembangan per Platform

| Target | Prasyarat |
| --- | --- |
| Android | Android Studio atau perangkat fisik dengan Expo Go |
| iOS | macOS + Xcode Simulator atau perangkat fisik dengan Expo Go |
| Web | Browser modern |

### Dependensi Inti di Repo

Berikut versi library utama yang saat ini dipakai oleh aplikasi mobile:

| Library | Versi |
| --- | --- |
| `expo` | `~56.0.12` |
| `expo-router` | `~56.2.11` |
| `react` | `19.2.3` |
| `react-native` | `0.85.3` |
| `@supabase/supabase-js` | `^2.108.2` |
| `@tanstack/react-query` | `^5.101.0` |
| `nativewind` | `5.0.0-preview.4` |
| `tailwindcss` | `^4` |
| `typescript` | `~6.0.3` |

### Variabel Lingkungan

Aplikasi mobile membutuhkan variabel berikut:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Catatan penting:

- gunakan **publishable/anon key**, bukan `service_role`,
- nilai `EXPO_PUBLIC_*` akan dibundel ke klien,
- repo sudah menyediakan template `mobile/.env.example` (serta `.env.staging.example` dan `.env.production.example` untuk environment lain) — tinggal disalin dan diisi.

## Panduan Instalasi Langkah-demi-Langkah

### 1. Clone Repository

```bash
git clone https://github.com/nawawi489/RencanApp.git
cd RencanApp
```

### 2. Masuk ke Aplikasi Mobile

```bash
cd mobile
```

### 3. Instal Dependensi

```bash
npm install
```

Jika Anda menggunakan PowerShell di Windows dan terkena masalah execution policy, gunakan:

```bash
npm.cmd install
```

### 4. Buat File Environment

Salin template yang sudah ada, lalu isi dengan kredensial Supabase:

```bash
cp mobile/.env.example mobile/.env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Siapkan Backend Supabase

Ada dua pendekatan yang dapat dipakai:

#### Opsi A - Menggunakan Project Supabase yang Sudah Ada

Jika tim Anda sudah memiliki project Supabase aktif, cukup:

1. ambil `Project URL`,
2. ambil `anon/publishable key`,
3. masukkan nilainya ke `mobile/.env`.

#### Opsi B - Menyiapkan Project Supabase Baru

Jika Anda membuat environment baru, lakukan langkah berikut:

1. buat project baru di Supabase,
2. jalankan file migrasi SQL pada folder `supabase/migrations/` secara berurutan,
3. pastikan seluruh tabel awal, RLS, dan seed data dasar berhasil dibuat.

Migrasi diberi nomor urut (`0001_...` sampai nomor tertinggi saat ini, puluhan file) dan harus diterapkan **berurutan sesuai nomor** — lihat daftar lengkapnya langsung di [`supabase/migrations/`](./supabase/migrations/), jangan berpatokan pada daftar statis karena migrasi baru ditambahkan seiring fitur berjalan.

Repo sudah menyertakan `supabase/config.toml` minimal (untuk Edge Functions). Untuk pengembangan lokal penuh gunakan Supabase CLI (`supabase start`); untuk menerapkan ke project remote, jalankan migrasi lewat SQL Editor atau workflow internal tim.

### 6. Jalankan Aplikasi di Lingkungan Lokal

```bash
npm start
```

Jika diperlukan, gunakan versi PowerShell:

```bash
npm.cmd start
```

Setelah server development aktif:

- tekan `a` untuk Android,
- tekan `i` untuk iOS,
- tekan `w` untuk web.

### 7. Verifikasi Setup Awal

Jika environment sudah benar, aplikasi akan:

- membuka layar login/daftar,
- dapat menggunakan Supabase Auth,
- berpindah ke area aplikasi setelah login,
- memuat shell lima surface utama.

## Panduan Penggunaan

### Alur Penggunaan Dasar

1. jalankan aplikasi dengan `npm start`,
2. daftar akun baru atau masuk dengan email dan kata sandi,
3. setelah login, aplikasi mengarahkan pengguna ke area utama,
4. telusuri tab `Home`, `Notif`, `Workspace`, `Inbox`, `Menu` (People, profil, dan pengaturan admin ada di dalam `Menu`),
5. buka `Menu` untuk melihat profil, People, dan layar pengaturan bertahap sesuai permission.

### Perintah Utama

| Perintah | Fungsi |
| --- | --- |
| `npm start` | Menjalankan Expo development server (varian `start:staging` / `start:prod` untuk environment lain) |
| `npm run android` | Menjalankan aplikasi untuk Android |
| `npm run ios` | Menjalankan aplikasi untuk iOS |
| `npm run web` | Menjalankan aplikasi di browser (varian `web:staging` / `web:prod`) |
| `npm run type-check` | Menjalankan type-check TypeScript (`tsc --noEmit`) |
| `npm run lint` | Menjalankan lint melalui Expo CLI |
| `npm test` | Menjalankan test suite Jest (`test:watch` / `test:ci` untuk mode lain) |

### Contoh Penggunaan Internal Supabase Client

Contoh berikut menunjukkan pola penggunaan client Supabase di aplikasi:

```ts
import { supabase } from '@/lib/supabase';

const { data, error } = await supabase
  .from('profiles')
  .select('full_name, email')
  .single();
```

Client tersebut dikonfigurasi di `mobile/src/lib/supabase.ts` menggunakan:

- session persistence dengan `AsyncStorage`,
- `autoRefreshToken`,
- refresh token yang aktif hanya saat aplikasi berada pada state aktif.

### Regenerasi Tipe Database

Setelah skema database berubah, tipe Supabase dapat diregenerasi dengan:

```bash
npx supabase gen types typescript --project-id fhnqwytqprsptjshoxfn > src/lib/database.types.ts
```

Jalankan perintah ini dari folder `mobile/` dan sesuaikan `project-id` jika Anda memakai project Supabase yang berbeda.

## Struktur Direktori Proyek

Struktur utama repository:

```text
RencanApp/
├── mobile/                 # Aplikasi mobile Expo / React Native
├── supabase/               # SQL migrations untuk database dan security hardening
├── prd/                    # PRD yang sudah dipecah per topik
├── docs/                   # Catatan spec/TDD/testing per topik
├── wiki/                   # Knowledge base proyek berbasis Markdown/Obsidian
├── scripts/                # Script operasional (mis. apply migrasi ke staging)
├── workers/                # Cloudflare Worker (proxy staging)
├── BUILD-PLAN.md           # Rencana build terfase
├── DESIGN.md               # Sumber kebenaran token desain (binding untuk mobile/src)
├── PRD.md                  # PRD utama produk Rencanapp V1.83
└── CLAUDE.md               # Aturan pemeliharaan wiki proyek
```

Struktur penting di dalam `mobile/`:

```text
mobile/
├── assets/                 # Ikon, gambar, dan aset visual
├── src/
│   ├── app/                # Routing aplikasi berbasis Expo Router
│   │   ├── (auth)/         # Flow autentikasi
│   │   └── (app)/          # Area aplikasi setelah login: (tabs), goal/, initiative/,
│   │                       # action-plan/, strategy/, task/, development-area/,
│   │                       # problem-statement/, people.tsx, settings-*.tsx, dll.
│   ├── components/         # Komponen UI reusable
│   ├── constants/          # Konstanta aplikasi
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Integrasi environment, Supabase, dan database types
│   └── providers/          # Context/provider aplikasi (auth, theme)
├── app.json                # Konfigurasi Expo
├── eas.json                # Profil build/submit EAS
├── eslint.config.js        # Konfigurasi ESLint (Expo flat config)
├── metro.config.js         # Konfigurasi Metro + NativeWind
└── package.json            # Dependensi dan skrip aplikasi (termasuk Jest)
```

Penjelasan singkat folder lain:

- `supabase/migrations/` menyimpan migrasi SQL berurutan (puluhan file per commit terakhir) untuk foundation, fitur, dan hardening,
- `prd/` berisi dokumen kebutuhan sistem yang menjadi acuan produk,
- `docs/` berisi catatan spec, TDD plan, dan laporan testing manual per topik,
- `wiki/` berisi rangkuman konsep, entitas, dan log pengembangan untuk kebutuhan knowledge management,
- `workers/staging-proxy/` adalah Cloudflare Worker yang meneruskan `staging.rencanapp.com` ke EAS Hosting.

## Panduan Kontribusi

Kontribusi sangat dianjurkan selama mengikuti pola kerja repository ini.

### Prinsip Umum

- buat perubahan kecil, terarah, dan mudah diuji,
- jangan hardcode secret, token, atau credential,
- pertahankan Bahasa Indonesia sebagai bahasa utama UI,
- ikuti pola stack yang sudah dipakai: Expo Router, TypeScript, Supabase, dan NativeWind,
- hindari scope creep yang bertentangan dengan `PRD.md` dan `BUILD-PLAN.md`.

### Langkah Kontribusi yang Disarankan

1. buat branch baru dari branch utama,
2. lakukan perubahan pada area yang relevan,
3. jika mengubah perilaku penting, perbarui dokumentasi terkait,
4. jalankan pengecekan yang relevan sebelum mengajukan PR,
5. buka pull request dengan deskripsi yang jelas.

### Standar Pull Request

Setiap pull request sebaiknya memuat:

- ringkasan perubahan,
- alasan perubahan,
- area yang terdampak,
- langkah verifikasi,
- screenshot atau rekaman singkat jika ada perubahan UI,
- referensi issue atau dokumen produk jika relevan.

### Pelaporan Bug

Saat melaporkan bug, sertakan minimal:

- langkah reproduksi,
- hasil yang diharapkan,
- hasil aktual,
- environment yang dipakai,
- screenshot atau log error jika tersedia.

## Lisensi

Saat ini repository root **belum mendeklarasikan lisensi proyek secara eksplisit**.

Catatan:

- file `mobile/LICENSE` berisi lisensi MIT bawaan template Expo,
- file tersebut **tidak boleh diasumsikan** otomatis berlaku untuk seluruh repository tanpa keputusan maintainer,
- jika proyek ini akan dipublikasikan atau dibagikan lebih luas, maintainer disarankan menambahkan file `LICENSE` di root repository agar hak penggunaan, modifikasi, dan distribusi menjadi jelas.

## Informasi Kontak dan Dukungan

### Kanal Utama

- Repository: <https://github.com/nawawi489/RencanApp>
- Issue tracker: <https://github.com/nawawi489/RencanApp/issues>

### Sumber Dokumentasi Internal

- PRD utama: [`PRD.md`](./PRD.md)
- Build plan: [`BUILD-PLAN.md`](./BUILD-PLAN.md)
- PRD terpecah: [`prd/`](./prd/)
- Dokumentasi aplikasi mobile saat ini: [`mobile/README.md`](./mobile/README.md)
- Knowledge base proyek: [`wiki/`](./wiki/)

Jika Anda membutuhkan bantuan teknis, gunakan issue tracker untuk bug, permintaan perbaikan, atau klarifikasi implementasi.

## Testing dan Deployment

### Status Testing Saat Ini

Pengecekan yang tersedia di `mobile/package.json`:

- `npm run type-check` (`tsc --noEmit`) untuk verifikasi type-safety,
- `npm run lint` (`expo lint`) dengan konfigurasi ESLint yang sudah ada di [`mobile/eslint.config.js`](./mobile/eslint.config.js),
- `npm test` / `npm run test:ci` menjalankan test suite Jest (`jest-expo` + `@testing-library/react-native`) mencakup unit test komponen, hooks, dan util di seluruh `src/`.

### Cara Menjalankan Verifikasi

Dari folder `mobile/`:

```bash
npm run type-check
npm run lint
npm test
```

Untuk CI (non-interaktif, satu proses):

```bash
npm run test:ci
```

### Status Deployment Saat Ini

Status deployment yang dapat disimpulkan dari repository:

- backend menggunakan Supabase sebagai managed service, migrasi database disimpan di `supabase/migrations/`,
- aplikasi web dikonfigurasi sebagai SPA melalui `mobile/app.json` dengan `web.output: "single"`,
- profil build/submit native sudah dikonfigurasi di [`mobile/eas.json`](./mobile/eas.json) (EAS Build/Submit),
- environment `staging` sudah live di `staging.rencanapp.com` lewat Cloudflare Worker proxy ([`workers/staging-proxy/`](./workers/staging-proxy/)) yang meneruskan ke EAS Hosting,
- error tracking terpasang lewat `@sentry/react-native` di sisi mobile,
- belum ada pipeline CI/CD terpusat (mis. GitHub Actions) yang menjalankan test/lint/build otomatis di repository ini — verifikasi masih dijalankan manual sebelum PR.

### Langkah Deployment yang Saat Ini Realistis

#### Backend / Database

1. siapkan project Supabase target,
2. terapkan migrasi SQL secara berurutan dari `supabase/migrations/`,
3. pastikan seed data dan policy RLS berhasil dibuat.

#### Aplikasi Mobile

1. pastikan environment produksi telah disiapkan (`.env.production` dari `mobile/.env.production.example`),
2. pastikan kredensial Supabase produksi benar,
3. jalankan build/submit lewat EAS sesuai profil di `mobile/eas.json` (`eas build`, `eas submit`).

#### Aplikasi Web

1. jalankan `npm run web` (atau `npm run web:staging` / `web:prod`) untuk validasi lokal per environment,
2. deploy ke EAS Hosting; untuk staging, domain publik diarahkan lewat Cloudflare Worker di `workers/staging-proxy/`.

## Dokumentasi Tambahan

Dokumen berikut direferensikan langsung di README ini dan telah diverifikasi keberadaannya di repository:

- [`PRD.md`](./PRD.md)
- [`BUILD-PLAN.md`](./BUILD-PLAN.md)
- [`DESIGN.md`](./DESIGN.md) — sumber kebenaran token desain, binding untuk `mobile/src`
- [`prd/01-konsep-dan-fondasi.md`](./prd/01-konsep-dan-fondasi.md)
- [`prd/02-spesifikasi-card-dan-eksekusi.md`](./prd/02-spesifikasi-card-dan-eksekusi.md)
- [`prd/03-sistem-permission-data-governance.md`](./prd/03-sistem-permission-data-governance.md)
- [`mobile/README.md`](./mobile/README.md)
- [`supabase/migrations/`](./supabase/migrations/)
- [`wiki/overview.md`](./wiki/overview.md)

README ini sengaja menuliskan kondisi repository apa adanya agar pengembang lain dan pengguna akhir memahami mana yang sudah tersedia, mana yang masih bertahap, dan area mana yang masih memerlukan keputusan maintainer.
