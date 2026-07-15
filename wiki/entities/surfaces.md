---
type: entity
tags: [ui, navigation, surface]
updated: 2026-06-27
sources: 2
---

# Surfaces (Main Navigation)

Lima surface utama [[overview|EMS]] di bottom nav (PRD V1.8.2 §7.1). Settings dan People **tidak** tampil sebagai bottom nav mandiri — keduanya masuk lewat **Menu**.

`Home · Notifications · Workspace · Inbox · Menu`

> [!warning] Berubah di V1.8.2 — kode shipped masih lag
> V1.8.1 memakai slot 5 = **People**. **V1.8.2 §7.1: slot 5 = Menu**, People pindah ke dalam Menu. Kode `mobile/src/app/(app)/(tabs)/_layout.tsx` masih memakai People (perlu fix **P0**). Lihat [[ui-prototype-gap#3 Gap navigasi struktural|UI-N-001]] (resolved).

## Home — Today Command Center

Menjawab "hari ini saya harus fokus apa?". Menampilkan Action Plan hari ini, Repeat jatuh tempo, card butuh review, card Terlewat, deadline mendekat, revisi, ringkasan progress & tanggung jawab pribadi, peringatan Kelengkapan Card.
**Tidak menampilkan** Feed, Announcement, Company News, social activity.

## Notifications

Pusat alert & tindakan: review request, approval/rejection, komentar, mention, deadline reminder, deadline change request, Action Plan Terlewat, Repeat due, governance warning, MBR warning.
Tabs: Semua, Perlu Tindakan, Review, Deadline, Komentar, Terlewat, Repeat, Governance.

## Workspace

Akses ke dua [[workspace|workspace]] (Performance & Development) dan navigasi hierarki card. Menampilkan struktur per **periode aktif** (Period Focus Engine, V1.8.2 §7.6): default bulan berjalan, bisa pindah Quarter; Goal tahunan tetap konteks. Card periode lewat dibuat redup dan dikunci untuk turunan baru (§7.7).

## Inbox

Pusat chat per Initiative. Setiap Initiative otomatis punya **chat room**. **Inbox bukan tempat approval resmi** — keputusan resmi tetap via Comment, Review, Status, [[audit-governance#Activity Log|Activity Log]]. Member chat ikut akses card Initiative (lihat [[permission-model]]).

## Menu (slot 5, V1.8.2 §7.1 / §31)

Pintu masuk sekunder bergaya Facebook mobile: profil, **People**, tools admin, Goal & KPI Area Template Library, **Settings**, **Archive**, dan logout. Menggantikan slot bottom nav ke-5 (sebelumnya People). Alasan: People bukan aktivitas harian utama semua user; Menu memberi akses cepat ke admin/settings tanpa membuang slot.

## People (di dalam Menu)

Performa user secara objektif: Achievement Score, Action Plan Completion, Repeat Compliance, On-Time Rate, Review Pass Rate, Result Achievement, Development Contribution, Governance Discipline, Ranking, Trend. Skor dihitung via [[score-formula]].
**Bukan tempat mempermalukan** — dilarang label "karyawan terburuk/staff malas". Hanya data objektif.

## Settings (via Menu / avatar)

Diakses dari Menu (atau avatar/profile) — **bukan** bottom nav mandiri. Mengelola: User & Permission, Role Template, Organization/Department/Position/Team, Goal & KPI Area Template Library, [[minimum-breakdown-rule|Minimum Breakdown Rule]], Card Completion Rule, Keterangan Card, Status, Prioritas, Notifications Rule, [[score-formula|Score Formula]], [[audit-governance|Activity Log & Governance Violation]], Archive, Confidential Access.

Berkaitan dengan: [[permission-model]], [[score-formula]], [[audit-governance]], [[workspace]].
