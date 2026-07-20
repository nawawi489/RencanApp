---
type: concept
tags: [backlog, gap-analysis, prd-conformance, triage]
updated: 2026-07-20
sources: 0
---

# Feature Gap Backlog — item di bawah ambang P-slot

Kumpulan gap yang **belum layak menempati P-slot** (bukan blocker rilis, bukan pengalaman inti yang rusak) tapi harus tercatat supaya tidak hilang. Berbeda dari [[ui-prototype-gap]] yang membandingkan app vs prototype `design.html`: daftar ini adalah **gap app vs PRD** plus inkonsistensi perilaku yang ditemukan saat audit fitur.

Aturan pakai sama: setiap item punya ID stabil (`BL-##`), setiap PR yang menutup item mencantumkan ID-nya, item selesai dicoret + tanggal lalu diringkas ke `log.md`.

Ukuran: **XS** = satu file/satu patch · **S** = satu layar + test · **M** = beberapa layar/hook · **L** = butuh spec sendiri.

---

## 1. Daftar item

Semua item diverifikasi terhadap `mobile/src/` + `supabase/migrations/` pada **2026-07-20**. Kolom Status: ✅ CONFIRMED (gap nyata), ⚠️ terkoreksi, ❌ bukan gap, ✅ DONE (sudah merged).

> [!note] Halaman ini menggantikan versi rekonstruksi
> Antara pencatatan awal dan commit ini, sebuah sesi lain sempat membangun ulang halaman ini dari entri log karena file aslinya belum masuk repo (merged lewat #117). Rekonstruksi itu menandai BL-04/05/06 sebagai "tidak terpulihkan" dan seluruh baris lain ber-`[?]`. Tabel di bawah adalah hasil audit sebenarnya, jadi rekonstruksi tersebut digantikan seluruhnya — **kecuali** §BL-12 dan §BL-13 di bawah, yang bukan tebakan melainkan analisis terverifikasi dari sesi tersebut dan dipertahankan utuh.

| ID | Area | Gap (setelah verifikasi) | Ukuran | Status |
|---|---|---|---|---|
| **BL-01** | People | **Ranking tie tidak konsisten**. `people-profile/[id].tsx:222` render `rank_number` dari DB; `people.tsx:94-104` membuang `rank_number` (padahal `listRanking` sudah `select('*')`) lalu me-derive `rank += 1` per orang. DB memakai *competition ranking* (skor sama → rank sama, berikutnya melompat — migrasi 0013 D11), list memakai 1,2,3 berurutan → tie tampil beda | XS | ✅ |
| **BL-02** | Strategy period | **AC-11 FAIL**. `strategy/new.tsx:254-259` render `DateRangeField` editable; `parentQ.data` hanya dipakai untuk `goal_template_id` + `pic_id`, `period_start/end` Goal tidak pernah dibaca. PRD §12.1 (baris 540-544): *"Strategy tidak punya masa berlaku sendiri karena mengikuti Goal tahunan"* | S | ✅ |
| **BL-03** | Past-period dim | ~~AC-9 parsial~~ **BUKAN GAP KODE — keputusan owner 2026-07-03**. `PastDim` sempat ada (fix single-layer 2026-07-02) lalu **dicabut owner** sehari kemudian; kini nol layer dim, dikunci tes `[W08·1]`/`[W08·2]` (`countOpacityHalf === 0`). **Tapi PRD masih mewajibkan dim** — §44 AC-9 "tampil redup", diulang normatif di §7.7 & §11.3 (§37 permisif, tak konflik). Konflik spec-vs-kode ini yang melahirkan ulang temuan, bukan bug | — | ❌ kode · ⚠️ spec |
| **BL-04** | MBR add-button | **Terkoreksi**: bukan "hanya strategy→initiative yang di-guard". Dari 6 tombol tambah di `workspace-screen.tsx`, **hanya 1** yang ter-guard — `initiative→action_plan` (baris 521-531) — dan itu memakai data kepatuhan `strategy→initiative` (cascade `blokir_akses_turunan`, WSA-04). Tombol `+ Inisiatif` milik strategy sendiri **tidak** ter-guard. `goal/[id].tsx` nol pemakaian MBR | S | ⚠️ |
| **BL-05** | Evaluation | **2 dari 6 field §26 hilang di UI**: `success_factors`, `failure_factors`. Kolom DB ada (0046:1882-1893), RPC `record_evaluation` menerimanya, lib `governance-admin.ts:110-124` sudah mem-forward — hanya form `evaluation.tsx` yang tidak mengirim. **Nol migrasi** | S | ✅ |
| **BL-06** | Task Repeat | Field **"Zona waktu" §23** (item 5 dari 10) hilang. `action_plan_repeat_rules` tidak punya kolom timezone; satu-satunya ada di `organizations.timezone`, dibaca `coalesce(o.timezone,'Asia/Jakarta')` di seluruh perhitungan deadline. **Butuh migrasi** + ubah logika deadline | S→M | ✅ |
| **BL-07** | Notifications | **Terkoreksi**: §28 mendefinisikan **9** tipe, 5 sudah jalan. Yang absen: **Bukti dikirim** (dikonflasi jadi `review_request`), **Deadline lewat one-time** (`instance_missed` hanya untuk repeat; task one-time tak pernah masuk state missed), **Permission berubah** (nihil), **MBR warning** (nihil). 3 dari 4 belum ada di CHECK constraint 13-tipe (0038). Gap 100% server-side — `lib/notifications.ts` sudah mirror tepat | M | ⚠️ |
| **BL-08** | Review | **Aksi "Catatan" §24.3 hilang**. `review-submission-panel.tsx:10` hanya `'approve' \| 'reject'`. Kedua RPC (`review_task_submission`, `review_task_instance_submission`) hard-reject nilai ketiga: `if p_decision not in ('approve','reject') then raise`. **Butuh migrasi** — bukan XS | XS→S | ⚠️ |
| **BL-09** | Archive | **Pecah 3, satu klaim gugur**: (a) ❌ `includeArchived` **sudah** di-pass (`settings-archive.tsx:32`); (b) ✅ row tanpa `onPress` (bandingkan `search.tsx:58-60`) — **masih terbuka**; ~~(c) invalidate key salah~~ ✅ **SELESAI 2026-07-20** — `['search']` → `['cards_search']`, dikunci tes `[F8-UI-28]` | (b) S | ⚠️ |
| **BL-10** | Search | **7 dari 14 scope §38 hilang** (persis seperti diklaim) + **tanpa grouping** (`search.tsx:70-79` FlatList datar, padahal §38 mewajibkan pengelompokan). `CardEntityType` hanya 7 tipe lewat satu RPC `search_cards`. RPC `search_chat_messages` sudah ada tapi hanya dipakai Inbox, tak pernah di-import layar Search | L | ✅ |
| **BL-11** | Header | ~~Ikon Notifications §7.2 hilang~~ ✅ **SELESAI** — merged #115 (UI-G-016); `notifications-outline` + badge unread via `useUnreadCount()`, badge disembunyikan saat loading/error (bukan fail-silent ke "0"), jumlah masuk `accessibilityLabel` | XS | ✅ DONE |
| **BL-12** | Governance Violation | ~~Raw snake_case di `settings-governance-violation.tsx`~~ ✅ **SELESAI** — merged #117; `GOVERNANCE_VIOLATION_TYPE_LABEL` + `governanceViolationTypeLabel()` dgn fallback nilai mentah. Verifikasi independen saya mencocokkan hitungan **11 tipe** yang bisa di-emit. Detail §BL-12 di bawah | XS | ✅ DONE |
| **BL-13** | Governance Violation | **Tidak ada sumber kebenaran `violation_type`** — literal PL/pgSQL tersebar di 11 migrasi, peta label client salinan manual, nol gate sinkronisasi → drift lolos semua CI dan muncul sebagai degradasi diam-diam. Utang tersisa dari BL-12. Detail §BL-13 di bawah | butuh scoping | ✅ (dari #117) |

---

## 2. Triage (pasca-verifikasi)

**XS murni — nol migrasi, nol keputusan produk:**
~~BL-09(c) invalidate key~~ ✅ **selesai 2026-07-20**; BL-12 label map, BL-11 ikon header, BL-01 `rank_number`.

**S — satu layar + test, nol migrasi:**
BL-02, BL-05, BL-09(b).

**Butuh migrasi DB** (jadi bukan tiket sepele sekalipun UI-nya kecil):
BL-06 (kolom timezone di `action_plan_repeat_rules` + ubah semua perhitungan deadline yang kini membaca `organizations.timezone`), BL-08 (longgarkan CHECK `p_decision` di 2 RPC, atau RPC "tambah catatan" terpisah).

**Butuh scoping/spec dulu:**
BL-04 (putuskan dulu: MBR menjaga *tombol tambah* di setiap level, atau hanya cascade satu level ke bawah seperti sekarang — ini keputusan produk, bukan bug), BL-07 (4 emitter server-side baru + migrasi CHECK constraint), BL-10 (spec sendiri; 7 sumber data + rewrite list jadi grouped).

**Ditutup tanpa dikerjakan:** BL-03 — keputusan desain, bukan gap.

> [!warning] BL-03 jangan dikerjakan sebagai bug
> Menambahkan kembali dim opacity akan **memerahkan test** `[W08·1]`/`[W08·2]` (`countOpacityHalf === 0`) dan membalik keputusan owner 2026-07-03.
>
> Akar masalahnya **dokumentasi, bukan kode**: keputusan pencabutan tidak pernah masuk PRD, sehingga §44 AC-9 masih berbunyi "tampil redup" dan setiap audit app-vs-PRD akan melahirkan ulang temuan ini. Tutup dengan mencatat pencabutan di PRD, bukan dengan menyentuh `mobile/`.
>
> Catatan teknis untuk kalau redup visual suatu saat diinginkan lagi: alasan pencabutan adalah `opacity-50` bersarang jatuh ke 0.125 di level-3 (gagal AA). Itu argumen melawan *penumpukan*, bukan melawan dim per se — DESIGN §4 melarang opacity jadi *satu-satunya* sinyal, dan dim + badge teks berdampingan tetap patuh.

> [!warning] BL-09 bukan satu bug
> Klaim (a) "tidak tercari di Search" **gugur** — `includeArchived: true` sudah di-pass. Tersisa (b) row mati dan (c) invalidate key salah. (c) adalah **bug diam**: restore sukses, list tidak menyegar, user mengira gagal lalu mengulang. Item paling untung-per-baris di seluruh daftar.

**Paling dekat ke ambang P-slot:** BL-09(c) (bug diam, perbaikan satu baris) dan BL-02 (satu-satunya pelanggaran AC harfiah terhadap PRD).

---

## 3. Status verifikasi

Diverifikasi **2026-07-20** terhadap `mobile/src/`, `supabase/migrations/`, dan `PRD.md` (4 agen paralel; bukti file:line ada di tabel §1). Hasil: **7 CONFIRMED apa adanya · 4 terkoreksi · 1 gugur**.

Efek samping verifikasi: baris **UI-S-W08** di [[ui-prototype-gap]] berbunyi "PastDim single-layer IMPLEMENTED" padahal kode kini nol layer dim. Klaim itu **benar untuk satu hari** — `PastDim` shipped 2026-07-02, dicabut owner 2026-07-03 (`log.md` [2026-07-03]) — lalu tidak pernah dimutakhirkan. Koreksinya ditangani terpisah bersama amandemen PRD §44 AC-9.

---

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
