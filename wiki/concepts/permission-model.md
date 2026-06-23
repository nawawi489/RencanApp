---
type: concept
tags: [permission, rls, delegation, governance, decision]
updated: 2026-06-22
sources: 1
---

# Permission Model

Model hak akses [[overview|EMS]]: **berbasis tanggung jawab, bukan granular**. User tidak melihat semua card — hanya yang relevan dengannya. Ditegakkan di level database via [[tech-stack|Postgres RLS]] (tidak bisa di-bypass client).

## Akses default (system rule — tanpa permission khusus)

1. **PIC card** → lihat card itu.
2. **Reviewer** → lihat card yang direview.
3. **PIC card induk** → lihat **seluruh** turunannya (Goal→KPI→Strategy→Initiative→[[action-plan|Action Plan]]→Instance).

**Lihat ≠ Edit:** PIC induk boleh lihat semua turunan, tapi edit/approve tetap ikut wewenang. PIC induk **tidak boleh** mengubah bukti yang sudah dikirim staff di luar flow sah — [[audit-governance|audit trail]] tidak boleh rusak.

## Delegasi bertingkat

Pemilik card induk membuat turunan & menentukan PIC + Reviewer-nya:
- PIC KPI Area → buat Strategy + set PIC/Reviewer Strategy.
- PIC Strategy → buat Initiative + set PIC/Reviewer Initiative.
- PIC Initiative → buat Action Plan + set PIC/Reviewer Action Plan.

**Default PIC turunan:** ikut PIC induk jika tidak diubah. **Pengecualian:** Action Plan wajib punya PIC eksekutor eksplisit. **PIC tidak boleh approve pekerjaannya sendiri.**

## Permission yang bisa dicustom (User Settings)

Bukan system rule: boleh membuat tiap jenis card; lihat seluruh Workspace; kelola card orang lain; ubah Settings; kelola User & Permission; kelola template/MBR/Card Completion Rule; lihat Activity Log & Governance Violation; kelola Score Formula.

## Default role permission

| Role | Default |
|---|---|
| **CEO / Super Admin** | Semua. |
| **C-Level** | Sesuai area authority; buat card jika jadi PIC induknya; lihat turunan miliknya. |
| **Management / Manager / Head** | Buat Strategy/Initiative/Action Plan jika PIC induk; tentukan PIC/Reviewer turunannya. |
| **Staff** | Lihat & kerjakan card yang dia PIC/Reviewer; submit Bukti & Nilai Hasil; comment. **Tidak** boleh buat card, lihat seluruh Workspace, kelola card orang lain, ubah Settings. |

## Konsekuensi teknis

- **Search wajib ikut permission** — user tidak boleh menemukan data yang tak boleh diaksesnya.
- **Watcher dihapus** (§60) — akses luas hanya via permission "lihat seluruh Workspace".

Berkaitan dengan: [[tech-stack]], [[card-model]], [[audit-governance]], [[surfaces]], [[database-blueprint]].
