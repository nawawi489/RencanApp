# RencanApp

**RencanApp** adalah repositori implementasi produk **Rencanapp**, sebuah **EMS (Execution Management System) V1.82** untuk membantu perusahaan mengubah arah strategis menjadi pekerjaan nyata yang bisa dipantau, direview, dan dipertanggungjawabkan.

EMS dirancang untuk menggantikan pola follow-up manual yang tersebar di chat dengan alur kerja yang memiliki konteks, delegasi yang jelas, bukti kerja, hasil terukur, dan audit trail yang rapi.

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
- **Versi produk acuan:** `V1.82`
- **Versi paket aplikasi mobile saat ini:** `1.0.0` (`mobile/package.json`)
- **Status pengembangan:** `Aktif` dengan implementasi kode saat ini berada di **Fase 0 - Fondasi & Shell**

### Tujuan Utama

EMS membantu organisasi memastikan pekerjaan tidak berjalan tanpa arah. Sistem ini menghubungkan tujuan bisnis dan pekerjaan harian melalui struktur card berikut:

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

Secara produk, EMS V1.82 mencakup:

- manajemen card berbasis hirarki untuk performance dan development workspace,
- Action Plan `one time` dan `repeat`,
- bukti kerja, nilai hasil, review, dan submission versioning,
- permission berbasis tanggung jawab melalui PIC, Reviewer, dan turunan card,
- surface utama: `Home`, `Notifications`, `Workspace`, `Inbox`, dan `People`,
- governance melalui `Activity Log` dan `Governance Violation`.

### Fitur yang Sudah Tersedia di Kode Saat Ini

Berdasarkan implementasi repo saat ini, fitur yang sudah tersedia adalah:

- autentikasi email/password menggunakan Supabase Auth,
- sesi persisten di aplikasi mobile menggunakan AsyncStorage,
- route guard antara area `(auth)` dan `(app)`,
- shell navigasi untuk lima surface utama,
- halaman `Settings` awal dengan data profil pengguna,
- migrasi database Supabase Fase 0 dengan RLS dan seed data awal `Nyantuy Group`.

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
- saat ini repo **belum menyediakan** file `.env.example`, sehingga file `.env` perlu dibuat manual.

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

Buat file `mobile/.env`, lalu isi dengan kredensial Supabase:

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

Urutan file migrasi:

```text
supabase/migrations/0001_fase0_foundation.sql
supabase/migrations/0002_fase0_harden_functions.sql
supabase/migrations/0003_fase0_revoke_rpc.sql
supabase/migrations/0004_harden_rls_auto_enable.sql
```

Repositori ini belum menyertakan konfigurasi Supabase lokal penuh seperti `supabase/config.toml`, sehingga cara paling aman saat ini adalah menerapkan migrasi ke project Supabase Anda melalui SQL Editor atau workflow internal tim.

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
4. telusuri surface `Home`, `Notifications`, `Workspace`, `Inbox`, `People`,
5. buka `Settings` untuk melihat profil singkat dan status role organisasi.

### Perintah Utama

| Perintah | Fungsi |
| --- | --- |
| `npm start` | Menjalankan Expo development server |
| `npm run android` | Menjalankan aplikasi untuk Android |
| `npm run ios` | Menjalankan aplikasi untuk iOS |
| `npm run web` | Menjalankan aplikasi di browser |
| `npx tsc --noEmit` | Menjalankan type-check TypeScript |
| `npm run lint` | Menjalankan lint melalui Expo CLI |

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
├── wiki/                   # Knowledge base proyek berbasis Markdown/Obsidian
├── BUILD-PLAN.md           # Rencana build terfase
├── PRD.md                  # PRD utama produk EMS V1.82
└── CLAUDE.md               # Aturan pemeliharaan wiki proyek
```

Struktur penting di dalam `mobile/`:

```text
mobile/
├── assets/                 # Ikon, gambar, dan aset visual
├── scripts/                # Utility script proyek
├── src/
│   ├── app/                # Routing aplikasi berbasis Expo Router
│   │   ├── (auth)/         # Flow autentikasi
│   │   └── (app)/          # Area aplikasi setelah login
│   ├── components/         # Komponen UI reusable
│   ├── constants/          # Konstanta aplikasi
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Integrasi environment, Supabase, dan database types
│   └── providers/          # Context/provider aplikasi
├── app.json                # Konfigurasi Expo
├── metro.config.js         # Konfigurasi Metro + NativeWind
└── package.json            # Dependensi dan skrip aplikasi
```

Penjelasan singkat folder lain:

- `supabase/migrations/` menyimpan migrasi SQL berurutan untuk foundation dan hardening,
- `prd/` berisi dokumen kebutuhan sistem yang menjadi acuan produk,
- `wiki/` berisi rangkuman konsep, entitas, dan log pengembangan untuk kebutuhan knowledge management.

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

Pengecekan yang tersedia dan relevan pada kondisi repo saat ini:

- `npx tsc --noEmit` berhasil dijalankan dan cocok digunakan sebagai verifikasi type-safety,
- `npm run lint` tersedia di `package.json`, tetapi pada kondisi repo sekarang masih memicu prompt inisialisasi ESLint dari Expo karena konfigurasi ESLint belum dibuat,
- belum ada konfigurasi test runner unit/integration yang eksplisit di repository root maupun `mobile/package.json`.

### Cara Menjalankan Verifikasi

Dari folder `mobile/`:

```bash
npx tsc --noEmit
```

Untuk lint:

```bash
npm run lint
```

Jika ini pertama kali dijalankan, Expo kemungkinan akan meminta Anda menginisialisasi konfigurasi ESLint terlebih dahulu.

### Status Deployment Saat Ini

Status deployment yang dapat disimpulkan dari repository:

- backend menggunakan Supabase sebagai managed service,
- migrasi database disimpan di `supabase/migrations/`,
- aplikasi web dikonfigurasi sebagai SPA melalui `mobile/app.json` dengan `web.output: "single"`,
- repository **belum** menyertakan konfigurasi deployment produksi lengkap seperti `eas.json`, pipeline CI/CD, atau manifest hosting web.

### Langkah Deployment yang Saat Ini Realistis

#### Backend / Database

1. siapkan project Supabase target,
2. terapkan migrasi SQL secara berurutan,
3. pastikan seed data dan policy RLS berhasil dibuat.

#### Aplikasi Mobile

1. pastikan environment produksi telah disiapkan,
2. pastikan kredensial Supabase produksi benar,
3. tambahkan workflow rilis seperti EAS Build sebelum deployment native production.

#### Aplikasi Web

1. jalankan `npm run web` untuk validasi lokal,
2. siapkan pipeline build dan hosting statis sesuai kebutuhan tim,
3. tambahkan konfigurasi deployment resmi sebelum mengklaim dukungan produksi.

## Dokumentasi Tambahan

Dokumen berikut direferensikan langsung di README ini dan telah diverifikasi keberadaannya di repository:

- [`PRD.md`](./PRD.md)
- [`BUILD-PLAN.md`](./BUILD-PLAN.md)
- [`prd/01-konsep-dan-fondasi.md`](./prd/01-konsep-dan-fondasi.md)
- [`prd/02-spesifikasi-card-dan-eksekusi.md`](./prd/02-spesifikasi-card-dan-eksekusi.md)
- [`prd/03-sistem-permission-data-governance.md`](./prd/03-sistem-permission-data-governance.md)
- [`mobile/README.md`](./mobile/README.md)
- [`supabase/migrations/`](./supabase/migrations/)
- [`wiki/overview.md`](./wiki/overview.md)

README ini sengaja menuliskan kondisi repository apa adanya agar pengembang lain dan pengguna akhir memahami mana yang sudah tersedia, mana yang masih bertahap, dan area mana yang masih memerlukan keputusan maintainer.
