---
type: concept
tags: [backlog, gap-analysis, prd-conformance, triage]
updated: 2026-07-23
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
| **BL-06** | Task Repeat | ~~Field **"Zona waktu" §23** (item 5 dari 10) hilang … **Butuh migrasi** + ubah logika deadline~~ ✅ **SELESAI 2026-07-22 — nol migrasi.** Ukuran **dikoreksi S→M ⇒ XS**: ukuran lama mengasumsikan field ini adalah **override per-rule**, padahal PRD tak pernah memberinya semantik itu. Bukti: kata "zona waktu"/"timezone" muncul **tepat sekali** di seluruh PRD.md (baris 966), sebagai nama field telanjang di daftar §23 — nol kalimat normatif di §7/§28/bagian deadline & cron. Daftar §23 itu sendiri mencampur input dan **tampilan** (item 7–10 = Expected/Completed/Missed instances + Repeat Compliance, semuanya turunan read-only), jadi item 5 sebagai tampilan konsisten dengan idiom daftarnya sendiri. Zona waktu tetap properti **organisasi**: `organizations.timezone` (0007, default `Asia/Jakarta`) + helper `public.org_today(p_org)` (0008:21). Dikirim sebagai keterangan read-only di `repeat-config` (`task/new.tsx`) + `lib/org-timezone.ts`; dikunci tes `[1..7]` + `[10..12]`. Rinci §BL-06 di bawah | ~~S→M~~ **XS** | ✅ DONE |
| **BL-07** | Notifications | ~~§28 mendefinisikan **9** tipe, 5 sudah jalan; absen: Bukti dikirim, Deadline lewat one-time, Permission berubah, MBR warning~~ ✅ **SELESAI 2026-07-22 — migrasi 0084.** Di-scoping lebih dulu (§6) dan ukurannya **salah**: dari 4 gap, satu (**MBR warning**) ternyata **bukan gap notifikasi** — §28 item 7 kondisi sinkron yang sudah digerbangi `check_minimum_breakdown_compliance`, ditutup sebagai koreksi PRD (D-BL07-3); satu (**Deadline lewat**) gap **state machine**, bukan emitter — `tasks.status` tak punya `missed`/`overdue`, dikirim sebagai notifikasi murni dengan status TIDAK disentuh (D-BL07-2); **Bukti dikirim** bertumpuk dengan `review_request` sehingga dibatasi ke jalur `review_required = false` yang selama ini **nol notifikasi** (D-BL07-1); **Permission berubah** memang mekanis. 3 tipe baru (`evidence_submitted`, `deadline_overdue`, `permission_changed`), CHECK jadi 17. Diverifikasi terhadap **DB sungguhan** (lokal): `T-BL07-1..8` 8/8 + 133 suite mobile hijau. Push sengaja tak disentuh — 0081 belum mendarat di staging. Rinci §6 | ~~M~~ **S (3 tipe, 1 migrasi)** | ✅ DONE |
| **BL-08** | Review | ~~**Aksi "Catatan" §24.3 hilang**~~ ✅ **SELESAI 2026-07-20 — nol migrasi**. Temuan RPC hard-reject **benar** (`0046:1976` + `0046:2051`) tapi hanya mengikat bila Catatan = nilai `decision` ketiga. PRD §24.3 tidak menyatakan semantiknya; **owner memutuskan NON-TERMINAL** → Catatan tidak memutuskan apa pun, jadi tidak pernah masuk jalur RPC review dan tidak menyentuh CHECK mana pun. Implementasi: `lib/inbox.ts::postReviewNote` (room Rencana Aksi → `send_chat_message` ber-konteks Tugas) + mode ketiga di `review-submission-panel.tsx`. Submission tetap `pending`. **Sisa ter-defer:** entri Activity Log — `write_activity` dicabut dari `authenticated` (`0062:57`) → butuh RPC SECURITY DEFINER baru (0083+). Rinci di branch `claude/pensive-goodall-42169f`: `ui-prototype-gap.md` §2.2 + item UI-G-016 (belum ada di tree ini; masuk saat merge) | XS→S | ✅ |
| **BL-09** | Archive | ~~**Pecah 3, satu klaim gugur**~~ ✅ **DONE 2026-07-22 — BL-09 tertutup seluruhnya**. (a) ❌ **gugur** — `includeArchived` sudah di-pass (`settings-archive.tsx:32`); ~~(b) row tanpa `onPress`~~ ✅ **PR #144, nol migrasi** — pola `search.tsx` dipakai ulang (`ENTITY_ROUTE_SEGMENT` + fallback `undefined` → kartu tetap non-pressable, bukan push path rusak), `SectionCard` dapat prop `accessibilityLabel` opsional (DESIGN §4.4) **dan slot `actions`** — kontrol tak lagi bersarang di dalam region pressable (`Pressable` RN default `accessible={true}` ⇒ tombol bersarang tak bisa difokus VoiceOver; kegagalan diam yang lolos QA visual). 2 dari 10 kartu pressable di `src/` terdampak, keduanya dipindah; aturan didaftarkan di **DESIGN §4 aturan 6**. Dikunci `[F8-UI-29]`/`[F8-UI-30]`/`[F8-UI-31]` + `[UI-SC-1..5]`; ~~(c) invalidate key salah~~ ✅ **SELESAI 2026-07-20** — `['search']` → `['cards_search']`, dikunci tes `[F8-UI-28]` | (b) S | ✅ |
| **BL-10** | Search | **DIPECAH jadi BL-10a..BL-10d** setelah spec + rencana TDD (§7). Temuan aslinya tetap berlaku: 7 dari 14 scope §38 hilang dan hasil tanpa grouping | L | 🔀 dipecah |
| **BL-10a** | Search | ~~RPC `search_global` + 9 scope (7 card + chat delegasi) + grouping + paging keyset per grup + anti-oracle~~ ✅ **SELESAI 2026-07-23 — migrasi 0085.** Layar ditulis ulang jadi `SectionList`. Menemukan sekaligus mengunci bug pola LIKE tanpa escaping di `search_cards` (0046:2120) sebagai perbedaan yang **disengaja** (NG-6, `DB-73`) | L | ✅ DONE |
| **BL-10b** | Search | ~~Scope **People**~~ ✅ **SELESAI 2026-07-23 — migrasi 0086.** Gate tersederhana (satu-org ATAU diri sendiri, tanpa permission gate). Menutup utang FR-8.5.3 Fase 8. Match pada `full_name` + `position_title`; **`email` sengaja BUKAN field match dan tidak diproyeksikan** (§6.3) — dikunci `DB-78`, diverifikasi merah saat email ditambahkan sebagai field match. Hasil de-scored: nama + jabatan saja | S | ✅ DONE |
| **BL-10c** | Search | ~~Scope turunan: `task_instance`, `comment`, `evidence`~~ ✅ **SELESAI 2026-07-23 — migrasi 0087.** **BL10-OQ-03 disahkan owner**: bukti `draft` hanya tercari oleh pengunggahnya (`status <> 'draft' OR submitted_by = auth.uid()`) — penyempitan sengaja atas `evidence_select`, diuji **simetris dua arah** (`DB-93/94/95`) dan diverifikasi merah saat klausanya dicabut. `storage_path`/`url` tidak diproyeksikan **dan** tidak tercari (`DB-91/92`). Komentar memakai **dispatch literal statis** §6.4 termasuk literal warisan pra-0045, bukan `map_legacy_entity_type` (dikunci `DB-88`) | M | ✅ DONE |
| **BL-10d** | Search | ~~Scope audit: `activity_log`, `governance_violation`~~ ✅ **SELESAI 2026-07-23 — migrasi 0088. PRD §38 lengkap 14/14.** **BL10-OQ-05 terjawab**: dicocokkan lewat **nama entitas induk**, bukan `action`/`violation_type` — data nyata menunjukkan 733 baris log hanya punya 11 action unik dengan `create` 73%, jadi mencocokkan action berarti nol hasil (snake_case) atau dump tiga perempat log. Entitas diresolusi lewat **identitas** (`entity_id` UUID → 7 LEFT JOIN), bukan label, karena `entity_type` ambigu untuk gating. Efeknya FR-11 fail-closed jadi **struktural**. Batas yang disengaja: cabang self-row FR-10 ikut ter-gate entitas agar nama entitas tidak bocor — Search **bukan** pengganti `/settings-activity-log` (§6.3.1) | M | ✅ DONE |
| **BL-11** | Header | ~~Ikon Notifications §7.2 hilang~~ ✅ **SELESAI** — merged #115 (UI-G-016); `notifications-outline` + badge unread via `useUnreadCount()`, badge disembunyikan saat loading/error (bukan fail-silent ke "0"), jumlah masuk `accessibilityLabel` | XS | ✅ DONE |
| **BL-12** | Governance Violation | ~~Raw snake_case di `settings-governance-violation.tsx`~~ ✅ **SELESAI** — merged #117; `GOVERNANCE_VIOLATION_TYPE_LABEL` + `governanceViolationTypeLabel()` dgn fallback nilai mentah. Verifikasi independen saya mencocokkan hitungan **11 tipe** yang bisa di-emit. Detail §BL-12 di bawah | XS | ✅ DONE |
| **BL-13** | Governance Violation | ~~**Tidak ada sumber kebenaran `violation_type`**~~ ✅ **SELESAI 2026-07-22 — PR #145, nol migrasi**. Ditutup lewat **opsi 3 (gate CI, tanpa perubahan schema)**, bukan CHECK constraint maupun tabel lookup: jest mem-parse `supabase/migrations/*.sql` (kedua jalur emisi — `insert into governance_violations` langsung **dan** pemanggilan `log_governance_violation()`) lalu menuntut tiap tipe ter-emit punya entri di `GOVERNANCE_VIOLATION_TYPE_LABEL`. Parser menemukan **tepat 11 tipe** — cocok dengan audit BL-12. Peta label kini **satu-satunya** salinan manual: daftar hardcoded di test BL-12 diganti keluaran parser. Dikunci `[BL13-1..6]`. Alasan penolakan opsi 1/2 di §BL-13 | butuh scoping → XS | ✅ DONE |
| **BL-14** | Onboarding / org | **`handle_new_user` menaruh SETIAP user baru di org TERTUA** (`select id from public.organizations order by created_at limit 1`; definisi hidup ada di **migrasi 0015**, bukan 0001). Selama hanya ada satu org perilakunya benar; begitu ada lebih dari satu, user baru diam-diam masuk org yang salah — nol error, hanya workspace kosong karena RLS. ✅ **SELESAI 2026-07-22 — PR #147, migrasi 0083 (opsi 2).** Keputusan produk: V1 dikunci single-org, trigger harus gagal keras. Bentuk pertama (`RAISE` polos bila `count(*) organizations > 1`) **dihentikan sebelum ditulis** — ia mematikan seluruh gate DB contract test, sebab `supabase/tests/_fixtures.sql` sendiri membuat **2 org** lalu menyisipkan `auth.users`. Yang dikirim: jalur penempatan **eksplisit** `raw_app_meta_data.organization_id` (service-role only, pola sama seperti `role_level` 0015), `RAISE` hanya bila key absen **dan** org > 1; single-org tanpa key tetap jalan persis seperti dulu. 21 file pemanggil disetel eksplisit (prelude + 18 contract test + 2 seed). Dikunci `T-BL14-1..8`. Rinci §5 | M | ✅ DONE |
| **BL-15** | Onboarding / org | ~~**Koreksi org di `create-user` gagal senyap**~~ ✅ **SELESAI** — turunan investigasi BL-14 (#146). Tiga cabang di Edge Function `create-user` melewati/menggagalkan koreksi `organization_id` lalu tetap menjawab HTTP 200 tanpa penanda apa pun: lookup profil actor null, `role_templates` tak ketemu, dan `profileError` yang cuma di-log. Respons kini membawa field `warning` eksplisit dan UI Tambah User menampilkannya sebagai hasil berbeda dari sukses. Detail §BL-15 di bawah. **Tidak** menyentuh trigger `handle_new_user` — perbaikan trigger dikirim terpisah, lihat BL-14 (✅ DONE, PR #147) | S | ✅ DONE |
| **BL-16** | Search / paging | ~~**Cursor separuh diterima `search_global`**~~ ✅ **SELESAI 2026-07-23 — PR #165, migrasi 0089.** Guard FR-19 hanya menuntut `p_scopes` berisi tepat satu scope, tidak menuntut kedua bagian cursor ada. Karena Postgres membandingkan tuple **short-circuit**, `p_cursor_id` NULL baru terasa saat `created_at` persis **tie** dengan cursor — di sana `id < NULL` → NULL dan seluruh baris tie gugur **tanpa error**. Cakupan sebenarnya **hanya kasus tie**; kritik §9.1 Missing #4 `specs/bl-10-pr1-tdd-plan.md` yang menyebut "semua baris hilang" **berlebihan** dan dikoreksi di sini. Klien tak pernah menghasilkannya (`useSearchScopePage` mengirim cursor sebagai objek `{ts,id}`) — hanya terjangkau lewat panggilan API tangan. Diperbaiki karena **gejalanya kehilangan data tanpa error**, bukan karena jangkauannya. Cursor kini sah hanya bila kedua bagian terisi atau keduanya NULL; errcode `22023` + pesan **statis** (FR-13). Guard di kepala fungsi, bukan per cabang, agar cabang ke-15 ikut terlindungi. Dikunci `DB-96..DB-101`, diverifikasi merah lebih dulu. Detail §BL-16 di bawah | XS | ✅ DONE |
| **BL-17** | Search / audit | ~~**Subtitle scope audit menampilkan `action` mentah snake_case**~~ ✅ **SELESAI 2026-07-23 — PR #166, nol migrasi**. `ACTIVITY_LOG_ACTION_LABEL` + `activityLogActionLabel()` di `activity-governance.ts`, bersebelahan dengan peta BL-12, fallback identik (dikenal → label; tak dikenal → nilai mentah; kosong → `—`). Peta lokal duplikat di `settings-activity-log.tsx` **dihapus** — satu peta melayani dua layar. **Gate CI BL-13 DIPERLUAS** ke `action` (keputusan + alasan di §BL-17); ia langsung membayar dirinya: peta warisan ternyata sudah kehilangan **5** action ter-emit dan menyimpan **1** label yatim. Dikunci `[BL17-1..7]` + `[BL17-UI-1..3]` | XS | ✅ DONE |
| **BL-18** | Search / governance | **Kontrol kompensasi `BL10-OQ-09` bukan "separuh tertutup" — penghitungnya tidak pernah keluar dari perangkat.** Diagnosis awal ("tidak ada ambang/alerting/pembaca") kurang satu tingkat. Terverifikasi: peristiwa FR-34 ditulis pada level `info`, dan satu-satunya transport terpusat (`createSentryTransport`) hanya meneruskan `error`+`warn` — dikunci tesnya sendiri. Jadi ia berakhir di `console.log` perangkat pemakai. Lebih menentukan lagi: `search_global` di-`grant … to authenticated`, sehingga penambang data dapat memanggil RPC langsung lewat PostgREST tanpa menjalankan kode klien — telemetri yang diemisikan klien **tidak dapat** menjadi kontrol terhadap klien. Karena itu **ambang tidak boleh ditentukan lebih dulu**: berapa pun angkanya, ia tidak mengikat. ⏳ **Scoping selesai 2026-07-23 (PR #167) — menunggu keputusan owner** atas 4 opsi di §BL-18 (rekomendasi: opsi 3, baca jejak yang sudah dicatat Postgres; nol sentuhan G6). Opsi 4 (cabut klaim palsu di komentar `search.ts`) **sudah dikerjakan** karena benar di bawah semua opsi | S → butuh keputusan | ⏳ menunggu owner |

---

## 2. Triage (pasca-verifikasi)

> [!note] Sisa pekerjaan per 2026-07-23: **satu item** — BL-18
> Seluruh BL-01..BL-15 tertutup; PRD §38 lengkap 14/14 lewat migrasi 0085-0088. ~~BL-16~~ ✅ **selesai 2026-07-23 (PR #165, migrasi 0089)**; ~~BL-17~~ ✅ **selesai 2026-07-23 (PR #166, nol migrasi)**. Yang tersisa **BL-18**, dan ketiganya lahir dari menyisir sisa utang BL-10 secara sengaja — bukan dari audit baru.
>
> Ketiganya **sempat masuk kategori "ditunda demi menghindari overengineering"**, lalu dinilai ulang dan ternyata tidak semuanya pantas di situ. Yang membedakannya dari penundaan yang memang aman (`BL10-OQ-12` realtime non-chat, `BL10-OQ-10` dua semantik People, `BL10-OQ-07` kebisingan instance, `NG-13` tanpa index trigram): ketiga ini punya **konsekuensi yang tidak akan dilaporkan siapa pun** — kehilangan data senyap, teks mentah ke pengguna, dan kontrol yang tidak dibaca.
>
> Prioritas: **BL-16 lebih dulu** — gejalanya baris hilang tanpa error, jadi tidak ada yang akan melaporkannya. ✅ **Dikerjakan pertama dan sudah tutup** (PR #165), disusul **BL-17** (PR #166); sisa antrean **BL-18**.

**XS murni — nol migrasi, nol keputusan produk:**
~~BL-09(c) invalidate key~~ ✅ **selesai 2026-07-20**; ~~BL-12 label map~~ ✅ (#117); ~~BL-11 ikon header~~ ✅ (#115); ~~BL-01 `rank_number`~~ ✅ **selesai 2026-07-20 (#116)**. ~~BL-06 zona waktu~~ ✅ **selesai 2026-07-22** (pindah dari bucket "butuh migrasi" setelah interpretasinya disetel — lihat §BL-06). **Bucket ini kosong.**

**S — satu layar + test, nol migrasi:**
~~BL-02~~ ✅ **selesai 2026-07-22 (#140)**; ~~BL-05~~ ✅ **selesai 2026-07-21 (PR #138)**; ~~BL-09(b)~~ ✅ **selesai 2026-07-22 (#144)**. **Bucket ini kosong.**

**Butuh migrasi DB** (jadi bukan tiket sepele sekalipun UI-nya kecil):
~~BL-06 (kolom timezone di `task_repeat_rules` + ubah semua perhitungan deadline yang kini membaca `organizations.timezone`)~~ ✅ **dicabut dari bucket ini 2026-07-22** — biaya migrasinya seluruhnya berasal dari asumsi override per-rule yang tidak pernah diminta PRD. **Bucket ini kosong.**

> [!warning] BL-08 sudah **keluar** dari daftar ini
> Rekomendasi awal "longgarkan CHECK `p_decision` di 2 RPC" **jangan dieksekusi** — ia mengasumsikan Catatan sebagai keputusan review ketiga, sedangkan owner memutuskan non-terminal. Melonggarkan CHECK `decision` sekarang akan menambah nilai yang tidak dipakai siapa pun sekaligus melemahkan invariant state machine review. Yang tersisa dari BL-08 hanyalah entri Activity Log (RPC SECURITY DEFINER baru, **bukan** perubahan CHECK) — rinci di branch `claude/pensive-goodall-42169f`, `ui-prototype-gap.md` §2.2.

**Butuh scoping/spec dulu:**
~~BL-13~~ ✅ **terjawab + selesai 2026-07-22 (PR #145)** — scoping menghasilkan **opsi ketiga** yang tidak ada di daftar awal (gate CI tanpa perubahan schema) dan mendominasi kedua opsi schema pada kriteria halaman ini sendiri. Pelajaran: dua opsi yang tercatat keduanya berupa perubahan DB karena gap-nya *dibingkai* sebagai gap schema; begitu dibingkai ulang sebagai "drift antara dua artefak yang bisa dibaca CI", ongkosnya turun dari migrasi+RLS+FK menjadi dua file test. ~~BL-04~~ ✅ **terjawab + selesai** — owner memutuskan cascade satu tingkat (dicatat di PR #139, yang **ditutup tanpa merge 2026-07-22**; konten keputusannya sudah mendarat lewat #141 + migrasi 0082), dan implementasinya menyingkap bahwa sisanya bukan keputusan produk melainkan drift data (§4). ~~BL-07 (4 emitter server-side baru + migrasi CHECK constraint)~~ ✅ **terjawab + selesai 2026-07-22 (migrasi 0084)** — scoping menunjukkan pembingkaian awalnya salah di dua arah sekaligus: satu dari empat gap ternyata **bukan gap** (MBR warning = kondisi sinkron yang sudah digerbangi, ditutup sebagai koreksi PRD) dan satu lagi **bukan gap emitter melainkan gap state machine** (`tasks.status` tak punya `missed`/`overdue`). Pelajaran sejenis BL-13/BL-14: yang menentukan ukuran bukan jumlah item yang tertulis, melainkan apakah tiap item benar-benar berbentuk seperti yang diasumsikan barisnya. BL-10 (spec sendiri; 7 sumber data + rewrite list jadi grouped), ~~**BL-14**~~ ✅ **terjawab + selesai 2026-07-22 (PR #147, migrasi 0083)** — keputusan produk turun (single-org dikunci untuk V1), lalu scoping bergeser dari "apa keputusannya" ke "**di mana** penegakannya ditaruh" karena guard runtime bentuk polos memerahkan seluruh gate DB contract test. Owner memilih opsi 2: jalur org eksplisit + `RAISE` sebagai fallback. Pelajaran sejenis BL-13: bentuk pertama yang diminta adalah satu-satunya yang tak bisa dikirim, dan itu baru terlihat setelah **fixture** dibaca — bukan setelah trigger-nya dibaca. Rinci di §5.

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

## 6. BL-07 — Notifications: scoping, dan kenapa "4 emitter + satu CHECK" salah ukur

Scoping 2026-07-22, seluruhnya diverifikasi terhadap `supabase/migrations/*` + DB **staging** (bukan dari log). Kesimpulan pendek: dari 4 gap yang tercatat, **satu bukan gap notifikasi sama sekali**, **satu jauh lebih besar dari yang tertulis**, dan **dua memang mekanis**. Ukuran M dipertahankan hanya bila keputusan owner memecahnya; sebagai satu paket ia **L**.

### 6.1 Peta §28 → implementasi (9 tipe)

| # | PRD §28 | Tipe DB | Emitter | Status |
|---|---|---|---|---|
| 1 | Review diperlukan | `review_request` | `submit_task` `0072:116`, `submit_task_instance` `0046:2493` | ✅ |
| 2 | **Bukti dikirim** | — | — | ❌ lihat §6.2 |
| 3 | Deadline change request | `deadline_change_requested` | DCR 0014/0038 | ✅ |
| 4 | **Deadline lewat** | `instance_missed` **repeat saja** | `0046:1787` | ⚠️ separuh — §6.3 |
| 5 | Mention | `mention` | 0008 | ✅ |
| 6 | **Permission berubah** | — | — | ❌ §6.4 |
| 7 | **Aturan Pecah Target warning** | — | — | ❓ §6.5 |
| 8 | Warning governance (admin) | `governance_warning` | `log_governance_violation` | ✅ |
| 9 | Repeat due today | `repeat_due` | `0046:1143` | ✅ |

### 6.2 "Bukti dikirim" — satu peristiwa, dua nama, dan satu lubang nyata

`review_request` dikirim **ke reviewer, saat submit, dengan actor = PIC** (`0072:116`). Itu persis peristiwa "Bukti dikirim"; dua baris PRD menamai satu kejadian. Menambahkan tipe kedua di titik yang sama = reviewer ternotifikasi **dua kali** untuk satu submit.

Tapi ada lubang sungguhan di sebelahnya: emitter itu ber-gate `if a.review_required and a.reviewer_id is not null`. Saat `review_required = false`, submission langsung `done` (`0007:429-438`) dan **nol notifikasi terkirim ke siapa pun** — bukti masuk, tidak ada yang tahu. Itu slot yang tidak tumpang-tindih untuk "Bukti dikirim", dan bacaan ini membuat kedua baris PRD punya isi masing-masing tanpa duplikasi.

> **Keputusan owner diperlukan (D-BL07-1).** Siapa penerima "Bukti dikirim"? (a) hanya saat `review_required = false`, ke atasan/pembuat card; (b) selalu, ke PIC sendiri sebagai konfirmasi kirim; (c) tidak ada tipe baru — §28 item 2 dinyatakan sebagai nama lain item 1, ditutup sebagai koreksi PRD seperti BL-03. Rekomendasi: **(a)** — satu-satunya bacaan yang menutup lubang nyata alih-alih menambah bunyi.

### 6.3 "Deadline lewat" one-time — ini gap **state machine**, bukan gap emitter

Ini yang salah ukur di baris backlog. Task one-time **sudah** dapat `deadline_reminder` untuk deadline *mendekat* (`0046:1120-1130`, ≤3 hari, penerima PIC). Yang tidak ada adalah keadaan **lewat** — dan sebabnya bukan emitter yang lupa ditulis:

`tasks.status` (CHECK live di staging) = `draft · assigned · in_progress · submitted · done · revision · archived · cancelled` — **tidak ada** `missed`/`overdue`. Bandingkan `task_instances`, yang punya `missed` dan disapu `mark_overdue_instances`. Jadi task one-time secara struktural tidak bisa "lewat"; tidak ada state untuk dinotifikasikan.

Konsekuensinya menjalar: menambah state terminal/penanda baru pada `tasks` menyentuh CHECK constraint, sapuan cron baru, dan **berpotensi skoring** (apakah task one-time yang lewat menurunkan Achievement Score seperti `missed_count` repeat?). Itu bukan "satu emitter".

> **Keputusan owner diperlukan (D-BL07-2).** (a) Notifikasi murni — kirim `deadline_overdue` ke PIC dari sapuan cron tanpa mengubah `tasks.status` sama sekali (status tetap `assigned`/`in_progress`; "lewat" jadi fakta turunan dari `deadline < org_today()`); (b) state penuh — tambah nilai status baru + sapuan + putuskan dampak skoring. Rekomendasi: **(a)** — memenuhi bunyi §28 ("Deadline lewat" adalah *jenis notifikasi*, bukan *status kartu*) dengan nol perubahan state machine dan nol risiko skoring. (b) adalah spec tersendiri bila memang diinginkan.

### 6.4 "Permission berubah" — paling mekanis dari keempatnya

`set_user_permission` versi hidup (`0076`) tidak mengirim apa pun. Penerima tidak ambigu: user yang izinnya berubah. PRD membatasi *"jika relevan untuk user tersebut"* — terpenuhi secara alami karena penerimanya memang orang itu. Satu emitter di dalam RPC yang sudah ada, satu tipe baru di CHECK. **Nol keputusan produk terbuka.**

### 6.5 "Aturan Pecah Target warning" — kemungkinan besar **bukan** gap notifikasi

PRD §28 item 7 berbunyi *"jika user sedang membuat turunan"* — itu **kondisi sinkron**, bukan peristiwa asinkron. Kepatuhan MBR sudah disurfacekan saat itu juga lewat `check_minimum_breakdown_compliance` yang menggerbangi tombol turunan (`lib/mbr-cascade.ts`). Notifikasi persisten untuk keadaan yang sudah tampil di layar saat penyebabnya terjadi adalah kategori yang berbeda, dan berisiko jadi bunyi yang tak bisa ditindaklanjuti (user sudah melihat warning-nya; notifikasi tiba setelah ia pergi).

Ini berpola sama dengan BL-03 dan BL-09(a): baris PRD yang terbaca sebagai gap padahal permukaannya sudah ada dalam bentuk lain.

> **Keputusan owner diperlukan (D-BL07-3).** (a) Tutup sebagai **bukan gap**, catat di PRD bahwa item 7 dipenuhi oleh gerbang MBR inline; (b) tetap kirim notifikasi — perlu definisi pemicunya, karena "sedang membuat turunan" tidak punya peristiwa server yang bisa dipasangi emitter. Rekomendasi: **(a)**.

### 6.6 Temuan sampingan — staging tertinggal migrasi 0081, dan client sudah mendahuluinya

Ditemukan saat memverifikasi CHECK: constraint **hidup di staging masih 13 tipe** dan **tidak** memuat `period_closing_reminder`; `emit_period_closing_reminders` **tidak ada** di staging (`pg_proc` kosong untuk nama itu). Migrasi `0081` belum diterapkan ke sana.

Sementara itu `mobile/src/lib/notifications.ts:22` **sudah** memuat `period_closing_reminder` sebagai tipe ke-14. Client mendahului DB: selama 0081 belum diterapkan, tipe itu tidak akan pernah tiba, dan andai ada jalur yang menulisnya ia akan ditolak CHECK. Ini instans lain dari [[staging-db-migrasi-tertinggal]] — CI tidak `db push`. **Prasyarat** untuk BL-07: apa pun tipe baru yang ditambahkan akan mendarat dalam keadaan sama kecuali penerapannya diverifikasi terhadap **efek di schema**, bukan terhadap `schema_migrations`.

### 6.7 Yang dikirim — migrasi 0084 (keputusan owner 2026-07-22)

Ketiga keputusan turun sesuai rekomendasi §6.2/§6.3/§6.5. **Tiga tipe baru**, satu migrasi:

| Tipe | Emitter | Penerima | Gate |
|---|---|---|---|
| `evidence_submitted` | `submit_task` + `submit_task_instance` | `created_by` (pembuat card) | `elsif not review_required` — **tidak pernah** menyala saat review diperlukan |
| `deadline_overdue` | `emit_deadline_notifications` (cron) | PIC | `deadline < org_today()`, ber-`dedupe_date` → maks 1×/tugas/hari |
| `permission_changed` | `set_user_permission` | user yang izinnya berubah | setelah seluruh guard/raise |

**D-BL07-2 ditegakkan secara struktural, bukan sekadar dijanjikan.** Cron tidak menyentuh `tasks.status`; "lewat" tetap fakta turunan. `T-BL07-6` gagal bila `update public.tasks` muncul di badan fungsi itu, dan `T-BL07-7` gagal bila `tasks.status` suatu saat memperoleh `missed`/`overdue` — memaksa keputusan ditinjau ulang alih-alih membiarkan dua mekanisme "lewat" hidup berdampingan diam-diam.

**D-BL07-3 ditutup di PRD, bukan di kode.** §28 kini memuat blok "Semantik yang ditetapkan" yang menyatakan item 7 dipenuhi gerbang MBR inline (plus semantik item 2 & 4). Tanpa itu, audit app-vs-PRD berikutnya akan melahirkan ulang temuan yang sama — persis nasib BL-03.

**Badan fungsi direproduksi apa adanya** dari versi hidupnya (pola 0072) lalu disisipi delta, **dibangun lewat skrip ber-assert** yang gagal bila pola sisipan tidak cocok tepat satu kali — bukan salin-tempel manual. `create or replace` di keempatnya; `drop … cascade` akan mereset ACL ke `PUBLIC EXECUTE` dan membatalkan REVOKE 0066/0076/0080.

**Push sengaja tidak disentuh.** Ketiga tipe in-app saja; `is_push_worthy` (0081) tidak diubah karena 0081 sendiri belum mendarat di staging (§6.6) — menyentuhnya di sini akan menggabungkan dua masalah. `[BL07-4]` mengunci client agar tidak mendahului DB, yaitu kesalahan yang membuat `period_closing_reminder` menggantung.

**Verifikasi: dijalankan terhadap database sungguhan.** Migrasi diterapkan ke Postgres lokal (`supabase_db_supabase`) dan efeknya diperiksa di schema — CHECK **17 tipe**, keempat badan fungsi memuat emitter barunya, ACL tanpa `PUBLIC`/`anon`. Kontrak `T-BL07-1..8` **8/8 lolos**. Mobile: **133 suite / 1653 tes** hijau, type-check bersih, lint nol error.

> `T-BL07-4` sempat **gagal lebih dulu** dan itu bukan kebetulan: assertion-nya menuntut penerima = `created_by`, tapi ditulis seolah argumen tipe berada tepat setelahnya. Urutan `emit_notification` sebenarnya `(org, penerima, actor, tipe, …)`. Yang salah assertion-nya, bukan kodenya — dan itu bukti assertion-nya benar-benar menggigit alih-alih hijau karena longgar.

### 6.8 Ukuran setelah scoping

| Sub-item | Ukuran | Butuh keputusan? |
|---|---|---|
| Permission berubah (§6.4) | **XS** | tidak |
| Bukti dikirim (§6.2) | **S** | ya — D-BL07-1 |
| Deadline lewat, opsi (a) (§6.3) | **S** | ya — D-BL07-2 |
| Deadline lewat, opsi (b) | **L** | ya — spec sendiri |
| MBR warning (§6.5) | **XS** (koreksi PRD) atau **M** | ya — D-BL07-3 |
| Terapkan 0081 + verifikasi schema (§6.6) | **XS** | tidak — prasyarat |

Satu migrasi menampung seluruh tipe baru yang disetujui (superset CHECK, pola 0038/0081) — jadi memutuskan ketiganya sekaligus lebih murah daripada tiga migrasi berurutan.

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

## BL-17 — Label Indonesia untuk `activity_logs.action`, dan keputusan memperluas gate BL-13

**Gap.** `search_global` (0088) memproyeksikan `activity_logs.action` mentah sebagai `subtitle`, dan `search.tsx` merendernya apa adanya: `create`, `update`, `review_approve`. Kelas cacat yang sama persis dengan yang BL-12 tutup untuk `violation_type`, dikirim sebagai permukaan baru.

**Tempatnya klien, bukan SQL.** Migrasi 0088 sudah menuliskan alasannya di komentar cabang audit: peta label di SQL menduplikasi `GOVERNANCE_VIOLATION_TYPE_LABEL` dan mengembalikan drift yang gate BL-13 dipasang untuk mencegah. Implementasi mengikuti bentuk BL-12 — `ACTIVITY_LOG_ACTION_LABEL` + `activityLogActionLabel()` di `mobile/src/lib/activity-governance.ts`, dengan fallback identik.

**Penulis baris.** `activity_logs.action` bertipe `text` tanpa CHECK constraint, jadi himpunannya ditelusuri dari migrasi. **Tiga** jalur, bukan dua seperti `violation_type`:

1. `write_activity(entity_type, entity_id, <action>, detail)` — helper Fase 1 (0005), jalur mayoritas.
2. `write_activity_system(org, actor, entity_type, entity_id, <action>, detail)` — jalur cron/sistem (0007).
3. `insert into activity_logs (…)` langsung — badan kedua helper, trigger `log_card_creation()` (literal `'create'`), dan migrasi data (0078 `settings_legacy_purged`).

Parser menemukan **152 site** → **44 action** unik. Sebelas action yang teramati di DB nyata (733 baris) semuanya termasuk, jadi hitungannya direkonsiliasi terhadap data, bukan dipercaya begitu saja.

**Ekspresi `case` diresolusi, tidak diallowlist.** Jalur review menulis `case when p_decision = 'approve' then 'review_approve' else 'review_reject' end` di tujuh migrasi. Memperlakukannya sebagai dinamis akan membuang empat action ke allowlist manual — termasuk `review_approve`, yang sendirian 72 dari 733 baris produksi. Selama SELURUH cabang hasilnya literal, nilainya dapat diketahui statis; satu cabang non-literal membuat seluruh ekspresi dinamis (resolusi sebagian = gate hijau yang kehilangan nilai). Satu-satunya yang tersisa di allowlist: `p_action` di badan kedua helper — nilainya datang dari pemanggil, yang sudah diparse lewat jalur 1/2.

### Keputusan: gate BL-13 DIPERLUAS ke `action`

Pertanyaan yang tercatat di baris BL-17 adalah apakah gate `violation_type` pantas diperluas, mengingat `action` punya lebih banyak penulis dan lebih sering bertambah. **Diputuskan: diperluas.**

Alasannya membalik premis pertanyaannya. "Lebih banyak penulis, lebih sering bertambah" adalah deskripsi **laju drift**, dan laju drift adalah argumen untuk memasang gate, bukan untuk melewatkannya. Kolom yang jarang berubah bisa dijaga review manusia; kolom yang sering berubah tidak bisa.

Argumen itu tidak spekulatif — drift-nya sudah terjadi dan terukur sebelum satu baris gate ditulis. Peta warisan di `settings-activity-log.tsx` (41 entri, hidup diam-diam sebagai konstanta privat satu layar) ternyata:

- **kehilangan 5 action ter-emit**: `card_completion_rule_updated`, `card_guidance_updated`, `push_token_transferred`, `settings_legacy_purged`, `target_breakdown_updated`;
- **menyimpan 1 label yatim**: `instance_missed` — sebenarnya tipe **notifikasi** (0008), bukan action; `instance_marked_overdue` adalah action-nya. Dihapus.

Enam kekeliruan yang tak satu pun memerahkan apa pun, di peta yang tidak ada seorang pun tahu sudah basi. Itulah tepatnya mode kegagalan yang jadi keluhan BL-13.

Ongkosnya juga bukan variabel bebas: parser BL-13 sudah menyediakan `splitTopLevel`/`literalValue`, jadi perluasan ini dua berkas (`test-support/activity-log-actions.ts` + `lib/__tests__/activity-log-actions.contract.test.ts`), nol migrasi, nol perubahan schema — bentuk yang sama dengan opsi 3 BL-13.

**Batas yang diterima**, identik BL-13: gate menjaga sinkronisasi migrasi↔client, bukan integritas data di DB. Nilai yang ditulis di luar migrasi tetap masuk — dan fallback nilai mentah memang ada untuk itu.

**Yang ikut dikirim (di luar tulisan baris BL-17).** Subtitle scope `governance_violation` di layar yang sama (`violation_type · severity`) **juga** mentah. Ia dirender baris kode yang sama dan dilayani peta BL-12 yang sudah ada, jadi membiarkannya berarti mengirim ulang cacat yang sedang ditutup, satu kolom bergeser. Nol peta baru: `governanceViolationTypeLabel()` + `GOVERNANCE_VIOLATION_SEVERITY_LABEL`.

**Dikunci tes.** `[BL17-1..7]` gate kontrak (ketiga jalur emisi punya lantai sendiri, resolusi `case`, lantai 11 action produksi, dua arah label↔emitter, site dinamis ditinjau) + `[BL-17]` di `activity-governance.test.ts` (44 action dari parser dicek berlabel non-`snake_case`, fallback, kosong, trim) + `[BL17-UI-1..3]` di `search.test.tsx` — termasuk sapuan bahwa **tidak ada** teks terlihat yang masih `snake_case`.

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

## BL-06 — "Zona waktu" §23: tampilan, bukan override per-rule

Ukuran item ini sepenuhnya bergantung pada satu interpretasi yang PRD tidak selesaikan sendiri. Dua bacaan yang mungkin:

- **(A) Tampilan.** Field menunjukkan zona tempat deadline ditafsirkan — zona organisasi — supaya user yang mengisi "Jam deadline 09:00" tahu 09:00 itu di mana. Nol migrasi, nol perubahan engine.
- **(B) Override per-rule.** Sebuah repeat-rule boleh memakai zona berbeda dari organisasinya. Butuh migrasi, ubah semantik penjadwalan, dan implikasi cron.

**Yang dipilih: (A).** Bukti, seluruhnya dari repo:

1. **PRD menyebut zona waktu tepat sekali.** `grep -i -E "zona waktu|timezone|time zone|WIB|WITA|UTC"` atas `PRD.md` mengembalikan **satu** baris: `966:5. Zona waktu.` Tidak ada kalimat normatif di §7, §28, maupun bagian deadline/cron. Nol kata yang memberi field ini semantik override.
2. **Daftar §23 memang mencampur input dan tampilan.** Dari 10 field, item 7–10 (`Expected instances`, `Completed instances`, `Missed instances`, `Repeat Compliance`) semuanya **turunan read-only** yang memang sudah dirender sebagai metrik, bukan input. Membaca item 5 sebagai tampilan konsisten dengan idiom daftar itu sendiri; membacanya sebagai input justru yang menyimpang.
3. **Schema tidak pernah menyediakan tempatnya.** `task_repeat_rules` (nama hidup pasca-rename 0045: `action_plan_repeat_rules` → `task_repeat_rules`, `0045:51`) tidak punya kolom timezone — tidak saat dibuat (`0007:22-47`), dan nol `ALTER TABLE ... repeat_rules` menambahkannya sesudah itu. Diverifikasi pada **DB staging** lewat `information_schema.columns`: 15 kolom, tak satu pun timezone.
4. **Zona waktu dinyatakan eksplisit sebagai properti organisasi.** `0007:11` — *"timezone organisasi (deadline_at dihitung pada zona ini)"*; `0007:61` — `deadline_at ... -- instance_date + instance_time @ org timezone`; `0081:16` — *"Tanggal SELALU dihitung server via org_today (timezone org)"*.

**Kenapa (B) bukan sekadar "lebih besar" tapi kontradiktif.** Helper terpusat `public.org_today(p_org)` (`0008:21-27`) meresolusi `organizations.timezone` dan premisnya adalah bahwa "hari ini" milik **organisasi**. Di bawah (B), "hari ini" jadi ber-skop rule, dan tiap perbandingan `deadline_at at time zone <tz>` terhadap `org_today()` jadi ambigu — termasuk deteksi instance terlewat dan reminder deadline. Pertanyaan terbuka yang harus dijawab lebih dulu: **zona mana yang memutuskan sebuah instance terlewat** — zona rule-nya, atau zona org yang harinya sedang berjalan? PRD tidak menanyakannya, apalagi menjawabnya. Kalau suatu saat (B) benar-benar diminta owner, itu **spec /sdd-plan**, bukan tiket backlog.

**Yang dikirim.** `mobile/src/lib/org-timezone.ts` (`getOrgTimezone()` membaca `organizations.timezone` di bawah RLS `org_select_own`, + `orgTimezoneLabel()` murni yang menempelkan singkatan lokal: WIB/WITA/WIT) dan keterangan read-only `repeat-timezone` di dalam `repeat-config` pada `task/new.tsx`, tepat di bawah periode repeat — berdampingan dengan tempat "Jam Deadline" dirujuk. Gagal/loading **jatuh ke default org** (`Asia/Jakarta`), bukan mengosongkan atau memblokir form: field hiasan tidak boleh menjatuhkan form yang memuatnya. Zona di luar peta singkatan tampil apa adanya — tidak ada singkatan karangan.

**Dikunci tes.** `lib/__tests__/org-timezone.test.ts` `[1..7]` (label, fallback, bacaan RLS 0-baris, propagasi error) + `task/__tests__/repeat-ui.test.tsx` `[10..12]` — termasuk anti-regresi bahwa baris ini tidak pernah berubah jadi kontrol yang bisa dipilih per repeat-rule, dan bahwa zona yang tampil benar-benar zona org (`Asia/Makassar` → WITA), bukan WIB hardcoded.

**Jebakan yang ditemukan.** `toHaveTextContent('Asia/Jakarta (WIB)')` **selalu lolos-palsu/gagal-palsu** untuk label ini: matcher memperlakukan argumen string sebagai sumber regex, sehingga `(WIB)` jadi grup tangkap dan tanda kurungnya tak pernah ikut dicocokkan. Pakai `getByText('...')` (pencocokan literal) untuk teks yang mengandung metakarakter regex. Terpisah: keterangan ini memakai casing PRD **"Jam deadline"** (§23 field 4), sengaja berbeda dari label field **"Jam Deadline"**, supaya query `getByText(/Jam Deadline/)` di tes `[3]` tidak menangkap dua elemen.

---

## BL-16 — cursor separuh di `search_global`: kehilangan data tanpa error

**Gap.** Guard bentuk-request FR-19 yang dipasang 0085 menuntut satu hal saja: bila ada cursor, `p_scopes` harus berisi tepat satu scope. Ia tidak menuntut kedua bagian cursor ada. `p_cursor_ts` terisi dengan `p_cursor_id` NULL lolos utuh ke keempat belas cabang, yang semuanya memfilter dengan `(created_at, id) < (p_cursor_ts, p_cursor_id)`.

**Kenapa hampir tak terlihat.** Postgres membandingkan tuple secara **short-circuit**. Selama `created_at < p_cursor_ts` tegas, komponen kedua tak pernah dievaluasi dan `p_cursor_id` NULL tidak berpengaruh apa pun. Komponen kedua baru disentuh saat `created_at` **persis sama** dengan cursor — yaitu satu-satunya kondisi `id` ada untuk memecahkannya. Di sana perbandingan jatuh ke `id < NULL` → NULL, dan seluruh baris tie gugur.

| Bentuk panggilan (dua goal ber-`created_at` identik) | Sebelum 0089 | Sesudah |
| --- | --- | --- |
| tanpa cursor | 2 baris | 2 baris |
| tie + `p_cursor_id` lengkap | 2 baris | 2 baris |
| tie + `p_cursor_id` NULL | **0 baris, senyap** | ditolak `22023` |
| `p_cursor_id` terisi + `p_cursor_ts` NULL | cursor diabaikan senyap | ditolak `22023` |

**Severity dikoreksi ke bawah.** Kritik §9.1 Missing #4 di `specs/bl-10-pr1-tdd-plan.md` menyebut akibatnya "semua baris hilang". Itu **berlebihan** — cakupan sebenarnya hanya kasus tie, dan tie pada `created_at` tidak umum. Klien juga tidak pernah menghasilkan bentuk ini: `useSearchScopePage` menyimpan cursor sebagai objek `{ts, id}` yang diisi dari dua kolom non-null sekaligus, jadi kedua bagian selalu ada atau keduanya null. Bentuk separuh hanya terjangkau lewat panggilan API tangan.

**Kenapa tetap dikerjakan.** Bukan karena jangkauannya, melainkan karena **bentuk kegagalannya**: hasil yang hilang tanpa error. Tidak ada exception, tidak ada baris nol yang mencurigakan (halaman berikutnya memang wajar kosong), tidak ada jejak di log. Kelas bug ini tidak pernah dilaporkan — ia hanya salah diam-diam. Ongkos perbaikannya empat baris.

**Bentuk kebalikannya ikut ditutup.** `p_cursor_id` terisi dengan `p_cursor_ts` NULL hari ini "aman" hanya secara kebetulan: tiap cabang menggerbangi filternya pada `p_cursor_ts is null`, sehingga cursor-nya **diabaikan diam-diam** dan pemanggil menerima halaman pertama lagi sambil mengira ia meminta halaman berikutnya. Sama-sama salah senyap, jadi sama-sama ditolak.

**Yang dikirim** (migrasi 0089, `create or replace`):

```sql
if (p_cursor_ts is null) <> (p_cursor_id is null) then
  raise exception 'cursor wajib lengkap: p_cursor_ts dan p_cursor_id harus terisi bersama'
    using errcode = '22023';
end if;
```

Empat keputusan bentuk yang mengikat:

1. **errcode `22023` + pesan statis.** Sama seperti guard multi-scope 0085, exception ini sah justru karena tidak bergantung identitas maupun data aktor — pemanggil mana pun dengan request berbentuk sama mendapat galat sama, sehingga ia tidak dapat dipakai sebagai oracle (FR-13). Menyisipkan nilai dari baris atau aktor akan merusak sifat itu; `DB-98` memeriksanya secara eksplisit.
2. **Di kepala fungsi, bukan per cabang.** Cabang ke-15 yang ditambahkan nanti ikut terlindungi tanpa harus ingat.
3. **`create or replace`, bukan `drop`+`create`.** `drop … cascade` mereset ACL fungsi ke `PUBLIC EXECUTE` dan membatalkan revoke 0085 — lihat [[anon-public-rpc-grant-gotcha]]. Konsekuensinya seluruh badan disalin verbatim dari 0088 (versi terlengkap, 14 scope), dan blok `revoke`+`grant` diulang di akhir migrasi.
4. **Nol perubahan klien.** Tidak ada jalur klien yang menghasilkan bentuk terlarang, jadi menambah guard di klien hanya menduplikasi aturan yang sudah dipegang DB.

**Dikunci `DB-96..DB-101`** (`supabase/tests/0089_search_global_cursor_guard_contract.sql`), seed sendiri berupa dua goal ber-`created_at` identik. Dua kontrol positif (`DB-96` tanpa cursor, `DB-97` tie + cursor lengkap) dipasang lebih dulu supaya assertion inti tidak bisa hijau hanya karena seed tak tercari, dan `DB-100` menjaga bentuk paling umum — kedua bagian NULL, yaitu halaman pertama — tidak ikut tertolak saat guard diperketat. Diverifikasi **merah lebih dulu**, dan merahnya tepat pada `DB-98`/`DB-99` saja: kedua kontrol positif hijau di run yang sama, membuktikan bug memang hanya pada bentuk separuh.

---

## BL-18 — penghitung per-aktor FR-34: bukan "belum diawasi", melainkan **belum sampai ke mana pun**

**Status: scoping selesai, menunggu keputusan owner.** Halaman ini tidak memilih diam-diam; empat opsi di bawah punya konsekuensi berbeda terhadap G6 (nol-emisi audit), dan G6 adalah keputusan produk.

### Diagnosis awal kurang dalam satu tingkat

Baris BL-18 berbunyi "tidak ada ambang, alerting, atau siapa pun yang membacanya". Itu benar tapi belum sampai ke akarnya. Dua fakta yang lebih menentukan, keduanya terbaca dari kode yang sudah ada:

1. **Emisi berhenti di perangkat pemakai.** Peristiwa sukses ditulis `log.info({ event: 'search_global', … })` (`mobile/src/lib/search.ts`). Satu-satunya transport terpusat, `createSentryTransport` (`mobile/src/lib/sentry-logger.ts`), **hanya meneruskan `error` dan `warn`** — `info` dan `debug` sengaja dibuang, dan perilaku itu dikunci tesnya sendiri: *"info/debug tidak mengirim ke Sentry (hanya console)"* (`sentry-logger.test.ts`). Jadi penghitung per-aktor hari ini berakhir di `console.log` di perangkat, bukan di sink mana pun. Bukan "tidak ada yang membaca" — **tidak ada yang bisa membaca**, karena datanya tidak pernah keluar.

2. **Sekalipun sampai ke sink, ia dilaporkan sendiri oleh pihak yang diawasi.** `search_global` di-`grant execute … to authenticated` (0085, dipertahankan 0086-0089), sehingga pemegang sesi mana pun dapat memanggilnya langsung lewat PostgREST tanpa menjalankan kode klien. Penambangan data lewat pencarian berulang — persis skenario yang `BL10-OQ-09` ingin diimbangi — tidak perlu memakai aplikasinya. Telemetri yang diemisikan klien tidak dapat menjadi kontrol terhadap klien.

Konsekuensi gabungan: **ambang di sisi klien tidak akan mengikat siapa pun**, berapa pun angkanya. Menentukan ambang lebih dulu, seperti yang tertulis di baris BL-18, akan menghasilkan angka yang rapi di atas mekanisme yang tidak menegakkan apa-apa — bentuk kegagalan yang sama dengan yang dikeluhkan BL-18 itu sendiri, hanya satu lapis lebih dalam.

### Empat opsi

| # | Bentuk | Mengikat? | Ongkos | Sentuhan G6 |
|---|---|---|---|---|
| **1** | Naikkan level peristiwa FR-34 ke `warn` agar lolos transport Sentry, tambah ambang di klien | ❌ tidak — pemanggil langsung tetap tak terlihat | XS | Tidak — payload tetap agregat |
| **2** | Akuntansi sisi server: tabel penghitung + wrapper `volatile` yang menulis sebelum memanggil `search_global` | ✅ ya | M — tabel + RLS + wrapper + kontrak | **Ya** — Search berhenti nol-emisi |
| **3** | Baca yang sudah dicatat Postgres/Supabase di luar aplikasi (log statement / `pg_stat_statements` per `jwt.sub`), ambang + alert di sisi platform | ✅ ya | S — nol perubahan schema, kerja konfigurasi | Tidak — DB memang sudah mencatatnya |
| **4** | Terima risikonya, **cabut klaimnya**: berhenti menyebut penghitung ini kontrol kompensasi, dan catat `BL10-OQ-09` sebagai terbuka | — | XS | Tidak |

**Rekomendasi: opsi 3, dengan opsi 4 diberlakukan sekarang juga.** Opsi 3 mengikat karena ia mengamati DB — tempat setiap pemanggil harus lewat, termasuk yang mem-bypass aplikasi — dan ia tidak menyentuh G6 sedikit pun, karena tidak menambah emisi baru: ia membaca jejak yang memang sudah dihasilkan Postgres. Bentuknya sejenis opsi 3 pada BL-13: begitu masalahnya dibingkai ulang dari "apa yang harus kita tulis" jadi "apa yang sudah tercatat dan belum dibaca", ongkosnya turun dari migrasi jadi konfigurasi. Opsi 1 ditolak karena ia membeli rasa aman tanpa mengikat siapa pun **dan** membanjiri Sentry dengan satu peristiwa per pencarian. Opsi 2 mengikat tetapi membalik keputusan G6 untuk mengejar risiko yang jangkauannya belum diukur — kalau suatu saat diminta, itu spec tersendiri, bukan tiket backlog.

Opsi 4 dikerjakan di PR ini karena ia benar di bawah **semua** opsi lainnya: komentar di `mobile/src/lib/search.ts` yang menyebut penghitung ini "kontrol kompensasi atas nol-emisi audit" adalah klaim yang tidak dipenuhi implementasinya, dan klaim semacam itu lebih berbahaya daripada tidak ada komentar — ia membuat kontrol tercentang di review tanpa ada yang memeriksa apakah benda itu bekerja. Komentar kini menyatakan status sebenarnya beserta kedua faktanya.

### Yang perlu diputuskan owner

1. Opsi mana yang dijalankan (rekomendasi: **3**).
2. Bila 3: **sink mana yang benar-benar dipantau** — Sentry hari ini hanya menerima `error`/`warn` dari klien, dan tidak ada bukti seorang pun membaca log Postgres. Kontrol yang menunjuk sink yang tak dibaca mengulang cacat BL-18 dari awal.
3. Baru setelah (2) terjawab: **ambang per aktor per jendela waktu**. Ia tidak dapat ditentukan lebih dulu tanpa baseline — dan baseline hanya ada setelah ada yang mengumpulkan angkanya.

---

## Referensi

- [[audit-governance]] — model Activity Log & Governance Violation append-only, arti severity.
- [[ui-prototype-gap]] — backlog UI ber-ID dari perbandingan prototype (terpisah dari halaman ini).
- [[ws-04-governance-debt]] — governance debt lain yang sengaja ditunda, dengan sinyal re-open eksplisit.
