---
type: concept
tags: [backlog, gap-analysis, prd-conformance, triage]
updated: 2026-07-22
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
| **BL-01** | People | ~~**Ranking tie tidak konsisten**. `people.tsx:94-104` membuang `rank_number` lalu me-derive `rank += 1` per orang, sedangkan DB memakai *competition ranking* (0013 D11) → tie tampil beda dari `people-profile/[id].tsx:222`~~ ✅ **SELESAI 2026-07-20 — PR #116, nol migrasi.** `people.tsx:80-84` kini membangun `rankByUser` dari `r.rank_number`; nol derivasi berbasis indeks tersisa di kedua layar. Dikunci tes `people.test.tsx` "tie renders rank_number kembar dari DB, bukan index+1" (fixture `1,1,3`). **Baris ini sempat basi**: PR #116 merge **13:42 UTC 2026-07-20**, hari yang sama dengan audit yang menuliskannya, jadi tabel ini menandainya CONFIRMED padahal sudah tertutup — dikoreksi 2026-07-22 | XS | ✅ DONE |
| **BL-02** | Strategy period | ~~**AC-11 FAIL**. `strategy/new.tsx:254-259` render `DateRangeField` editable; `parentQ.data` hanya dipakai untuk `goal_template_id` + `pic_id`, `period_start/end` Goal tidak pernah dibaca~~ ✅ **SELESAI 2026-07-22 — merged #140, nol migrasi. PRD §44 AC-11 kini PASS.** `DateRangeField` dicabut; periode disalin dari Goal induk saat submit dan tampil **read-only** (token `Field`) sebagai konteks — periode yang ditetapkan diam-diam tak bisa ditelusuri saat aktivasi ditolak. Goal induk tanpa periode → simpan **diblokir** menunjuk Goal, bukan kirim NULL (`activate_strategy` 0078 mem-gate `period_start/end` NOT NULL → Draft ber-periode NULL tak pernah bisa aktif). Dikunci tes `[BL02-1..3]`. **Nol permukaan lain** yang mengedit periode Strategy (`DraftCompletion` di `[id].tsx` hanya target+PIC), jadi AC tertutup penuh | S | ✅ DONE |
| **BL-03** | Past-period dim | ~~AC-9 parsial~~ **BUKAN GAP KODE — keputusan owner 2026-07-03**. `PastDim` sempat ada (fix single-layer 2026-07-02) lalu **dicabut owner** sehari kemudian; kini nol layer dim, dikunci tes `[W08·1]`/`[W08·2]` (`countOpacityHalf === 0`). **Tapi PRD masih mewajibkan dim** — §44 AC-9 "tampil redup", diulang normatif di §7.7 & §11.3 (§37 permisif, tak konflik). Konflik spec-vs-kode ini yang melahirkan ulang temuan, bukan bug | — | ❌ kode · ⚠️ spec |
| **BL-04** | MBR add-button | ~~Cakupan cascade MBR~~ ✅ **SELESAI 2026-07-21 — PR #141, migrasi 0082**. Akar sebenarnya bukan guard UI yang kurang melainkan **penamaan baris aturan yang tertinggal**: rename 0045 menggeser nama tabel, RPC ditulis ulang ke penamaan baru di 0046/0065, tapi isi `minimum_breakdown_rules` tidak pernah ikut dipindah → 3 dari 6 cabang RPC tidak menemukan baris aturannya dan fail-open permanen. Rinci di §4 | S→M | ✅ DONE |
| **BL-05** | Evaluation | ~~**2 dari 6 field §26 hilang di UI**: `success_factors`, `failure_factors`. Kolom DB ada (0046:1882-1893), RPC `record_evaluation` menerimanya, lib `governance-admin.ts:110-124` sudah mem-forward — hanya form `evaluation.tsx` yang tidak mengirim. **Nol migrasi**~~ ✅ **DONE 2026-07-21 — PR #138, nol migrasi**. Kolom `text[]` → UI mengumpulkan **list sungguhan**: satu textarea per field, konvensi satu faktor per baris, tiap baris non-kosong jadi satu elemen array (bukan blok teks dibungkus array satu elemen). Chip/tag editor ditolak: menambah N tombol hapus ≥44px + label SR tanpa keuntungan nyata, sedangkan `LabeledInput multiline` sudah jadi idiom form di layar itu. Dikunci tes `[F8-UI-18b]` (kirim) + `[F8-UI-18c]` (pre-fill round-trip) | S | ✅ |
| **BL-06** | Task Repeat | Field **"Zona waktu" §23** (item 5 dari 10) hilang. `task_repeat_rules` tidak punya kolom timezone; satu-satunya ada di `organizations.timezone`, dibaca `coalesce(o.timezone,'Asia/Jakarta')` di seluruh perhitungan deadline. **Butuh migrasi** + ubah logika deadline | S→M | ✅ |
| **BL-07** | Notifications | **Terkoreksi**: §28 mendefinisikan **9** tipe, 5 sudah jalan. Yang absen: **Bukti dikirim** (dikonflasi jadi `review_request`), **Deadline lewat one-time** (`instance_missed` hanya untuk repeat; task one-time tak pernah masuk state missed), **Permission berubah** (nihil), **MBR warning** (nihil). 3 dari 4 belum ada di CHECK constraint 13-tipe (0038). Gap 100% server-side — `lib/notifications.ts` sudah mirror tepat | M | ⚠️ |
| **BL-08** | Review | ~~**Aksi "Catatan" §24.3 hilang**~~ ✅ **SELESAI 2026-07-20 — nol migrasi**. Temuan RPC hard-reject **benar** (`0046:1976` + `0046:2051`) tapi hanya mengikat bila Catatan = nilai `decision` ketiga. PRD §24.3 tidak menyatakan semantiknya; **owner memutuskan NON-TERMINAL** → Catatan tidak memutuskan apa pun, jadi tidak pernah masuk jalur RPC review dan tidak menyentuh CHECK mana pun. Implementasi: `lib/inbox.ts::postReviewNote` (room Rencana Aksi → `send_chat_message` ber-konteks Tugas) + mode ketiga di `review-submission-panel.tsx`. Submission tetap `pending`. **Sisa ter-defer:** entri Activity Log — `write_activity` dicabut dari `authenticated` (`0062:57`) → butuh RPC SECURITY DEFINER baru (0083+). Rinci di branch `claude/pensive-goodall-42169f`: `ui-prototype-gap.md` §2.2 + item UI-G-016 (belum ada di tree ini; masuk saat merge) | XS→S | ✅ |
| **BL-09** | Archive | ~~**Pecah 3, satu klaim gugur**~~ ✅ **DONE 2026-07-22 — BL-09 tertutup seluruhnya**. (a) ❌ **gugur** — `includeArchived` sudah di-pass (`settings-archive.tsx:32`); ~~(b) row tanpa `onPress`~~ ✅ **PR #144, nol migrasi** — pola `search.tsx` dipakai ulang (`ENTITY_ROUTE_SEGMENT` + fallback `undefined` → kartu tetap non-pressable, bukan push path rusak), `SectionCard` dapat prop `accessibilityLabel` opsional (DESIGN §4.4) **dan slot `actions`** — kontrol tak lagi bersarang di dalam region pressable (`Pressable` RN default `accessible={true}` ⇒ tombol bersarang tak bisa difokus VoiceOver; kegagalan diam yang lolos QA visual). 2 dari 10 kartu pressable di `src/` terdampak, keduanya dipindah; aturan didaftarkan di **DESIGN §4 aturan 6**. Dikunci `[F8-UI-29]`/`[F8-UI-30]`/`[F8-UI-31]` + `[UI-SC-1..5]`; ~~(c) invalidate key salah~~ ✅ **SELESAI 2026-07-20** — `['search']` → `['cards_search']`, dikunci tes `[F8-UI-28]` | (b) S | ✅ |
| **BL-10** | Search | **7 dari 14 scope §38 hilang** (persis seperti diklaim) + **tanpa grouping** (`search.tsx:70-79` FlatList datar, padahal §38 mewajibkan pengelompokan). `CardEntityType` hanya 7 tipe lewat satu RPC `search_cards`. RPC `search_chat_messages` sudah ada tapi hanya dipakai Inbox, tak pernah di-import layar Search | L | ✅ |
| **BL-11** | Header | ~~Ikon Notifications §7.2 hilang~~ ✅ **SELESAI** — merged #115 (UI-G-016); `notifications-outline` + badge unread via `useUnreadCount()`, badge disembunyikan saat loading/error (bukan fail-silent ke "0"), jumlah masuk `accessibilityLabel` | XS | ✅ DONE |
| **BL-12** | Governance Violation | ~~Raw snake_case di `settings-governance-violation.tsx`~~ ✅ **SELESAI** — merged #117; `GOVERNANCE_VIOLATION_TYPE_LABEL` + `governanceViolationTypeLabel()` dgn fallback nilai mentah. Verifikasi independen saya mencocokkan hitungan **11 tipe** yang bisa di-emit. Detail §BL-12 di bawah | XS | ✅ DONE |
| **BL-13** | Governance Violation | ~~**Tidak ada sumber kebenaran `violation_type`**~~ ✅ **SELESAI 2026-07-22 — PR #145, nol migrasi**. Ditutup lewat **opsi 3 (gate CI, tanpa perubahan schema)**, bukan CHECK constraint maupun tabel lookup: jest mem-parse `supabase/migrations/*.sql` (kedua jalur emisi — `insert into governance_violations` langsung **dan** pemanggilan `log_governance_violation()`) lalu menuntut tiap tipe ter-emit punya entri di `GOVERNANCE_VIOLATION_TYPE_LABEL`. Parser menemukan **tepat 11 tipe** — cocok dengan audit BL-12. Peta label kini **satu-satunya** salinan manual: daftar hardcoded di test BL-12 diganti keluaran parser. Dikunci `[BL13-1..6]`. Alasan penolakan opsi 1/2 di §BL-13 | butuh scoping → XS | ✅ DONE |
| **BL-14** | Onboarding / org | **`handle_new_user` menaruh SETIAP user baru di org TERTUA** (`select id from public.organizations order by created_at limit 1`; definisi hidup ada di **migrasi 0015**, bukan 0001). Selama hanya ada satu org perilakunya benar; begitu ada lebih dari satu, user baru diam-diam masuk org yang salah — nol error, hanya workspace kosong karena RLS. ✅ **SELESAI 2026-07-22 — PR #147, migrasi 0083 (opsi 2).** Keputusan produk: V1 dikunci single-org, trigger harus gagal keras. Bentuk pertama (`RAISE` polos bila `count(*) organizations > 1`) **dihentikan sebelum ditulis** — ia mematikan seluruh gate DB contract test, sebab `supabase/tests/_fixtures.sql` sendiri membuat **2 org** lalu menyisipkan `auth.users`. Yang dikirim: jalur penempatan **eksplisit** `raw_app_meta_data.organization_id` (service-role only, pola sama seperti `role_level` 0015), `RAISE` hanya bila key absen **dan** org > 1; single-org tanpa key tetap jalan persis seperti dulu. 21 file pemanggil disetel eksplisit (prelude + 18 contract test + 2 seed). Dikunci `T-BL14-1..8`. Rinci §5 | M | ✅ DONE |
| **BL-15** | Onboarding / org | ~~**Koreksi org di `create-user` gagal senyap**~~ ✅ **SELESAI** — turunan investigasi BL-14 (#146). Tiga cabang di Edge Function `create-user` melewati/menggagalkan koreksi `organization_id` lalu tetap menjawab HTTP 200 tanpa penanda apa pun: lookup profil actor null, `role_templates` tak ketemu, dan `profileError` yang cuma di-log. Respons kini membawa field `warning` eksplisit dan UI Tambah User menampilkannya sebagai hasil berbeda dari sukses. Detail §BL-15 di bawah. **Tidak** menyentuh trigger `handle_new_user` — perbaikan trigger dikirim terpisah, lihat BL-14 (✅ DONE, PR #147) | S | ✅ DONE |

---

## 2. Triage (pasca-verifikasi)

> [!note] Sisa pekerjaan per 2026-07-22: **dua item, keduanya butuh spec**
> Setiap bucket yang bisa dikerjakan langsung — XS, S, dan "butuh migrasi DB" — kini **kosong**. Yang tersisa hanya **BL-07** (Notifications, M) dan **BL-10** (Search, L), dan keduanya duduk di bucket "butuh scoping/spec dulu" karena masing-masing menyimpan keputusan produk yang PRD tidak jawab — bukan sekadar karena besar. Keduanya masuk `/sdd-plan`, bukan diambil sebagai tiket. BL-03 ditutup permanen (keputusan desain; jangan dikerjakan sebagai bug).

**XS murni — nol migrasi, nol keputusan produk:**
~~BL-09(c) invalidate key~~ ✅ **selesai 2026-07-20**; ~~BL-12 label map~~ ✅ (#117); ~~BL-11 ikon header~~ ✅ (#115); ~~BL-01 `rank_number`~~ ✅ **selesai 2026-07-20 (#116)**. **Bucket ini kosong.**

**S — satu layar + test, nol migrasi:**
~~BL-02~~ ✅ **selesai 2026-07-22 (#140)**; ~~BL-05~~ ✅ **selesai 2026-07-21 (PR #138)**; ~~BL-09(b)~~ ✅ **selesai 2026-07-22 (#144)**. **Bucket ini kosong.**

**Butuh migrasi DB** (jadi bukan tiket sepele sekalipun UI-nya kecil):
BL-06 (kolom timezone di `task_repeat_rules` + ubah semua perhitungan deadline yang kini membaca `organizations.timezone`).

> [!warning] BL-08 sudah **keluar** dari daftar ini
> Rekomendasi awal "longgarkan CHECK `p_decision` di 2 RPC" **jangan dieksekusi** — ia mengasumsikan Catatan sebagai keputusan review ketiga, sedangkan owner memutuskan non-terminal. Melonggarkan CHECK `decision` sekarang akan menambah nilai yang tidak dipakai siapa pun sekaligus melemahkan invariant state machine review. Yang tersisa dari BL-08 hanyalah entri Activity Log (RPC SECURITY DEFINER baru, **bukan** perubahan CHECK) — rinci di branch `claude/pensive-goodall-42169f`, `ui-prototype-gap.md` §2.2.

**Butuh scoping/spec dulu:**
~~BL-13~~ ✅ **terjawab + selesai 2026-07-22 (PR #145)** — scoping menghasilkan **opsi ketiga** yang tidak ada di daftar awal (gate CI tanpa perubahan schema) dan mendominasi kedua opsi schema pada kriteria halaman ini sendiri. Pelajaran: dua opsi yang tercatat keduanya berupa perubahan DB karena gap-nya *dibingkai* sebagai gap schema; begitu dibingkai ulang sebagai "drift antara dua artefak yang bisa dibaca CI", ongkosnya turun dari migrasi+RLS+FK menjadi dua file test. ~~BL-04~~ ✅ **terjawab + selesai** — owner memutuskan cascade satu tingkat (dicatat di PR #139, yang **ditutup tanpa merge 2026-07-22**; konten keputusannya sudah mendarat lewat #141 + migrasi 0082), dan implementasinya menyingkap bahwa sisanya bukan keputusan produk melainkan drift data (§4). BL-07 (4 emitter server-side baru + migrasi CHECK constraint), BL-10 (spec sendiri; 7 sumber data + rewrite list jadi grouped), ~~**BL-14**~~ ✅ **terjawab + selesai 2026-07-22 (PR #147, migrasi 0083)** — keputusan produk turun (single-org dikunci untuk V1), lalu scoping bergeser dari "apa keputusannya" ke "**di mana** penegakannya ditaruh" karena guard runtime bentuk polos memerahkan seluruh gate DB contract test. Owner memilih opsi 2: jalur org eksplisit + `RAISE` sebagai fallback. Pelajaran sejenis BL-13: bentuk pertama yang diminta adalah satu-satunya yang tak bisa dikirim, dan itu baru terlihat setelah **fixture** dibaca — bukan setelah trigger-nya dibaca. Rinci di §5.

**Ditutup tanpa dikerjakan:** BL-03 — keputusan desain, bukan gap.

> [!warning] BL-03 jangan dikerjakan sebagai bug
> Menambahkan kembali dim opacity akan **memerahkan test** `[W08·1]`/`[W08·2]` (`countOpacityHalf === 0`) dan membalik keputusan owner 2026-07-03.
>
> Akar masalahnya **dokumentasi, bukan kode**: keputusan pencabutan tidak pernah masuk PRD, sehingga §44 AC-9 masih berbunyi "tampil redup" dan setiap audit app-vs-PRD akan melahirkan ulang temuan ini. Tutup dengan mencatat pencabutan di PRD, bukan dengan menyentuh `mobile/`.
>
> Catatan teknis untuk kalau redup visual suatu saat diinginkan lagi: alasan pencabutan adalah `opacity-50` bersarang jatuh ke 0.125 di level-3 (gagal AA). Itu argumen melawan *penumpukan*, bukan melawan dim per se — DESIGN §4 melarang opacity jadi *satu-satunya* sinyal, dan dim + badge teks berdampingan tetap patuh.

> [!warning] BL-09 bukan satu bug
> Klaim (a) "tidak tercari di Search" **gugur** — `includeArchived: true` sudah di-pass. Tersisa (b) row mati dan (c) invalidate key salah. (c) adalah **bug diam**: restore sukses, list tidak menyegar, user mengira gagal lalu mengulang. Item paling untung-per-baris di seluruh daftar.
>
> **Tertutup 2026-07-22.** (c) di #119, (b) di #144. Pelajaran yang dibawa keluar: satu baris backlog yang menggabungkan tiga klaim menghasilkan satu klaim palsu, satu bug diam, dan satu cacat UX — memverifikasi tiap klaim satu per satu **sebelum** menjadwalkan mencegah tiket dinilai terlalu besar (atau terlalu kecil) secara keseluruhan.

**Paling dekat ke ambang P-slot:** BL-09(c) (bug diam, perbaikan satu baris) dan BL-02 (satu-satunya pelanggaran AC harfiah terhadap PRD) — **keduanya kini selesai**. Tidak ada lagi pelanggaran AC harfiah yang tercatat di daftar ini.

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

## 5. BL-14 — asumsi single-org: keputusan owner, guard yang dikirim, dan bentuk yang ditolak

### 5.1 Keputusan owner (2026-07-22)

**V1 dikunci single-org.** `handle_new_user` tidak boleh lagi menebak organisasi secara diam-diam; ia harus **gagal keras** begitu asumsi yang ia sandari tidak lagi berlaku. Keputusan ini menutup pertanyaan produk yang menggantung di baris BL-14 sejak audit 2026-07-20 — tidak ada lagi `[?]` soal "apakah V1 memang single-org".

Bentuk penegakannya diputuskan dalam dua langkah. Bentuk yang diminta pertama kali — `RAISE` polos bila `count(*) from public.organizations > 1` — diverifikasi sebelum ditulis dan **tidak jadi dikirim**, karena ia mematikan gate CI yang justru menjaga seluruh lapisan DB (§5.3). Owner lalu memilih **opsi 2** dari ruang opsi di §5.4, yang mendarat di **migrasi 0083**.

### 5.2 Definisi yang hidup

`handle_new_user` ditulis ulang lintas migrasi; yang berlaku sekarang ada di **`0015_qa_followup_fixes.sql:45`**, bukan `0001`. Perbedaannya penting: 0015 menambahkan penghormatan pada `raw_app_meta_data->>'role_level'` (service-role only) untuk memilih role template. Pemilihan **org** tidak berubah sejak 0001 — masih `order by created_at limit 1`. `0002`/`0003`/`0066` hanya menyentuh GRANT, bukan body.

Konsekuensi teknis untuk implementasi nanti: pakai `create or replace function` (ACL dipertahankan), **bukan** `drop function … cascade` — pola terakhir mereset ACL ke `PUBLIC EXECUTE` dan akan membatalkan `REVOKE` dari 0003 + 0066 sekaligus melepas trigger `on auth.users`.

### 5.3 Kenapa guard bentuk polos dihentikan — angka

Penegakan dibaca dari `scripts/ci/run-db-contract-tests.sh`: satu database dipakai bersama untuk seluruh loop (tidak ada reset antar file), prelude `supabase/tests/_fixtures.sql` diterapkan lebih dulu, dan **kegagalan prelude bersifat FATAL** (`exit 1`, nol test dijalankan).

Prelude itu sendiri melanggar asumsi single-org:

| Baris `_fixtures.sql` | Isi |
|---|---|
| 43 | `insert into public.organizations` — org #1 (`Contract Fixtures Org`, `created_at = 'epoch'`) |
| 87 | `insert into public.organizations` — org #2 (`DCR-05 Fixtures Org`, `epoch + 1 second`) |
| 100 | `insert into auth.users` — 2 user, **sesudah org kedua ada** |

Jadi guard ber-`RAISE` gagal pada baris 100 prelude → runner berhenti sebelum satu pun contract file jalan. Bukan "beberapa test merah": **gate-nya nol**.

Efeknya juga tidak berhenti di prelude. Karena prelude commit dan tidak ada reset antar file, sejak titik itu `count(*) organizations ≥ 2` **permanen** untuk sisa run — sehingga setiap `insert into auth.users` berikutnya ikut raise. Di `supabase/tests/` (di luar `*.wip.sql`): **18 file** menyisipkan `auth.users`, dan **12 file** membuat org tambahan sendiri.

Yang menentukan: 12 file itu bukan kelalaian fixture yang bisa dirapikan. Lima di antaranya adalah suite **cross-org isolation** (`0039`, `0067`, `0068`, `0063_push_ac_fan6_cross_org`, `0079`) yang *harus* punya dua org untuk menguji hal yang mereka uji — plus `0073` yang membuat 3 org untuk tujuan sama meski tak menyisipkan `auth.users`. Guard yang melarang org kedua eksis dan test yang mensyaratkan org kedua eksis tidak bisa hidup di database yang sama.

> [!warning] Jangan kirim guard `RAISE` polos di `handle_new_user`
> Ia hijau di lokal single-org dan merah total di CI, pada gate yang kegagalannya menyembunyikan seluruh regresi DB lain. Verifikasi ini **statis** (pembacaan `_fixtures.sql` + runner), belum dijalankan terhadap database — tapi jalur baris 87 → baris 100 tidak punya cabang.

### 5.4 Ruang opsi untuk penegakan — **opsi 2 dipilih owner**

Akar biayanya bukan trigger-nya, melainkan **ketergantungan test suite pada fallback diam "org tertua"** — 18 file mengandalkan `auth.users` berubah jadi profil tanpa pernah menyebut org. Itu sendiri sinyal: perilaku yang dianggap terlalu berbahaya untuk produksi adalah perilaku yang dipakai fixture sebagai kenyamanan.

1. **`RAISE` polos** — spesifikasi awal. **Ditolak**, §5.3.
2. **Jalur eksplisit + `RAISE` hanya sebagai fallback.** Trigger membaca `raw_app_meta_data->>'organization_id'` lebih dulu (service-role only, sama seperti `role_level` di 0015); bila absen **dan** `count(*) > 1` → `RAISE`; bila absen dan tunggal → perilaku hari ini. Lalu prelude + 18 file test disetel menyebut org-nya eksplisit. Ukuran **M**, mekanis. Manfaat sampingan: suite berhenti bergantung pada sihir "org tertua", dan jalur eksplisit itu persis yang disarankan pesan error kepada pembacanya. Risiko: diff lebar menyentuh fixture yang menjaga hampir semua gate DB.
3. **Penegakan di luar runtime trigger.** Trigger tidak disentuh; asumsi single-org ditegakkan di tempat yang tidak berbenturan dengan fixture multi-org yang sah — assertion `count(*) organizations = 1` terhadap **staging/produksi** (bukan DB test). Ukuran **XS–S**. Kelemahan: tidak memenuhi bunyi harfiah keputusan owner ("trigger gagal keras") — ia memindahkan alarm ke lapisan lain, dan pembuatan org kedua tetap sukses diam-diam sampai check berikutnya jalan.

Rekomendasi: **opsi 2**, karena hanya ia yang benar-benar membuat trigger gagal keras seperti yang diminta, dan biayanya mekanis bukan arsitektural. Opsi 3 layak bila lebar diff di fixture dinilai terlalu berisiko untuk imbalannya.

**Owner memilih opsi 2 (2026-07-22).** Implementasinya di §5.6.

### 5.5 Pesan error yang sudah disepakati (dipakai opsi mana pun)

Pesan harus menyebut sebab **dan** perbaikannya, supaya pembacanya dua tahun lagi tak perlu membaca body trigger:

```
lebih dari satu organisasi terdaftar — penempatan organisasi otomatis untuk user baru
dinonaktifkan. Set raw_app_meta_data.organization_id secara eksplisit saat membuat user.
```

### 5.6 Yang dikirim — migrasi 0083

**Trigger (`create or replace`, bukan `drop`+`create`).** Tiga cabang, nol tebakan:

| Kondisi | Perilaku |
|---|---|
| `raw_app_meta_data.organization_id` ada, org terdaftar | Dipakai apa adanya |
| Key ada, nilainya bukan UUID | `RAISE` (errcode `22023`) |
| Key ada, org tak terdaftar | `RAISE` (errcode `23503`) — **bukan** fallback diam ke org tertua |
| Key absen, jumlah org > 1 | `RAISE` (errcode `P0001`) — guard BL-14 |
| Key absen, jumlah org ≤ 1 | Persis perilaku lama (`order by created_at limit 1`) |

Pemilihan role template dari `role_level` (0015 F-5) tidak berubah dan dikunci ulang oleh tes regresi.

**Kasus NOL org sengaja tidak diubah.** `profiles.organization_id` nullable (`0001:24`), jadi user pertama pada database kosong tetap mendapat profil ber-org NULL seperti hari ini. Gejalanya berbeda ("belum ada org" vs "masuk org yang salah") dan di luar cakupan BL-14 — dibiarkan identik supaya diff ini tetap satu ide.

**Biaya pemanggil, terukur.** 21 file disentuh: prelude fixtures + 18 file contract test + 2 file seed (`seed_dummy.sql`, `seed_staging.sql` — yang terakhir membuat org 2 & 3 sendiri, jadi tanpa perubahan ia gagal total). Seluruhnya mekanis: menambahkan `organization_id` ke `raw_app_meta_data` pada tiap `insert into auth.users`.

**Efek samping yang diinginkan:** suite berhenti bergantung pada sihir "org tertua". Fixture yang dulu menulis `auth.users` lalu memperbaiki org-nya lewat `UPDATE` susulan kini menyatakan org-nya di muka — sehingga tes menguji penempatan, bukan menambalnya.

**Kontrak baru** `supabase/tests/0083_handle_new_user_explicit_org_contract.sql` — `T-BL14-1..8`: guard menolak tebakan; **isi pesan** dikunci (sebab + `raw_app_meta_data.organization_id`, bukan sekadar "ada raise"); penempatan eksplisit menang atas org tertua; org hantu ditolak; nilai non-UUID ditolak; regresi `role_level`; **single-org tanpa key tetap jalan** (diuji dengan menyisakan satu org di dalam transaksi ber-`rollback`); dan ACL + keberadaan trigger `on_auth_user_created` — backstop kalau seseorang menggantinya jadi `DROP … CASCADE`.

### 5.7 Jebakan yang ditemukan saat menjalankan gate — FK cascade ≠ DELETE boleh jalan

Run CI pertama (CircleCI 107): **32 lolos, 1 gagal** — satu-satunya yang merah adalah kontrak baru itu sendiri, di `T-BL14-7`. Seluruh 18 file contract yang disunting **lolos**, jadi migrasi + perubahan pemanggil terbukti benar pada run pertama; yang salah hanya teknik teardown tes barunya.

```
ERROR: score_formula_versions adalah append-only dan tidak dapat dihapus.
CONTEXT: public.tg_block_delete_append_only()
  SQL statement "delete from public.organizations where id <> v_shared"
```

**Akarnya sebuah pemeriksaan pra-coding yang benar tapi tidak cukup.** Sebelum menulis `T-BL14-7` seluruh FK ke `public.organizations` diperiksa dan semuanya `cascade`/`set null` — nol `restrict` — lalu disimpulkan "DELETE aman". Kesimpulan itu meleset: yang memblokir bukan constraint melainkan **trigger `before delete`**. `tg_block_delete_append_only` terpasang di **8 tabel** (0013, 0014, 0020, 0021), beberapa di antaranya target cascade dari `organizations`. Pelajaran yang bisa dipakai ulang: *"boleh di-cascade"* dijawab oleh `pg_constraint`, *"boleh dihapus"* dijawab oleh `pg_constraint` **dan** `pg_trigger`.

Perbaikannya melepas trigger tersebut secara **data-driven** (query `pg_trigger` by `tgfoid`, bukan daftar tabel hardcoded yang basi begitu tabel append-only ke-9 lahir) dan **hanya di dalam transaksi tes**: DDL di Postgres transaksional, jadi `rollback` memasangnya kembali. Aturan append-only bukan yang sedang diuji di blok itu — ia rintangan teardown, dan diperlakukan sebagai rintangan, bukan dilonggarkan secara permanen.

### 5.8 Di luar cakupan

Tiga lubang kegagalan-diam di Edge Function `create-user` (`supabase/functions/create-user/index.ts`) **tidak** termasuk BL-14; dilacak terpisah sebagai bugfix biasa — PR #148.

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

Coverage di `mobile/src/lib/__tests__/activity-governance.test.ts`: 11 tipe DB dicek punya label non-`snake_case`, plus kasus fallback, input kosong, dan trim. Daftar 11 tipe itu **tidak lagi hardcoded** — ia keluaran parser migrasi sejak BL-13.

~~**Utang yang tersisa.** Peta ini duplikasi manual dari literal yang tersebar di body PL/pgSQL, tanpa gate sinkronisasi~~ ✅ **ditutup lewat BL-13** (PR #145): peta tetap salinan manual, tapi kini ada gate CI yang memerah begitu ia menyimpang dari migrasi.

## BL-13 — Sumber kebenaran untuk violation type

**Gap.** Tidak ada satu tempat pun yang mendefinisikan himpunan `violation_type` yang sah. Nilai itu hidup sebagai string literal yang tersebar di body fungsi PL/pgSQL lintas 11 migrasi, dan `GOVERNANCE_VIOLATION_TYPE_LABEL` di client adalah salinan manual hasil penelusuran (lihat BL-12). Tidak ada CHECK constraint, tabel lookup, maupun test yang menegakkan agar keduanya sinkron.

**Kegagalan yang diprediksi.** Migrasi yang memperkenalkan `violation_type` baru — atau salah ketik nama tipe yang sudah ada — lolos seluruh gate CI:

- Kolom `text` bebas menerima nilai apa pun, jadi tidak ada error di sisi DB.
- DB contract tests tidak mengenumerasi tipe, jadi tidak ada test yang merah.
- Jest client tidak melihat migrasi, jadi peta label tidak diketahui tertinggal.

Akibatnya baru terlihat di produksi: halaman Governance Violation menampilkan `snake_case` mentah untuk tipe itu. Fallback BL-12 menahan kerusakannya (halaman tetap terbaca, tidak pernah kosong), jadi ini **degradasi diam-diam**, bukan kegagalan yang berisik — tidak ada yang memberi tahu sampai seseorang kebetulan membuka halaman dan menyadarinya.

Salah ketik lebih buruk lagi: `self_aproval_attempt` menjadi tipe baru yang sah secara diam-diam, memecah baris audit yang seharusnya menyatu — dan tidak ada gate yang menangkapnya.

**Keputusan (2026-07-22, PR #145): opsi 3 — gate CI, nol perubahan schema.**

Tiga opsi yang ditimbang:

1. **CHECK constraint** di `governance_violations.violation_type`. Menolak tipe tak dikenal pada waktu tulis. Tapi menambah tipe jadi butuh migrasi ALTER, dan baris lama dengan tipe yang sudah tidak dipakai harus tetap lolos constraint.
2. **Tabel lookup** `governance_violation_types` + FK. Menjadikan himpunan tipe sebagai data yang bisa di-query. Mahal: tabel + seed + RLS + FK di tabel yang append-only dan panas.
3. **Gate CI saja.** Test jest mem-parse `supabase/migrations/*.sql`, mengekstrak tiap `violation_type` yang bisa di-emit, lalu menuntut tiap tipe punya entri di `GOVERNANCE_VIOLATION_TYPE_LABEL`.

**Kenapa opsi 3 menang.** Kriteria yang dipakai halaman ini sendiri adalah *drift harus dapat diuji, bukan sekadar dilarang*. Opsi 3 memenuhinya sepenuhnya — dan lebih baik daripada opsi 2 pada kriteria itu:

- Opsi 2 mem-verifikasi peta label terhadap **isi tabel seed**, yang tetap salinan manual dari literal di body PL/pgSQL. Migrasi yang menambah emitter tanpa menambah baris seed lolos: kolom `text`-nya sudah diganti FK, jadi INSERT-nya gagal saat runtime — kegagalan **produksi**, bukan CI, dan pada tabel best-effort yang beberapa emitter-nya berada di jalur `raise exception` (kegagalan tulis governance bisa menelan pesan penolakan yang sebenarnya). Opsi 3 mem-verifikasi terhadap **kode emitter itu sendiri**, jadi sumber kebenarannya adalah tempat nilainya benar-benar lahir.
- Opsi 1 tidak membuat client ikut tahu sama sekali — ia hanya melarang.
- Ongkos: opsi 3 = 2 file test-only, nol migrasi, nol RLS, nol FK pada tabel panas. Menambah tipe baru = **satu edit** (entri peta label). Opsi 1 = ALTER per tipe; opsi 2 = tabel + seed + RLS + FK.
- Risiko utama opsi 3 (parser) diuji langsung, bukan diasumsikan — lihat di bawah.

**Yang ditutup gate ini.** `mobile/src/test-support/governance-violation-types.ts` (parser) + `mobile/src/lib/__tests__/governance-violation-types.contract.test.ts` (6 assertion). Parser membaca **kedua** jalur emisi; menangkap satu saja menghasilkan gate hijau yang buta separuh permukaan:

| Jalur | Bentuk | Site literal |
|---|---|---|
| A | `insert into public.governance_violations (…) values (…)` di body fungsi | 21 |
| B | `perform public.log_governance_violation(uid, '<tipe>', …)` (helper 0019) | 14 |

Hasil: **tepat 11 tipe**, cocok dengan hitungan audit BL-12 — jadi parser direkonsiliasi, bukan dipercaya begitu saja.

Assertion sengaja **tidak** menulis ulang daftar 11 tipe (itu akan jadi salinan manual ketiga). Yang dijaga: kedua jalur masih menemukan site (lantai per jalur), ≥11 tipe, tiap tipe ter-emit punya label, tiap label punya emitter, dan tiap ekspresi non-literal sudah ditinjau. Daftar hardcoded di test BL-12 diganti keluaran parser → **peta label adalah satu-satunya salinan manual yang tersisa**.

**Site non-literal.** Emitter dinamis (`v_type`, `case … end`) tak bisa diketahui statis. Ia **memerahkan** `[BL13-6]` supaya ditinjau manusia, bukan dilewati diam-diam — persis mode kegagalan yang jadi keluhan BL-13. Satu-satunya yang di-allowlist hari ini: `p_violation_type` di body helper `log_governance_violation()` (nilainya datang dari pemanggil, yang sudah diparse lewat jalur B).

**`minimum_breakdown_not_met`** tetap dipetakan tapi dikecualikan lewat `KNOWN_UNEMITTED`: ia hanya muncul di `supabase/tests/fase5_minimum_breakdown_rules_contract.wip.sql`, tak ada fungsi yang menulisnya (0011 hanya `RAISE` pada gate-block). Dipertahankan sebagai pertahanan untuk baris lama; label yatim **lain** tetap memerahkan `[BL13-5]`.

**Pembuktian gate.** Empat skenario drift disuntik ke salinan scratch lalu dicabut — semuanya merah pada assertion yang tepat: tipe palsu lewat jalur A → `[BL13-4]`; tipe palsu lewat jalur B → `[BL13-4]`; emitter dinamis → `[BL13-6]`; label yatim di client → `[BL13-5]`.

**Batas yang diterima.** Gate ini menjaga sinkronisasi migrasi↔client, bukan integritas data di DB — nilai sampah yang ditulis di luar migrasi (psql manual, RPC baru yang belum di-commit) tetap masuk. Kalau audit suatu saat menuntut himpunan tipe yang *enumerable dari DB*, opsi 2 kembali ke meja; sampai saat itu ia membeli kepastian yang tidak dibutuhkan siapa pun dengan harga FK di tabel append-only yang panas.

## BL-15 — Koreksi org di `create-user`: dari senyap jadi terlihat pemanggil

**Asal.** Turunan langsung investigasi BL-14 (#146). Investigasi itu memperkecil taksiran risiko trigger — tidak ada signup publik, dan `create-user` mengoreksi org-nya sendiri — tapi menemukan bahwa koreksi tersebut **best-effort dan senyap saat gagal**. Tiga cabang berakhir sama: user mendarat di org warisan trigger (org tertua), API menjawab 200, pemanggil tidak diberi tahu apa pun.

**Kenapa itu kelas kegagalan yang mahal.** Gejala salah-org bukan error melainkan **workspace kosong akibat RLS**. Admin yang membuat user melihat "User dibuat", user yang login melihat halaman kosong, dan tiketnya akan masuk sebagai bug permission. Log server memuat penyebabnya, tapi log tidak sampai ke UI — itu persis definisi kegagalan diam.

**Bentuk perbaikan: sukses + `warning`, bukan error.** Kedua opsi dipertimbangkan dan yang ini menang:

- **Menggagalkan request ditolak.** Di titik koreksi, row `auth.users` sudah terlanjur ada. Menjawab 5xx menghasilkan akun hantu — ada di DB, tidak terlihat oleh admin, dan retry-nya pasti mentok `409 email_exists` tanpa jalan maju. Kompensasi (`admin.deleteUser`) berarti menghapus akun yang sebenarnya valid dan bisa login demi kegagalan sekunder, dan penghapusan itu punya mode gagalnya sendiri yang lebih buruk.
- **Sukses + `warning` dipilih.** Akunnya nyata dan berfungsi; yang gagal hanya penempatannya, dan itu bisa dibetulkan manual lewat User & Permission. Syaratnya field itu **wajib dipakai pemanggil** — kalau tidak, ia cuma versi lain dari log yang tak terlihat.

**Kontrak respons.** `200 { user_id, requestId, warning }` dengan `warning: null` pada jalur benar, atau `{ code, message }` dengan `code` ∈ `actor_org_missing` | `role_template_missing` | `profile_role_pin_failed`. `message` adalah copy Indonesia terkurasi (WSA-18: user tidak melihat detail teknis); `code` untuk diagnosa. Semua `log()` yang ada dipertahankan — perbaikan ini soal **respons**, bukan pengganti log.

**Jalur `role_template_missing` sengaja tidak menulis `organization_id` sendirian.** Menggeser org tanpa role-nya menghasilkan profil yang `role_template_id`-nya milik org lain — inkonsistensi silang-org yang lebih sulit didiagnosis daripada dibiarkan utuh lalu dilaporkan. Update-nya tetap atomik: dua kolom atau tidak sama sekali.

**Rantai pemanggil ditutup sampai ke layar**, karena field respons yang ditelan call-site tidak menutup apa pun: `createOrgUser` menormalisasi `warning` (bentuk asing → `null`, `message` kosong → fallback ramah), dan `settings-user-new.tsx` merender hasil ber-warning sebagai **hasil yang berbeda** — judul Alert "User dibuat — perlu diperiksa" + banner inline persisten + **tidak** `router.back()`, mengikuti pola yang sudah dipakai jalur error di layar itu.

> [!warning] Yang TIDAK ditutup di sini (saat ditulis)
> Trigger `handle_new_user` tidak disentuh oleh perubahan BL-15 ini — perbaikannya sendiri dikirim terpisah dan sudah **DONE**: **BL-14, PR #147, migrasi 0083**. Guard-nya berlaku di level trigger, jadi otomatis mencakup jalur pembuatan user **di luar aplikasi** juga ("Add user" dashboard Supabase, admin API langsung, INSERT manual ke `auth.users`) — bukan hanya `create-user`.

**Deploy.** Edge Function tidak ikut ter-deploy oleh merge — ia butuh langkah sendiri. Di-deploy ke project staging `fhnqwytqprsptjshoxfn` pada **2026-07-22**, `create-user` **v1 → v2**, status ACTIVE, `verify_jwt` tetap `true`. Sumber terpasang diverifikasi identik dengan file repo, dan v1 yang ditimpa terverifikasi identik dengan `origin/staging` (tidak ada drift yang tertimpa diam-diam).

**Jalurnya bukan `supabase link`.** CLI `link` menuntut access token + prompt interaktif yang tidak tersedia di sesi headless. Supabase MCP menembak project yang sama (`deploy_edge_function`) dan tidak butuh link sama sekali — itu jalur deploy yang dipakai. Lihat [[add-user-edge-function]].

**Urutan merge/deploy tidak punya jendela rusak** ke arah mana pun: server baru mengirim `warning: null` pada jalur benar sehingga client lama mengabaikannya, dan server lama tidak mengirim `warning` sehingga `readWarning` mengembalikan `null`.

---

## Referensi

- [[audit-governance]] — model Activity Log & Governance Violation append-only, arti severity.
- [[ui-prototype-gap]] — backlog UI ber-ID dari perbandingan prototype (terpisah dari halaman ini).
- [[ws-04-governance-debt]] — governance debt lain yang sengaja ditunda, dengan sinyal re-open eksplisit.
