---
type: entity
tags: [ui, navigation, surface]
updated: 2026-07-16
sources: 2
---

# Surfaces (Main Navigation)

Lima surface utama [[overview|Rencanapp]] di bottom nav (PRD V1.83 §7.1). Settings dan People **tidak** tampil sebagai bottom nav mandiri — keduanya masuk lewat **Menu**.

`Home · Notifications · Workspace · Inbox · Menu`

> [!warning] Kode `mobile/` — sisa gap V1.83 (per audit 2026-07-16)
> Bottom nav sudah 5-tab (Home/Notif/Workspace/Inbox/Menu). Home Fokus Hari Ini, People de-scoring, dan Menu gating sudah landing. Sisa gap: (a) People row belum tampilkan **Status ringan** (rank + tombol Lihat Profil sudah landing 2026-07-16); (b) §19 admin CRUD Strategy Template (create/edit/disable/versioning) masih read-only. Lihat [[ui-prototype-gap]].

## Home — Today Command Center

Menjawab "hari ini saya harus fokus apa?". V1.83 §27: menampilkan **Task atau Repeat Task yang perlu perhatian** (bukan Action Plan penuh). CTA cukup satu: Detail. Tidak menumpuk banyak CTA (Bukti/Chat/Detail) sekaligus.

Home tidak boleh menampilkan: Shortcut besar duplikat nav, Feed sosial, Announcement, Company news.

## Notifications

Pusat alert & tindakan: review request, approval/rejection, komentar, mention, deadline reminder, deadline change request, Task Terlewat, Repeat due, warning Aturan Pecah Target (bagi user yang sedang buat turunan).

Tabs: Semua, Perlu Tindakan, Review, Deadline, Komentar, Terlewat, Repeat, Governance.

**V1.83 gating:** Governance warning hanya untuk admin/user berwenang. Permission change notification hanya jika relevan bagi user tersebut.

## Workspace

Akses ke dua [[workspace|workspace]] (Performance & Development) dan navigasi hierarki card. Menampilkan struktur per **periode aktif** (Period Focus Engine, V1.83 §7.6): default bulan berjalan, bisa pindah Quarter; Goal tahunan tetap konteks. Card periode lewat dibuat redup dan dikunci untuk turunan baru (§7.7).

## Inbox

Pusat **Diskusi Rencana Aksi** (chat per Action Plan). Setiap Action Plan otomatis punya **chat room** setelah aktif. **Inbox bukan tempat approval resmi** — keputusan resmi tetap via Comment, Review, Status, [[audit-governance#Activity Log|Activity Log]]. Member chat ikut akses card Action Plan (lihat [[permission-model]]). RWT-04 A: membership chat stabil, room di-key `action_plan_id` (rename cosmetic dari lama "Initiative Chat").

## Menu (slot 5, V1.83 §7.1 / §31)

Pintu masuk ke profil, People, bantuan, settings, archive, dan admin tools **sesuai permission**. Bergaya Facebook mobile.

**Akses Cepat (default, semua user):**

- People
- Archive
- Pusat Bantuan

**Pengaturan (semua user, sebagian conditional):**

- Organisasi
- Repeat Setting
- Permission Settings *(hanya admin)*

**Template (conditional — hanya user berhak):**

- Goal Template
- Strategy Template *(kosong by default V1.83 §19)*

**Admin Lanjutan (conditional — hanya user berhak):**

- Minimum Breakdown Rule / Aturan Pecah Target
- Score Formula
- Governance
- Confidential
- Override Score
- Log Aktivitas

**Yang berubah dari V1.82:** V1.82 menempatkan Log Aktivitas, Score Formula, Minimum Breakdown Rule di Pengaturan (visible untuk lebih banyak user). V1.83 memindahkan semua fitur berat ke Admin Lanjutan yang di-gate per permission. Staff biasa tidak melihat Score Formula, Governance, Override Score, atau Log Aktivitas sebagai shortcut utama.

## People (di dalam Menu)

**De-scoring V1.83.** Melihat daftar People, urutan kontribusi, dan profil user secara objektif. People **bukan** tempat mempermalukan orang dan **bukan** dashboard score yang agresif.

- Filter ringan: Semua, Bulan ini, Tim Saya, Admin (bila berwenang).
- People row menampilkan: Rank, Avatar, Nama, Jabatan, **Ringkasan kontribusi singkat**, **Status ringan** (mis. "Stabil" / "Perlu dukungan"), tombol Lihat Profil.
- People row **tidak menampilkan**: Trust, Achievement, score formula, governance status, atau angka teknis yang membuat user merasa dinilai berlebihan.
- People Profile: Score detail hanya jika user punya permission admin/management. Header tidak memakai label Trust/Achievement sebagai elemen utama.

Skor mendetail tetap dihitung via [[score-formula]] tapi **tidak ditampilkan di surface staff** — hanya di Admin Lanjutan.

## Settings (via Menu)

Diakses dari Menu — **bukan** bottom nav mandiri. Konten Pengaturan/Admin Lanjutan sesuai daftar di atas. [[minimum-breakdown-rule|MBR / Aturan Pecah Target]], [[score-formula|Score Formula]], [[audit-governance|Activity Log & Governance Violation]] semua di Admin Lanjutan V1.83.

Berkaitan dengan: [[permission-model]], [[score-formula]], [[audit-governance]], [[workspace]].
