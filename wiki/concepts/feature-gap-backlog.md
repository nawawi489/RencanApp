---
type: concept
tags: [backlog, feature-gap, governance, ui]
updated: 2026-07-20
sources: 0
---

# Feature Gap Backlog

Ledger ber-ID (`BL-NN`) untuk gap fitur di bawah ambang P-slot: temuan audit **app vs PRD** yang terlalu kecil untuk jadi P-slot sendiri, tapi terlalu nyata untuk dibiarkan tak tercatat.

Berbeda dari [[ui-prototype-gap]] (gap `mobile/` vs `design.html` — app vs *prototype*) dan [[workspace-lock-audit]] (temuan `WSA-NN` khusus Workspace).

## Konvensi

- ID `BL-NN` naik monoton; ID tidak pernah dipakai ulang meski row dihapus.
- Status: `OPEN` · `IN PROGRESS` · `DONE` · `WONTFIX`.
- Row `DONE` tetap tinggal di tabel dengan catatan penutup — ledger ini historis, bukan papan kerja.
- Ukuran: `XS` (layak langsung jadi chip task) · `S` · butuh scoping.

> [!warning] Halaman ini direkonstruksi, bukan asli
> Entry log `[2026-07-20] update | Backlog fitur di bawah ambang P-slot dicatat` mencatat `Pages created: concepts/feature-gap-backlog.md`, tapi file-nya **tidak pernah masuk ke branch mana pun** (`main` maupun `staging`) — hanya `index.md` yang menautkannya, sehingga wikilink menggantung sejak saat itu.
>
> Tabel di bawah direkonstruksi dari entry log tersebut, satu-satunya sumber yang tersisa. Entry itu menyebut **9 dari 12** ID secara eksplisit; **BL-04, BL-05, BL-06 tidak dapat dipulihkan** dan sengaja dibiarkan kosong daripada dikarang. Deskripsi row hasil rekonstruksi seringkas sumbernya.

## Backlog

| ID | Gap | Ukuran | Status | Catatan |
|---|---|---|---|---|
| BL-01 | Ranking tie — perilaku saat skor seri belum ditentukan `[?]` | XS | OPEN | Kandidat chip task. |
| BL-02 | `strategy/new` mengekspos `DateRangeField`; seharusnya mewarisi periode Goal (AC-11 FAIL) `[?]` | S | OPEN | **Paling dekat ambang P-slot.** |
| BL-03 | Periode lampau tidak di-dim `[?]` | XS | OPEN | Kandidat chip task. |
| BL-04 | *Tidak terpulihkan — tidak disebut di entry log sumber* | S `[?]` | UNKNOWN | Perlu audit ulang app vs PRD. |
| BL-05 | *Tidak terpulihkan — tidak disebut di entry log sumber* | S `[?]` | UNKNOWN | Perlu audit ulang app vs PRD. |
| BL-06 | *Tidak terpulihkan — tidak disebut di entry log sumber* | S `[?]` | UNKNOWN | Perlu audit ulang app vs PRD. |
| BL-07 | Notifikasi PRD §28 belum lengkap `[?]` | butuh scoping | OPEN | |
| BL-08 | Aksi "Catatan" belum ada `[?]` | XS | OPEN | Kandidat chip task. |
| BL-09 | Archive — **bukan satu bug**: tiga penyebab berbeda dalam satu row `[?]` | butuh scoping | OPEN | Salah satunya bug diam: invalidate query key salah → restore berhasil tapi list tidak menyegar. Wajib dipecah sebelum dikerjakan. |
| BL-10 | Search PRD §38 belum lengkap `[?]` | butuh scoping | OPEN | |
| BL-11 | Ikon notifikasi di header `[?]` | XS | OPEN | Kandidat chip task. |
| BL-12 | `violation_type` dirender sebagai `snake_case` mentah (mis. `self_approval_attempt`) tanpa peta label manusiawi | XS | DONE (2026-07-20) | Peta label Indonesia + fallback aman. Detail di bawah. |
| BL-13 | `violation_type` tidak punya sumber kebenaran; peta label client duplikasi manual dari literal PL/pgSQL, tanpa gate sinkronisasi | butuh scoping | OPEN | Utang tersisa dari BL-12. Detail di bawah. |

Row `BL-01..BL-11` menyandang `[?]`: entry log sumber menyatakan item **belum diverifikasi ulang terhadap `mobile/src/`** saat pencatatan. Konfirmasi gap sebelum mengerjakan — sebagian mungkin sudah tertutup oleh pekerjaan setelah 2026-07-20.

BL-12 adalah satu-satunya row yang sudah diverifikasi terhadap kode.

## BL-12 — Label Indonesia untuk violation type

**Gap.** `mobile/src/app/(app)/settings-governance-violation.tsx` menampilkan `violation_type` apa adanya sebagai judul card. Severity dan resolution status sudah punya peta label (`GOVERNANCE_VIOLATION_SEVERITY_LABEL`, `STATUS_LABEL`), tapi violation type — satu-satunya field yang menjelaskan *apa* yang dilanggar — tampil sebagai identifier database.

**Kendala schema.** `governance_violations.violation_type` bertipe `text` **tanpa CHECK constraint** (`0005_fase1_card_engine.sql:174`). Hanya `severity` (0007) dan `resolution_status` (0022) yang dibatasi constraint. Jadi himpunan tipe yang valid tidak dapat dibaca dari schema; ia harus ditelusuri dari setiap penulis baris.

**Penulis baris yang ada.** Dua jalur:

1. **INSERT langsung** di body fungsi DB (0005, 0007, 0008, 0014, 0038, 0040, 0046, 0063, 0064) — `reviewer_override`, `instance_missed`, `deadline_change_self_approval`, `self_evaluation`, `settings_invalid_key`.
2. **RPC `log_governance_violation()`** (didefinisikan 0019, dipanggil 0019 + 0046) — `submit_non_pic`, `finalize_non_submitter`, `self_approval_attempt`, `kpi_area_mismatch`, `strategy_mismatch`, `orphan_cleanup_unauthorized`.

Total 11 tipe yang benar-benar bisa di-emit. `minimum_breakdown_not_met` disebut di `supabase/tests/fase5_minimum_breakdown_rules_contract.sql` tapi **tidak ada fungsi yang menulisnya** — migrasi 0011 hanya `RAISE` pada gate-block, konsisten dengan aturan "refusal hanya RAISE, tidak menulis governance_violations". Tipe ini tetap dipetakan sebagai pertahanan untuk baris lama.

**Implementasi.** `GOVERNANCE_VIOLATION_TYPE_LABEL` + `governanceViolationTypeLabel()` di `mobile/src/lib/activity-governance.ts`, bersebelahan dengan peta severity yang sudah ada.

Kolom `text` bebas berarti tipe baru dapat muncul dari migrasi mana pun tanpa perubahan client. Karena itu helper tidak pernah mengembalikan string kosong:

- Tipe dikenal → label Indonesia.
- Tipe tak dikenal → nilai mentah (halaman tetap informatif untuk tipe yang belum dipetakan).
- `null` / `undefined` / whitespace → `—`.

Coverage di `mobile/src/lib/__tests__/activity-governance.test.ts`: 11 tipe DB dicek punya label non-`snake_case`, plus kasus fallback, input kosong, dan trim.

**Utang yang tersisa.** Peta ini duplikasi manual dari literal yang tersebar di body PL/pgSQL, tanpa gate sinkronisasi → dilacak sebagai **BL-13**.

## BL-13 — Sumber kebenaran untuk violation type

**Gap.** Tidak ada satu tempat pun yang mendefinisikan himpunan `violation_type` yang sah. Nilai itu hidup sebagai string literal yang tersebar di body fungsi PL/pgSQL lintas 11 migrasi, dan `GOVERNANCE_VIOLATION_TYPE_LABEL` di client adalah salinan manual hasil penelusuran (lihat BL-12). Tidak ada CHECK constraint, tabel lookup, maupun test yang menegakkan agar keduanya sinkron.

**Kegagalan yang diprediksi.** Migrasi yang memperkenalkan `violation_type` baru — atau salah ketik nama tipe yang sudah ada — lolos seluruh gate CI:

- Kolom `text` bebas menerima nilai apa pun, jadi tidak ada error di sisi DB.
- DB contract tests tidak mengenumerasi tipe, jadi tidak ada test yang merah.
- Jest client tidak melihat migrasi, jadi peta label tidak diketahui tertinggal.

Akibatnya baru terlihat di produksi: halaman Governance Violation menampilkan `snake_case` mentah untuk tipe itu. Fallback BL-12 menahan kerusakannya (halaman tetap terbaca, tidak pernah kosong), jadi ini **degradasi diam-diam**, bukan kegagalan yang berisik — tidak ada yang memberi tahu sampai seseorang kebetulan membuka halaman dan menyadarinya.

Salah ketik lebih buruk lagi: `self_aproval_attempt` menjadi tipe baru yang sah secara diam-diam, memecah baris audit yang seharusnya menyatu — dan tidak ada gate yang menangkapnya.

**Arah penyelesaian.** Belum diputuskan; dua opsi yang jelas:

1. **CHECK constraint** di `governance_violations.violation_type`. Murah, menolak tipe tak dikenal pada waktu tulis. Tapi menambah tipe jadi butuh migrasi ALTER, dan baris lama dengan tipe yang sudah tidak dipakai harus tetap lolos constraint.
2. **Tabel lookup** `governance_violation_types` + FK. Menjadikan himpunan tipe sebagai data yang bisa di-query — client dapat menariknya, atau test contract dapat membandingkannya dengan peta label sehingga drift jadi merah di CI. Lebih mahal: tabel + seed + RLS + FK di tabel yang append-only dan panas.

Opsi 2 satu-satunya yang benar-benar menutup drift (menjadikannya dapat diuji, bukan sekadar dilarang); opsi 1 hanya mencegah nilai baru masuk tanpa membuat peta client ikut tahu.

**Kapan dikerjakan.** Tidak mendesak — fallback BL-12 membuat konsekuensi terburuknya kosmetik. Layak diangkat bila: ada migrasi berikutnya yang menambah `violation_type` (piggyback), atau audit menuntut himpunan tipe pelanggaran yang enumerable, atau drift pertama benar-benar terjadi.

## Referensi

- [[audit-governance]] — model Activity Log & Governance Violation append-only, arti severity.
- [[ui-prototype-gap]] — backlog UI ber-ID dari perbandingan prototype (terpisah dari halaman ini).
- [[ws-04-governance-debt]] — governance debt lain yang sengaja ditunda, dengan sinyal re-open eksplisit.
