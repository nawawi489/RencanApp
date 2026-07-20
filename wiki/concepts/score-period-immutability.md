---
type: concept
tags: [governance, score, ranking, immutability, adr, fase-7, ws-5, fase-4-finalisasi]
updated: 2026-07-19
sources: 4
---

# ADR — Score Period Immutability

Sikap resmi Rencanapp terhadap koreksi pasca-finalisasi periode skoring. Ditulis
sebagai bagian dari deliverable Fase 4 (spec `[[score-ranking-finalization-bridge]]`,
backlog **B-3 MERGE-BLOCKER**).

## Keputusan

Setelah `close_period_snapshot` sukses, periode skoring **beku secara struktural**:

- `period_snapshots.status='closed'` dan `closed_at` non-null (append-only trigger).
- `ranking_snapshots` untuk periode tersebut **tidak dapat di-INSERT ulang, UPDATE,
  atau DELETE** — ditegakkan trigger `ranking_snapshots_no_delete`
  (`supabase/migrations/0013_fase7_people_score.sql` K5).
- `calculate_period_scores`, `close_period_snapshot`, dan `override_user_score`
  server-side menolak semua invocation dengan pesan
  `'Periode ini sudah ditutup dan tidak bisa diubah.'` (E1).
- **Tidak ada** RPC `reopen_period_snapshot` di API RencanApp. Tidak ada tombol UI.
  Tidak ada workaround admin di dalam aplikasi.

## Alasan

**Governance**: skor yang telah dipublikasikan kepada pengguna adalah fakta historis
yang tercatat di audit trail (`activity_logs` entry `period_closed` + ranking rows
dengan `rank_number`). Koreksi retroaktif tanpa audit trail terpisah merusak
kepercayaan pengguna dan menyulitkan investigasi sengketa. Tekad organisasi:
salah tulis lebih baik jelas dari salah tulis yang bisa disunyapkan.

**Invariant teknis**: [[audit-governance]] menetapkan tabel Fase 7 append-only.
Trigger `_no_delete` di 3 tabel (`user_score_results`, `ranking_snapshots`,
`period_snapshots`) menegakkan larangan DELETE di lapis DB — bahkan superuser via
psql tidak bisa membatalkannya tanpa migrasi eksplisit.

**Owner decision** (2026-07-19, spec `[[score-ranking-finalization-bridge]]` §2.2
NG-9 + Keputusan Putaran 2 #6): koreksi dilakukan **di periode berikutnya**, bukan
lewat reopen. Modal `FinalizePeriodModal` menyatakan hal ini eksplisit di step 1
(`"Setelah dikunci, periode ini tidak dapat dibuka kembali dari aplikasi dan
Manual Override tidak bisa lagi diubah."`) dan menampilkan soft escape hatch di state
`done` (`"Butuh mengoreksi? Buat periode berikutnya di menu ini setelah UI
buka-periode tersedia."`).

## Konsekuensi

### Jalur normal (semua tetap tersedia)

- **Manual Override sebelum close**: Modal step 1 menampilkan pratinjau angka
  `activeOverrides` supaya user tidak menekan "Finalisasi" sambil lupa override
  yang tertunda. Setelah close, `override_user_score` server E1.
- **Friksi dua tindakan sadar** (amandemen 2026-07-20): step 1 mensyaratkan centang
  `AckCheckbox` "Saya paham periode ini tidak dapat dibuka kembali." sebelum tombol
  destruktif lepas dari `disabled`. Sebelumnya pernyataan itu menjadi label tombol,
  tetapi kalimat panjang di dalam tombol cenderung dibaca sebagai "tombol biru" —
  bukan sebagai pernyataan. Memisahkannya membuat penerimaan risiko menjadi tindakan
  tersendiri, bukan efek samping menekan tombol. Token: DESIGN §7 `AckCheckbox`.
- **Koreksi via periode berikutnya**: skor bulan/kuartal berikutnya menggunakan
  formula (mungkin di-adjust) yang berlaku prospektif. Riwayat lama tetap terlihat
  di halaman History user (`useUserScoreHistory`).

### Edge cases yang secara sadar TIDAK diakomodasi

- **Bug hitung yang baru ketahuan pasca-close**: tidak ada undo. Tim eksekusi
  komunikasikan koreksi manual kepada pengguna terdampak; perbaiki formula di
  versi baru; jalankan di periode berikutnya.
- **Data user yang berubah struktural** (mis. `role_template_id` di-reassign
  setelah close): tidak mempengaruhi `ranking_snapshots` yang sudah beku. Ranking
  historis mencerminkan struktur ORG pada saat close.
- **Right-to-erasure UU PDP Indonesia**: cascade DELETE user diblok oleh trigger
  append-only. Ini disadari dan defer ke backlog **B-5** (retention / PDP
  anonymization). Solusi masa depan mungkin kolom `redacted_at` + fungsi helper
  yang mempreservasi struktur audit sambil menghapus identifier.

### Jalur eskalasi (kalau kebutuhan reopen sering muncul)

Bila selama 4-minggu berjalan ada ≥ 3 permintaan reopen sungguhan (bukan
misclick), buka spec follow-up `score-ranking-emergency-recount` dengan gate:

- Permission baru `manage_score_ranking_reset` (bukan reuse `manage_score_formula`).
- 4-eyes: minimal 2 CEO/Owner mengonfirmasi sebelum RPC menyala.
- Audit permanen ke `activity_logs` dengan `event_kind='period_reopened'` +
  detail alasan wajib.
- Batasan operasi: reopen HANYA menghapus `period_snapshots.closed_at` dan
  `ranking_snapshots` untuk periode tsb; auto-followed calc + close ulang.
- Copy modal ekstra keras: "Riwayat ranking [periode] AKAN HILANG dari sistem."

Sampai spec itu ada dan disetujui owner, jawaban adalah **"tidak ada reopen"**.

## Referensi

- [[score-ranking-finalization-bridge]] §2.2 NG-9, AC-FIN-20
- Precedent Fase 7: `specs/fase-7-people-score.md` §0 D9 + AC-7.7/7.19/7.20
- Implementasi trigger: `supabase/migrations/0013_fase7_people_score.sql` K1-K5 header
- Advisory lock (Fase 0 spec ini): `supabase/migrations/0079_score_finalize_advisory_lock.sql`
- Modal: `mobile/src/components/finalize-period-modal.tsx`
- Memory: `score-ranking-finalization-owner-decisions`
- Terkait: [[audit-governance]] (append-only philosophy), [[permission-model]]
  (`manage_score_formula` gate)
