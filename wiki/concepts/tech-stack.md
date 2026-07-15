---
type: concept
tags: [architecture, mobile, supabase, expo, decision]
updated: 2026-06-22
sources: 3
---

# Tech Stack

Rekomendasi tumpukan teknologi untuk membangun [[overview|Rencanapp]] (EMS V1.8.1) sebagai aplikasi **mobile** (iOS + Android). Pilihan diturunkan langsung dari karakter teknis PRD, bukan preferensi generik.

## Karakter teknis yang menentukan pilihan

- **Mobile-first** dengan bottom nav 5 surface (Home, Notifications, Workspace, Inbox, People); UI Bahasa Indonesia.
- **Permission berbasis baris data** — user hanya melihat card relevan (PIC / Reviewer / turunan), dan Search wajib ikut permission. Menuntut otorisasi di level database, bukan sekadar cek di client.
- **Audit append-only** (Activity Log, Governance Violation) yang tidak boleh diedit/dihapus.
- **Real-time** — chat per Initiative (Inbox), notifications, status review.
- **File/bukti** — upload foto, PDF, screenshot dengan *evidence locking* (tidak boleh diubah, hanya versi baru).
- **Job terjadwal** — generate Action Plan Instance dari Repeat, tandai status Terlewat saat lewat deadline.
- **Blueprint DB 53 tabel** diawali `auth.users` — konvensi schema khas Supabase.

## Rekomendasi

| Lapisan | Pilihan | Alasan singkat |
|---|---|---|
| Mobile framework | **Expo (React Native) + Expo Router** | Satu codebase iOS+Android, file-based routing untuk 5 surface + detail card, OTA update, ekosistem matang untuk kamera/file/notif. |
| Bahasa | **TypeScript** | 53 tabel + relasi card/permission kompleks menuntut type-safety. |
| Backend / DB | **Supabase (Postgres)** | Blueprint sudah memakai `auth.users` + Postgres. Auth, DB relasional, Storage, Realtime, Edge Functions dalam satu paket. |
| Otorisasi | **Postgres Row Level Security (RLS)** | Inti PRD: "user tidak melihat semua card" & "search ikut permission" ditegakkan di DB, tidak bisa di-bypass client. |
| Auth | **Supabase Auth** | Terhubung langsung ke `auth.users` & `profiles`, mendukung role/permission template. |
| State & data fetching | **TanStack Query (React Query)** | Cache, retry, offline-friendly, sinkron dengan Supabase Realtime. |
| Realtime chat & notif | **Supabase Realtime** | Chat room per Initiative & notifikasi live tanpa server socket terpisah. |
| Penyimpanan bukti | **Supabase Storage** | File/foto/PDF; *evidence locking* via RLS + versioning di `action_plan_submissions`. |
| Job terjadwal | **Supabase Edge Functions + `pg_cron`** | Generate instance Repeat & tandai Terlewat otomatis sesuai jam deadline. |
| Push notification | **Expo Notifications** | Deadline reminder, review request, repeat due. |
| Styling / UI | **NativeWind (Tailwind)** | UI card konsisten dan cepat dibangun. |
| Build & rilis | **EAS (Expo Application Services)** | Build cloud iOS/Android + CI/CD workflow. |

## Mengapa kombinasi ini

1. **RLS adalah jawaban paling tepat untuk model permission PRD.** Seluruh aturan hak akses (lihat [[permission-model]]) berbicara tentang "siapa boleh lihat baris mana". Menegakkannya di Postgres RLS lebih aman dan ringkas daripada menulis ulang logika izin di tiap query.
2. **Audit append-only mudah dijamin di Postgres** lewat trigger + pencabutan hak UPDATE/DELETE, sesuai kebutuhan Activity Log & Governance Violation.
3. **Satu vendor (Supabase) menutup enam kebutuhan sekaligus** — Auth, DB relasional, Storage, Realtime, cron, Edge Functions — penting untuk V1 yang ingin cepat tanpa scope creep.
4. **Expo mempercepat pengiriman dua platform** tanpa tim native terpisah, sesuai sifat aplikasi internal perusahaan.

## Catatan & verifikasi

> [!warning] Klarifikasi scope
> PRD §108 melarang "Native app" sebagai scope creep. [?] Tafsiran: larangan ini kemungkinan menyangkut fitur tambahan, bukan larangan memakai React Native sebagai fondasi mobile. Perlu dikonfirmasi pemilik produk sebelum dianggap final.

Berkaitan dengan: [[overview]], [[permission-model]], [[card-model]].
