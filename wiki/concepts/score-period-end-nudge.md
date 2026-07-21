---
type: concept
tags: [score, ranking, notifikasi, reminder, pg-cron, backlog-b1]
updated: 2026-07-20
sources: 3
---

# Score Period End Nudge (B-1)

Pengingat menjelang berakhirnya periode skoring, agar admin tidak lupa menekan
"Finalisasi Periode & Peringkat". Menutup backlog **B-1** dari
[[score-ranking-finalization-bridge]] §11.2 (sebelumnya NG-8).

## Masalah

Jembatan finalisasi ([[score-ranking-finalization-bridge]]) memulihkan kemampuan
menerbitkan peringkat, dan [[score-open-period-ui]] memulihkan kemampuan membuka
periode. Keduanya **dipicu manual**. Tidak ada satu pun mekanisme yang memberi tahu
admin bahwa periode akan/sudah berakhir.

Konsekuensinya, gejala bug lama bisa muncul kembali tanpa ada bug: periode berlalu,
tidak ada yang menekan tombol, `ranking_snapshots` tidak pernah terisi, dan People
screen tetap menampilkan "Peringkat tampil setelah periode ditutup." Dari sisi
pengguna, itu tidak bisa dibedakan dari kerusakan.

## Keputusan owner (2026-07-20)

| # | Isu | Keputusan |
|---|---|---|
| 1 | Tipe notifikasi | **Tipe baru `period_closing_reminder`** — bukan reuse `deadline_reminder`, karena `inlineAction()` men-hardcode href `/task/...` sehingga CTA akan membuang admin ke layar yang salah |
| 2 | Kadens | **H-7, H-3, H-1** — tiga sinyal berjarak; cukup awal untuk menyiapkan Manual Override, cukup dekat untuk mendesak |
| 3 | Setelah `period_end` lewat | **Terus ingatkan harian** sampai periode difinalisasi; copy dibedakan ("terlambat", bukan "akan berakhir") |
| 4 | Kanal | **In-app + push** |

Alasan #3 paling penting: kondisi "periode sudah lewat tapi belum ditutup" adalah
persis skenario yang melahirkan bug asli. Berhenti mengingatkan di `period_end`
akan meninggalkan lubang tepat di titik paling berbahaya.

## Desain

Meniru preseden `emit_deadline_notifications` (`0008:973`) hampir persis — pola itu
sudah terbukti jalan bertahun-tahun di repo ini.

**Fungsi** `emit_period_closing_reminders()` — SECURITY DEFINER, `search_path=''`:

1. Loop `period_snapshots` dengan `status='active'`.
2. Hitung `selisih = period_end - org_today(organization_id)`. Tanggal **selalu**
   dihitung server per timezone org (CF-3 melarang client mengirim tanggal).
3. Kirim bila `selisih ∈ {7, 3, 1}` (menjelang) **atau** `selisih < 0` (terlambat,
   setiap hari).
4. Penerima: setiap profil aktif di org itu yang punya `manage_score_formula` —
   lewat `has_permission`-style join (`user_permissions × permissions`) **atau**
   `role_templates.level='ceo'`, mengikuti semantik `has_permission` (`0016:41-53`).
5. `dedupe_date = org_today(org)` → partial unique index `uq_notifications_dedupe`
   (`0008:145`) menjamin **satu notifikasi per penerima per periode per hari**,
   berapa kali pun cron berjalan.

**Copy** (Indonesia, dibedakan per situasi):

| Situasi | Judul | Body |
|---|---|---|
| H-7 / H-3 / H-1 | `Periode skoring akan berakhir` | `{nama} berakhir {n} hari lagi. Finalisasi untuk menerbitkan peringkat.` |
| Terlambat | `Periode skoring belum difinalisasi` | `{nama} sudah berakhir {n} hari lalu. Peringkat belum terbit sampai periode difinalisasi.` |

**Jadwal**: pg_cron `emit-period-closing-reminders` pada `0 7 * * *` UTC (14:00 WIB).
Slot 06:00/20:00/03:00/00:05 UTC sudah terpakai job lain.

**Push**: tipe ditambahkan ke fallback `is_push_worthy` (`0063:225`) agar ikut
ter-fanout. Org tetap bisa menyesuaikan lewat settings key `notification_rule_push_types`.

## Yang sengaja TIDAK dilakukan

- **Tidak menyentuh periode `status='draft'`.** Hanya `active` yang punya jaminan
  satu-per-org; draft adalah periode yang belum dijalankan, bukan yang terlupakan.
- **Tidak ada auto-finalisasi.** Menutup periode tetap tindakan sadar manusia —
  konsisten dengan [[score-period-immutability]]; ia ireversibel, jadi tidak boleh
  dipicu timer.
- **Tidak ada eskalasi ke atasan.** Kalau kebutuhan itu muncul, tangani sebagai spec
  tersendiri dengan aturan hierarki yang eksplisit.
- **Tidak ada kanal email/WA.** Di luar infrastruktur yang ada.

## Referensi

- [[score-ranking-finalization-bridge]] §11.2 B-1 (asal backlog), NG-8
- [[score-open-period-ui]] (pasangan: jalan masuk periode)
- [[score-period-immutability]] (kenapa finalisasi tetap manual)
- Preseden: `supabase/migrations/0008_fase3_collab.sql:973` `emit_deadline_notifications`
- Dedup: `0008:145` `uq_notifications_dedupe`; timezone: `0008:20` `org_today`
- Push whitelist: `0063:225` `is_push_worthy`
