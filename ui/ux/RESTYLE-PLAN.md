# Plan Implementasi — Terapkan Desain Prototype ke Layar Fase 0–2

Menerapkan bahasa visual [`design.html`](../../design.html) ke layar yang **sudah ada** di `mobile/` (Fase 0–2). Pakai token [`DESIGN.md`](../../DESIGN.md) + komponen fondasi yang sudah dibuat (`EmptyState` v2, `Skeleton`, `ErrorState`, `ScoreBadge`, `Avatar`).

**Prinsip:** ini **restyle**, bukan fitur baru. Semua logika data, role-gating, dan alur tetap utuh — hanya presentasi yang berubah. Tidak menyentuh fitur Fase 3+ (notifikasi data, chat, tree strategis).

---

## Scope

**Direstyle (sudah ada):** Login · Tabs shell (header + bottom nav) · Home · Workspace · Action Plan detail · Action Plan baru · Submit Bukti · Initiative detail/baru · Settings · stub Notifications/Inbox (dipoles).

**Di luar scope (Fase 3+):** isi Notifications, Inbox chat, tree Goal→KPI→Strategy, People score (Fase 7). Stub-nya dipoles agar terlihat disengaja, bukan dibangun.

---

## Fase 0 — Prasyarat

1. **Dependensi** (untuk fidelity penuh): `npx expo install react-native-svg expo-linear-gradient`.
   - `react-native-svg` → logo mark + progress ring.
   - `expo-linear-gradient` → greeting hero + logo gradient.
   - *Alternatif ringan:* tanpa deps — logo PNG, hero warna solid, ring diganti progress bar. (Lihat keputusan #2.)
2. **Branding** — finalkan nama/logo (keputusan #1).
3. (Opsional) Muat font **Inter** via `expo-font` agar match 1:1; default tetap system.

---

## Fase A — Primitif desain bersama (buat dulu, dipakai semua)

| Komponen | Fungsi | Dipakai di |
|---|---|---|
| `BrandLogo` | Mark SVG gradient biru→hijau | Login, header |
| `AppHeader` | Topbar: logo + judul + kicker + search + avatar | Semua tab (via `Tabs` `header`) |
| `GreetingHero` | Kartu sapaan gradient ("Selamat pagi, …") | Home |
| `PriorityCard` | Kartu prioritas berwarna (deadline/review/gap) | Home |
| `ProgressBar` | Bar progres + persen | Home, Workspace, detail |
| `ProgressRing` | Ring capaian (SVG) | Action Plan detail, KPI (nanti) |
| `MetaGrid` | Grid 2×2 metadata (PIC/Reviewer/Deadline/Mode) | Action Plan detail |
| `Chip` (pressable) | Filter chip + afordance scroll | Notifications (nanti), detail |
| `StatPill` | Angka ringkas (snapshot tim) | Home |

Semua a11y mengikuti aturan DESIGN.md §4 (touch ≥44px, role/label, warna+teks).

---

## Fase B — Restyle per layar (urut prioritas)

### 1. Tabs shell — header + bottom nav (`(tabs)/_layout.tsx`)
- Ganti header default → `AppHeader` (logo + judul + kicker + tombol search + avatar).
- Bottom nav: badge unread (Notif/Inbox), indikator bar aktif, ikon konsisten. Tetap pakai `Tabs` Expo + `tabBarActiveTintColor` brand.
- **Dampak:** seluruh app langsung terasa ber-brand. Kerjakan #1 dulu.

### 2. Login (`(auth)/login.tsx`)
- `BrandLogo` + nama brand + tagline + subjudul.
- Latar gradient lembut (sesuai prototype), kartu form, toggle lihat-password (ikon mata), tombol pakai `Button` (sudah AA).
- Logika auth (`signIn/signUp`) tidak diubah.

### 3. Home (`(tabs)/index.tsx`) — paling terlihat
- `GreetingHero` (sapaan + tanggal) dari profil.
- Baris **3 `PriorityCard`** (Lewat deadline / Butuh Review / Gap KPI) — dari `reviewQ` + hitungan deadline; Gap KPI placeholder sampai Fase 4.
- "Fokus Hari Ini": `TaskRow` di-upgrade → kartu dengan `ProgressBar`, chip PIC/Reviewer, deadline. Data dari `mineQ`/`reviewQ` (tetap).
- Loading `ActivityIndicator` → `SkeletonList`; tambah `ErrorState` retry.

### 4. Action Plan detail (`action-plan/[id].tsx`) — flagship
- Header kartu: `ProgressRing` + judul + status chip.
- `MetaGrid` 2×2 (PIC/Reviewer/Deadline/Mode) ganti `Field` list.
- Aksi primer: `Kirim Bukti` (primary) + `Buka Chat` (secondary, disabled+badge "Fase 3").
- Seksi bawah jadi baris collapsible (`ui/collapsible.tsx`) dgn chip status: Brief, Repeat & instance, Bukti & review, Gate & kendala, Log Aktivitas.
- **Semua logika role/status/`RepeatSection` dipertahankan** — hanya bungkus presentasinya.

### 5. Workspace (`(tabs)/workspace.tsx`)
- Header periode ("Juni 2026 · berjalan").
- `InitiativeRow` → kartu lebih kaya: `ProgressBar`, target, status chip, PIC.
- Tetap daftar Initiative (tree strategis = Fase 4; beri 1 baris "menyusul").
- Loading → `SkeletonList`; tambah `ErrorState`.

### 6. Form: Action Plan baru + Submit (`action-plan/new.tsx`, `submit.tsx`)
- Kelompokkan field ke kartu bersection + header langkah; `LabeledInput` konsisten.
- Pesan guard (minimum breakdown) + validasi inline; sukses pakai toast/`GuidanceNote`.

### 7. Initiative detail + baru (`initiative/[id].tsx`, `new.tsx`)
- Selaraskan kartu/badge/tombol dengan pola di atas.

### 8. Settings (`settings.tsx`)
- Daftar menu bergaya prototype (baris + ikon + chevron); profil di atas.

### 9. Stub Notifications + Inbox (`notifications.tsx`, `inbox.tsx`)
- `PlaceholderCard` → `EmptyState` v2 (ikon + tone) supaya terlihat disengaja pra-Fase-3.

---

## Keputusan (sudah final)

1. **Branding** — ✅ **"Rencanaapp"** + tagline "Rencanakan. Jalankan. Tuntaskan." + logo centang biru→hijau (ikut prototype). Login "EMS" diganti.
2. **Fidelity** — ✅ **Penuh** — pasang `react-native-svg` + `expo-linear-gradient` (logo SVG, progress ring, greeting gradient).

---

## Progres

✅ **SELESAI — semua layar Fase 0–2:**
- Fase 0: deps (`react-native-svg`, `expo-linear-gradient`).
- Fase A primitif: `BrandLogo`, `AppHeader`, `GreetingHero`, `ProgressRing`, `ProgressBar`, `MetaGrid`, `PriorityCard`, `StatPill`.
- Fase B: B1 shell · B2 Login · B3 Home · B4 Action Plan detail · B5 Workspace · B6 Action Plan baru + Submit · B7 Initiative detail/baru · B8 Settings · B9 stub Notif/Inbox. People (sebelumnya).
- A11y dipropagasi: chip aktif `bg-brand` → `bg-brand-dark` (lulus AA) di semua selector form.

**Verifikasi:** `tsc --noEmit` bersih · **jest 58/58 hijau** (9 suite; +test render Home & People) · Login terverifikasi visual di Expo web.

⏳ **Sisa (opsional):** muat font Inter; bottom-nav badge unread + custom (saat data Fase 3 ada); screenshot layar non-login (perlu sesi login).

## Urutan kerja & verifikasi

**Urutan:** Fase 0 → A (primitif) → B1 (shell) → B2 (login) → B3 (home) → B4 (detail) → B5 (workspace) → B6–9.

**Verifikasi tiap langkah:** `tsc --noEmit` bersih · `jest` tetap hijau (logika tak berubah) · render test untuk struktur baru (pola `people.test`) · screenshot Expo web untuk layar non-auth bila perlu.

**Risiko rendah:** tidak menyentuh data layer/mutation. Tiap PR = 1–2 layar agar mudah direview.
