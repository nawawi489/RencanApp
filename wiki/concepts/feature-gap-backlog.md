---
type: concept
tags: [backlog, gap-analysis, prd-conformance, triage]
updated: 2026-07-21
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
| **BL-04** | MBR add-button | ~~Cakupan cascade MBR~~ ✅ **SELESAI 2026-07-21 — PR #141, migrasi 0082**. Akar sebenarnya bukan guard UI yang kurang melainkan **penamaan baris aturan yang tertinggal**: rename 0045 menggeser nama tabel, RPC ditulis ulang ke penamaan baru di 0046/0065, tapi isi `minimum_breakdown_rules` tidak pernah ikut dipindah → 3 dari 6 cabang RPC tidak menemukan baris aturannya dan fail-open permanen. Rinci di §4 | S→M | ✅ DONE |
| **BL-05** | Evaluation | ~~**2 dari 6 field §26 hilang di UI**: `success_factors`, `failure_factors`. Kolom DB ada (0046:1882-1893), RPC `record_evaluation` menerimanya, lib `governance-admin.ts:110-124` sudah mem-forward — hanya form `evaluation.tsx` yang tidak mengirim. **Nol migrasi**~~ ✅ **DONE 2026-07-21 — PR #138, nol migrasi**. Kolom `text[]` → UI mengumpulkan **list sungguhan**: satu textarea per field, konvensi satu faktor per baris, tiap baris non-kosong jadi satu elemen array (bukan blok teks dibungkus array satu elemen). Chip/tag editor ditolak: menambah N tombol hapus ≥44px + label SR tanpa keuntungan nyata, sedangkan `LabeledInput multiline` sudah jadi idiom form di layar itu. Dikunci tes `[F8-UI-18b]` (kirim) + `[F8-UI-18c]` (pre-fill round-trip) | S | ✅ |
| **BL-06** | Task Repeat | Field **"Zona waktu" §23** (item 5 dari 10) hilang. `task_repeat_rules` tidak punya kolom timezone; satu-satunya ada di `organizations.timezone`, dibaca `coalesce(o.timezone,'Asia/Jakarta')` di seluruh perhitungan deadline. **Butuh migrasi** + ubah logika deadline | S→M | ✅ |
| **BL-07** | Notifications | **Terkoreksi**: §28 mendefinisikan **9** tipe, 5 sudah jalan. Yang absen: **Bukti dikirim** (dikonflasi jadi `review_request`), **Deadline lewat one-time** (`instance_missed` hanya untuk repeat; task one-time tak pernah masuk state missed), **Permission berubah** (nihil), **MBR warning** (nihil). 3 dari 4 belum ada di CHECK constraint 13-tipe (0038). Gap 100% server-side — `lib/notifications.ts` sudah mirror tepat | M | ⚠️ |
| **BL-08** | Review | ~~**Aksi "Catatan" §24.3 hilang**~~ ✅ **SELESAI 2026-07-20 — nol migrasi**. Temuan RPC hard-reject **benar** (`0046:1976` + `0046:2051`) tapi hanya mengikat bila Catatan = nilai `decision` ketiga. PRD §24.3 tidak menyatakan semantiknya; **owner memutuskan NON-TERMINAL** → Catatan tidak memutuskan apa pun, jadi tidak pernah masuk jalur RPC review dan tidak menyentuh CHECK mana pun. Implementasi: `lib/inbox.ts::postReviewNote` (room Rencana Aksi → `send_chat_message` ber-konteks Tugas) + mode ketiga di `review-submission-panel.tsx`. Submission tetap `pending`. **Sisa ter-defer:** entri Activity Log — `write_activity` dicabut dari `authenticated` (`0062:57`) → butuh RPC SECURITY DEFINER baru (0083+). Rinci di branch `claude/pensive-goodall-42169f`: `ui-prototype-gap.md` §2.2 + item UI-G-016 (belum ada di tree ini; masuk saat merge) | XS→S | ✅ |
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
BL-02, ~~BL-05~~ ✅ **selesai 2026-07-21 (PR #138)**, BL-09(b).

**Butuh migrasi DB** (jadi bukan tiket sepele sekalipun UI-nya kecil):
BL-06 (kolom timezone di `task_repeat_rules` + ubah semua perhitungan deadline yang kini membaca `organizations.timezone`).

> [!warning] BL-08 sudah **keluar** dari daftar ini
> Rekomendasi awal "longgarkan CHECK `p_decision` di 2 RPC" **jangan dieksekusi** — ia mengasumsikan Catatan sebagai keputusan review ketiga, sedangkan owner memutuskan non-terminal. Melonggarkan CHECK `decision` sekarang akan menambah nilai yang tidak dipakai siapa pun sekaligus melemahkan invariant state machine review. Yang tersisa dari BL-08 hanyalah entri Activity Log (RPC SECURITY DEFINER baru, **bukan** perubahan CHECK) — rinci di branch `claude/pensive-goodall-42169f`, `ui-prototype-gap.md` §2.2.

**Butuh scoping/spec dulu:**
~~BL-04~~ ✅ **terjawab + selesai** — owner memutuskan cascade satu tingkat (PR #139), dan implementasinya menyingkap bahwa sisanya bukan keputusan produk melainkan drift data (§4). BL-07 (4 emitter server-side baru + migrasi CHECK constraint), BL-10 (spec sendiri; 7 sumber data + rewrite list jadi grouped).

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

## 4. BL-04 — cascade MBR: keputusan owner + akar sebenarnya

### 4.1 Keputusan owner (2026-07-20, PR #139)

MBR memakai **cascade satu tingkat ke bawah**, bukan guard per-level. Aturan `X → Y` yang belum patuh menahan pembuatan `Z` di bawah `Y`; ia **tidak** menahan pembuatan `Y` itu sendiri. Itu persis semantik mode `blokir_akses_turunan`, jadi arah implementasi yang sudah ada benar — jangan diubah ke per-level.

### 4.2 Akar masalah: penamaan baris aturan tertinggal dari rename 0045

Migrasi `0045` mengganti nama tabel kartu secara berantai (geser satu tingkat): `kpi_areas`→`strategies`, `strategies`→`initiatives`, `initiatives`→`action_plans`, `action_plans`→`tasks`. Migrasi `0046`/`0065` menulis ulang seluruh RPC memakai penamaan baru itu. Yang **tidak pernah ikut dipindah** adalah isi tabel `minimum_breakdown_rules` — 6 baris seed dari `0011` tetap memakai penamaan legacy.

Akibatnya `check_minimum_breakdown_compliance` mencari pasangan yang tidak ada (diverifikasi terhadap DB staging, 2026-07-21):

| Cabang RPC mencari | Baris aturan ditemukan |
|---|---|
| `goal → strategy` | **0** → fail-open permanen |
| `strategy → initiative` | 1 |
| `initiative → action_plan` | 1 |
| `action_plan → task` | **0** → fail-open permanen |
| `development_area → problem_statement` | 1 |
| `problem_statement → action_plan` | **0** → fail-open permanen |

Tanpa baris aturan, `v_rule.id IS NULL` → `meets_requirement := true` tanpa syarat. Jadi separuh aturan tidak pernah bisa menegakkan apa pun, berapa pun mode yang dipilih admin. **Itu bukan guard yang hilang, melainkan opsi Settings yang menjanjikan penegakan yang tidak pernah terjadi** — dan admin tidak punya cara tahu selain mengujinya sendiri.

> [!warning] Jebakan penamaan — komentar lama menyesatkan
> Komentar `CardType` di `settings-mbr.ts` menyamakan `kpi_area` dengan level Strategi. Itu benar **hanya untuk keadaan pra-0046**. RPC sekarang tidak mengenal `kpi_area` sama sekali (cabangnya `RAISE`), dan memakai `strategy` untuk level Strategi. Memetakan baris aturan ke level UI lewat pencocokan string mentah karena itu salah di kedua arah. Pemetaan eksplisit ada di `mobile/src/lib/mbr-cascade.ts`, dikunci tes `[BL-04·map·1..4]` yang membandingkannya dengan hierarki yang ditulis ulang independen di file tes.

Gejala yang sudah tampak sebelum perbaikan: Settings merender dua kartu aturan yang keduanya berbunyi **"Strategi → Strategi"**, karena `CARD_TYPE_LABEL` memetakan `kpi_area` dan `strategy` ke label yang sama.

### 4.3 Yang diperbaiki

**Migrasi `0082`** — memindahkan isi baris aturan ke penamaan sekarang (geseran yang sama dengan 0045, jadi makna tiap baris tidak berubah dan `min_count`/`enforcement_mode` pilihan organisasi terbawa utuh). Dilakukan dua fase lewat nilai sentinel karena pemetaannya adalah geseran — target satu baris adalah nilai baris lain, sehingga update satu fase menabrak unique index di tengah jalan. Idempoten lewat sentinel `kpi_area` (nilai yang hanya ada di penamaan legacy). CHECK constraint diperketat ke penamaan sekarang saja agar drift yang sama tidak bisa masuk lagi.

**Cascade UI** — pemetaan eksplisit di `mbr-cascade.ts` + wiring di `workspace-screen.tsx`. Empat tombol kini ter-guard (sebelumnya satu):

| Aturan | Kepatuhan dibaca pada | Tombol yang dijaga |
|---|---|---|
| `goal → strategy` | Goal | `+ Inisiatif` di kartu Strategi |
| `strategy → initiative` | Strategi | `+ Rencana Aksi` di kartu Inisiatif *(sudah ada)* |
| `initiative → action_plan` | Inisiatif | `+ Plan` di kartu Rencana Aksi (Performance) |
| `development_area → problem_statement` | Development Area | `+ Rencana Aksi` di kartu Problem Statement |
| `problem_statement → action_plan` | Problem Statement | `+ Plan` di kartu Rencana Aksi (Development) |

`action_plan → task` sengaja nihil sasaran: cucunya adalah turunan Tugas, sedangkan Tugas level terbawah tree.

**Gerbang mode diperbaiki.** Guard lama hanya melihat `is_compliant`, sehingga `hanya_peringatan` dan `blokir_aktivasi` ikut menahan tombol tambah — perilaku yang bukan miliknya. Kini hanya `blokir_akses_turunan` yang menahan; dikunci tes `[BL-04·3]` untuk ketiga mode lain di kelima aturan.

### 4.4 Dua cacat lain yang tersingkap

**(a) `activate_problem_statement` mati dengan 42703.** Fungsi itu menghitung `public.initiatives WHERE problem_statement_id` — kolom itu ada di `action_plans`, tidak di `initiatives` (turunan Problem Statement adalah Rencana Aksi). Dibuktikan langsung di staging: `ERROR: 42703: column "problem_statement_id" does not exist`. Selama ini tak terlihat karena mode default `hanya_peringatan` membuat cabang itu tak pernah dieksekusi — begitu aturan PS diset `blokir_aktivasi`, **setiap** aktivasi PS gagal dengan error Postgres mentah. Diperbaiki di `0082`.

**(b) `check_minimum_breakdown_compliance` masih memegang PUBLIC EXECUTE** (`proacl` = `=X/postgres`) — sisa `DROP ... CASCADE` di `0046` yang mereset ACL, kelas bug yang sama yang melahirkan contract `0066`. Dicabut di `0082`, disertai `GRANT` eksplisit ke `authenticated` (tanpa itu klien kehilangan seluruh indikator Kelengkapan Perencanaan, karena sebelumnya ia mewarisi hak lewat PUBLIC).

Semuanya dijaga contract test `supabase/tests/0082_mbr_rule_naming_contract.sql` (5 blok, hijau di Postgres nyata).

### 4.5 Utang yang sengaja ditinggalkan

- **Nol penegakan server-side untuk `blokir_akses_turunan`.** Trigger `tg_enforce_mbr_block_child` masih ada sebagai fungsi tapi **tidak terpasang di tabel mana pun** — `0046` menghapusnya lewat `DROP FUNCTION ... CASCADE` (yang ikut menghapus trigger-nya) lalu hanya membuat ulang fungsinya. Jadi cascade sepenuhnya ditegakkan klien. Lebih jauh, badan fungsi itu **meleset satu tingkat**: untuk INSERT ke `initiatives` ia memeriksa aturan `strategy→initiative` dan menghitung sibling Inisiatif — artinya dengan `min_count=1` dan 0 Inisiatif, Inisiatif pertama tak akan pernah bisa dibuat (mengunci dirinya sendiri). Siapa pun yang memasang ulang trigger ini **wajib** memperbaiki arahnya dulu.
- **`goal → strategy` terkunci di UI.** `isLocked` menyembunyikan seluruh kontrol untuk aturan ini (konsisten gerbang aktivasi Goal Fase 4), padahal RPC `set_minimum_breakdown_rule` sejak `0065` menerima `blokir_akses_turunan` untuknya. Cascade-nya sudah ter-wiring dan teruji; hanya jalur Settings-nya yang tertutup.
- **Copy legacy di pesan `activate_strategy`** masih berbunyi "KPI Area" / "Strategy". Kosmetik, tidak disentuh agar diff tetap fokus.

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
