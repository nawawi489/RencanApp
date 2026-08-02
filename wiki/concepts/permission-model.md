---
type: concept
tags: [permission, rls, delegation, governance, decision]
updated: 2026-08-02
sources: 1
---

# Permission Model

Model hak akses [[overview|EMS]]: **berbasis tanggung jawab, bukan granular**. User tidak melihat semua card — hanya yang relevan dengannya. Ditegakkan di level database via [[tech-stack|Postgres RLS]] (tidak bisa di-bypass client).

## Akses default (system rule — tanpa permission khusus)

1. **PIC card** → lihat card itu.
2. **Reviewer** → lihat card yang direview.
3. **PIC card induk** → lihat **seluruh** turunannya (Goal→KPI→Strategy→Initiative→[[action-plan|Task]]→Instance).

**Lihat ≠ Edit:** PIC induk boleh lihat semua turunan, tapi edit/approve tetap ikut wewenang. PIC induk **tidak boleh** mengubah bukti yang sudah dikirim staff di luar flow sah — [[audit-governance|audit trail]] tidak boleh rusak.

## Delegasi bertingkat

Pemilik card induk membuat turunan & menentukan PIC + Reviewer-nya:
- PIC Strategy → buat Strategy + set PIC/Reviewer Strategy.
- PIC Strategy → buat Initiative + set PIC/Reviewer Initiative.
- PIC Initiative → buat Task + set PIC/Reviewer Task.

**Default PIC turunan:** ikut PIC induk jika tidak diubah. **Pengecualian:** Task wajib punya PIC eksekutor eksplisit. **PIC tidak boleh approve pekerjaannya sendiri.**

## Permission yang bisa dicustom (User Settings)

Bukan system rule: boleh membuat tiap jenis card; lihat seluruh Workspace; kelola card orang lain; ubah Settings; kelola User & Permission; kelola template/MBR/Card Completion Rule; lihat Activity Log & Governance Violation; kelola Score Formula.

> [!note] Activity Log & Governance Violation **bukan** admin-only murni (koreksi 2026-07-23)
> Kedua policy ber-**OR** dengan cabang self-row (`0005:557-565`):
> `organization_id = current_user_org() AND (has_permission(…) OR actor_id = auth.uid())`.
> Artinya user tanpa permission tetap berhak melihat **barisnya sendiri**.
>
> Ini ditemukan saat menyusun spec BL-10, yang draft awalnya memperlakukan keduanya sebagai
> data admin dan nyaris menyembunyikan scope-nya sama sekali dari non-admin. Konsekuensi
> untuk Search (PR-4): scope tetap ada untuk semua orang, yang berbeda hanya **label grup**
> — "Log Aktivitas" bagi pemegang permission, "Aktivitas Saya" bagi yang bukan. Perbedaan
> label itu fungsi permission **pemanggil sendiri**, yang sudah ia ketahui, jadi ia bukan
> oracle atas data pihak lain.

## Default role permission

| Role | Default |
|---|---|
| **CEO / Super Admin** | Semua. |
| **C-Level** | Sesuai area authority; buat card jika jadi PIC induknya; lihat turunan miliknya. |
| **Management / Manager / Head** | Buat Strategy/Initiative/Task jika PIC induk; tentukan PIC/Reviewer turunannya. |
| **Staff** | Lihat & kerjakan card yang dia PIC/Reviewer; submit Bukti & Nilai Hasil; comment. **Tidak** boleh buat card, lihat seluruh Workspace, kelola card orang lain, ubah Settings. |

> [!warning] Key `create_kpi_area` sengaja BUKAN default management/c_level (K4, migration 0010)
> Membuat KPI Area (tabel DB `strategies`) butuh permission `create_kpi_area` **ATAU** jadi
> PIC Goal induk (`is_goal_pic`) — beda dari `create_strategy`/`create_initiative`/`create_action_plan`
> yang **memang** default melekat pada `management`/`c_level`. Keputusan ini mengikat sejak Fase 4:
> *"create_goal/create_kpi_area = CEO/grant (TIDAK di default c_level/management); create_strategy
> tetap default."*
>
> UI `workspace-screen.tsx` (GoalRow, tombol "+ Strategi" level Goal) sempat memakai proxy
> `can('create_strategy')` untuk menggerbang tombol ini — key yang salah, ditemukan & diperbaiki
> 2026-08-02. Efeknya dua arah: (a) manager yang **jadi PIC Goal** — yang server izinkan via
> `is_goal_pic` — tidak melihat tombol; (b) drift risiko bila `MGR_DEFAULT_KEYS` klien berubah.
> Fix: `can('create_kpi_area') || goal.pic_id === profile.id`, mirror policy DB persis. Lihat
> `mobile/src/lib/permission-defaults.ts` (`MGR_DEFAULT_KEYS`) untuk daftar key yang **benar**
> default management/c_level.
>
> **Pelajaran:** kalau UI menggerbang aksi via `can(key)`, `key`-nya harus dicocokkan ke policy
> RLS/RPC yang sebenarnya menegakkan aksi itu — bukan diasumsikan dari nama yang "mirip" atau
> dari key lain di level sama dalam hierarki card.

## Konsekuensi teknis

- **Search wajib ikut permission** — user tidak boleh menemukan data yang tak boleh diaksesnya.
- **Watcher dihapus** (§60) — akses luas hanya via permission "lihat seluruh Workspace".

Berkaitan dengan: [[tech-stack]], [[card-model]], [[audit-governance]], [[surfaces]], [[database-blueprint]].
