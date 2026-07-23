# BL-10 — Search scope PRD §38 lengkap + grouping hasil

**Status:** spec final, siap disambung ke `/tdd-plan`
**Tanggal:** 2026-07-22
**Sumber otoritatif:** `PRD.md` §38 (blok "## 38. Search"), AC-27; `wiki/concepts/{architecture,permission-model,scope-guardrails,audit-governance}.md`; `specs/search-pesan-inbox.md`; `specs/fase-8-governance-admin.md`
**Migrasi berikutnya tersedia:** 0085 — bukan 0084. Terakhir di repo `0083_handle_new_user_explicit_org.sql`, tapi **0084 sudah diklaim** `0084_bl07_notifications_missing_types.sql` (BL-07, PR #154, terbuka saat spec ini ditulis). Seluruh slot BL-10 digeser satu pada 2026-07-22: PR-1 `0085`, PR-2 `0086`, PR-3 `0087`, PR-4 `0088`.

> [!warning] Verifikasi ulang slot sebelum menulis migrasi
> Beberapa sesi bekerja paralel di repo ini dan slot bisa berpindah lagi antara sekarang dan saat implementasi. Jalankan `ls supabase/migrations/ | tail` **dan** cek PR terbuka (`gh pr list --json files`) sesaat sebelum membuat berkas — nomor di dokumen ini adalah rencana, bukan reservasi.

---

## 1. Problem statement

PRD §38 menetapkan tiga hal, dan ketiganya belum dipenuhi:

1. **14 scope**: Goal, Strategy, Initiative, Action Plan, Task, Task Instance, Development Area, Problem Statement, People, Comment, Chat, Bukti, Activity Log, Governance Violation.
2. **"Search result harus dikelompokkan."**
3. **"User tidak boleh menemukan data yang tidak boleh dia akses."** — diangkat menjadi AC-27, jadi ini gate rilis.

Kondisi saat ini:

- **7 dari 14 scope tertutup.** `CardEntityType` (`mobile/src/lib/governance-admin.ts:11-18`) hanya memuat `goal|strategy|initiative|action_plan|task|development_area|problem_statement`, semuanya lewat satu RPC `search_cards`.
- **Grouping nol.** `mobile/src/app/(app)/search.tsx` merender `FlatList` datar tanpa section header, tanpa debounce, tanpa paging, tanpa state degrade, dan tanpa satu pun test.
- **Kapabilitas yang sudah dibayar tapi tidak dipakai.** `public.search_chat_messages` sudah production-grade (0054 → 0060 confidential-aware → 0075 restore guard), punya wrapper klien di `mobile/src/lib/inbox.ts` dan contract test, tetapi layar Search tidak pernah meng-import-nya.
- **Utang FR yang belum dicatat.** `specs/fase-8-governance-admin.md` FR-8.5.3 mewajibkan `search_cards` menutup minimal 8 entity type **termasuk People**; yang shipped 7 tanpa catatan keputusan.

**Risiko utamanya otorisasi, bukan cakupan.** Tujuh sumber data baru = tujuh permukaan otorisasi baru. Asumsi "RLS akan menanganinya" **tidak berlaku** di jalur Search: `search_cards` adalah `SECURITY DEFINER SET search_path=''` (`supabase/migrations/0046_rewrite_bodies_and_policies.sql:2113-2117`), sehingga RLS tabel mati di dalam body-nya dan otorisasi di-reimplementasi manual per cabang UNION. Setiap scope baru menambah gate tulisan tangan yang harus dibuktikan **≤ seketat** RLS tabel sumbernya.

Tiga permukaan paling berbahaya:

| Scope | Kenapa berbahaya |
|---|---|
| Activity Log | RLS = org **AND** (`view_activity_log` **OR** `actor_id = auth.uid()`) — bukan admin-only murni; tidak confidential-aware; retensi 12 bulan (0043) |
| Governance Violation | RLS = org **AND** (`view_governance_violation` **OR** `user_id = auth.uid()`); `violation_type` snake_case, peta label hidup di klien; tidak confidential-aware; `resolution_note` adalah catatan admin tentang user |
| Bukti / Komentar / Chat | membership-bound; `evidence_files` bahkan **tanpa kolom `organization_id`** (isolasi turunan lewat `can_access_task`) dan menyimpan `storage_path` yang tidak boleh keluar |

Kegagalan di sini tidak menghasilkan bug yang terlihat — ia menghasilkan **kebocoran diam**.

---

## 2. Goals

- **G1 — Nol kebocoran, termasuk metadata.** Setiap scope punya model otorisasi tertulis (predikat + helper + policy padanan). Nama, snippet, keberadaan grup, dan count semuanya diperlakukan sebagai data yang tunduk permission.
- **G2 — Anti-oracle by construction.** Gate ada di `WHERE`, tidak pernah `raise exception`; grup nol-hasil tidak dirender; empty state no-match dan silent-filtered identik; tidak ada count sama sekali.
- **G3 — Grouping per jenis** dengan label bisnis V1.83, dibangun dari list yang sudah terurut server.
- **G4 — Satu bentuk query, diputuskan di spec** (§5.1), tanpa dua opsi untuk implementor.
- **G5 — Semantik paging ditetapkan sebelum implementasi** (§5.5).
- **G6 — Nol emisi audit.** Search tidak menulis apa pun; `STABLE` sebagai penegak mekanis.
- **G7 — Reuse, bukan salin-tempel.** Chat memakai `search_chat_messages` apa adanya lewat delegasi.
- **G8 — Pengiriman bertahap mengikuti gradien risiko** (§9), grouping ikut PR-1 tanpa pengecualian.

### 2.1 Definisi selesai terhadap §38

BL-10 dianggap menutup PRD §38 + AC-27 bila **14 scope kanonik dapat dicari dan hasilnya dikelompokkan**, dengan dua batas struktural yang **dinyatakan eksplisit di changelog** dan bukan diklaim tertutup penuh:

1. **Komentar parsial secara struktural.** `comments_entity_type_check` (0046:43-51) hanya mengizinkan `action_plan|initiative|action_plan_instance|task|task_instance`. Tidak ada komentar pada Goal, Strategy, Development Area, atau Problem Statement — bukan gap implementasi, melainkan batas skema.
2. **Task Instance dicocokkan lewat proksi.** `task_instances` tidak punya kolom teks sama sekali (terverifikasi: `0007_fase2_repeat.sql:55-78` — hanya tanggal/status/FK + `missed_reason`), sehingga "match" didefinisikan ulang sebagai nama Task induk atau `missed_reason`.

---

## 3. Non-goals

Lihat daftar NG-1..NG-16 pada field `non_goals`. Yang paling sering salah dipahami:

- **NG-6**: `search_cards` **tidak disentuh sama sekali** — tidak DROP, tidak `CREATE OR REPLACE`, tidak diganti tanda tangannya. Layar Arsip (`settings-archive.tsx`) berbagi RPC + queryKey `['cards_search']`; menjadikannya wrapper akan memotong hasil arsip untuk org besar. Konsolidasi kedua permukaan adalah backlog terpisah.
- **NG-9**: `people.tsx` tidak diubah. Dua semantik pencarian People diterima sebagai debt tercatat (BL10-OQ-10).
- **NG-13**: 7 tabel card tetap tanpa index trigram (kondisi hari ini juga), dicatat sebagai debt.

---

## 4. User stories

Semua story diikat ke **sumber akses**, bukan ke jabatan — peran di Rencanapp bertumpuk.

**US-0 — Satu pintu.** Sebagai user mana pun, saya mengetuk pill "Cari" di header global, mengetik ≥2 karakter, dan menemukan apa pun yang berhak saya akses tanpa menebak layar mana yang menyimpannya.

**US-1 — Hasil dikelompokkan.** Sebagai user, saya melihat hasil dipisah per jenis dengan header berbahasa bisnis, bukan daftar campur aduk.

**US-2 — Ketiadaan hasil tidak membocorkan apa pun.** Sebagai Staff, ketika saya mencari nama Task rahasia milik divisi lain, saya melihat empty state yang persis sama dengan ketika kata kunci saya memang tidak cocok apa pun.

**US-3 — Mencari tidak meninggalkan jejak.** Sebagai user, saya bisa mencari tanpa setiap ketikan tercatat sebagai aktivitas atau pelanggaran.

**US-4 — Hasil read-only.** Sebagai user, baris hasil hanya membawa saya ke tempat datanya.

**US-5 (CEO / `lihat seluruh Workspace`)** — saya mengetik satu kata kunci dan melihat hasil dari seluruh jenis data organisasi saya, termasuk card yang sudah diarsipkan, tanpa pernah melihat baris organisasi lain.

**US-6 (PIC induk / Manager)** — saya menemukan tidak hanya card turunan saya, tetapi juga Instansi Tugas, Komentar, dan Bukti di bawahnya. Lihat ≠ Edit tetap berlaku.

**US-7 (Manager mencari orang)** — saya mencari nama anggota tim dan mendapat baris berisi nama + jabatan saja (de-scored), lalu membuka profilnya.

**US-8 (PIC Task)** — saya mencari nama tugas dan menemukan Tugas itu serta instansi (tanggal) yang relevan, lalu masuk ke instansi yang harus saya kerjakan.

**US-9 (PIC/Reviewer mencari bukti)** — saya mencari nama file atau catatan bukti dan menemukan bukti yang berhak saya lihat, lalu dibawa ke Tugas/Instansi induknya. Saya juga menemukan draft yang **saya sendiri** unggah.

**US-10 (anggota chat)** — saya mencari sepenggal kalimat dan menemukannya di grup "Pesan", lalu dibawa ke ruangannya dengan pesan tersorot.

**US-11 (pemegang permission audit)** — saya mencari dan menemukan baris Log Aktivitas / Governance Violation organisasi saya di grup tersendiri, sebagai bantuan penelusuran (bukan sebagai surface audit otoritatif — baris tidak dapat ditekan).

**US-12 (Staff tanpa permission audit)** — saya menemukan baris audit tentang aktivitas saya sendiri di bawah label netral "Aktivitas Saya", tanpa menyimpulkan bahwa saya punya akses admin.

### Story yang sengaja ditolak

- ~~ranking relevansi/kepopuleran~~ (NG-1) · ~~"N hasil disembunyikan"~~ (anti-oracle) · ~~admin melihat query orang lain~~ (NG-14) · ~~approve/selesaikan dari hasil~~ (NG-4) · ~~feed gabungan lintas jenis~~ (NG-3)

---

## 5. Functional requirements & keputusan arsitektur

Notasi: **[MUST]** wajib · **[MUST NOT]** larangan keras · **[DECIDED]** keputusan tunggal spec ini.

### 5.1 Bentuk query — satu RPC (FR-1) [DECIDED]

**FR-1 [DECIDED]** Search memakai **SATU RPC multi-scope** `public.search_global`, bukan fan-out per-scope dari klien.

Alasan bukan round-trip: `wiki/concepts/architecture.md:24` menolak pemindahan permission ke application layer justru dengan alasan "search wajib ikut permission". Satu RPC = **satu permukaan otorisasi yang bisa dikunci satu berkas contract test**. Konsekuensi ikutan yang diterima sebagai keuntungan: **kegagalan parsial per-scope tidak ada by construction**, sehingga tidak ada banner degrade per-scope yang bisa menjadi kanal sampingan.

**FR-2 [MUST]** Cabang `chat` **memanggil** `public.search_chat_messages(q, null, lim, p_cursor_ts, p_cursor_id)` sebagai set-returning function di dalam `FROM`. **[MUST NOT]** menyalin body-nya. Regresi 0060→0075 (limit clamp, guard `length<2`, truncation 200 char hilang karena `create or replace` penuh) adalah preseden mengikat.

**FR-3 [MUST]** `search_global` adalah `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''` dengan seluruh referensi schema-qualified (`public.`, `auth.uid()`, `extensions.gin_trgm_ops`), konsisten dengan 0069.

**FR-4 [MUST]** `search_cards` **tidak diubah dengan cara apa pun** (NG-6). Layar Search berpindah ke `search_global`; layar Arsip tetap memakai `search_cards`.

### 5.2 Guard biaya

**FR-5 [MUST]** Ditiru persis dari 0075, dan **tanpa short-circuit klien sebagai satu-satunya guard**:
1. `q := btrim(coalesce(p_query,''))`; `if length(q) < 2 then return; end if;` — early return, bukan exception.
2. `q := substring(q from 1 for 200)`.
3. `pat := '%' || replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_') || '%'`, dipakai dengan `ilike pat escape '\'`.
4. `lim := least(greatest(coalesce(p_limit,5),1),30)`.

**FR-6 [MUST NOT]** Bug existing tidak boleh direplikasi: `search_cards` (0046:2120) membangun `'%'||lower(trim(q))||'%'` **tanpa escaping**, sehingga `%` yang diketik user menjadi wildcard sungguhan. `search_global` wajib escape di seluruh cabang.

### 5.3 Model otorisasi per scope [MUST]

**FR-7 [MUST]** Header migrasi wajib memuat peringatan: `search_global` adalah `SECURITY DEFINER` + `search_path=''`, sehingga **RLS tabel TIDAK berlaku di dalamnya**. Tidak ada jaring pengaman kedua. Komentar "RLS-scoped via RPC" di `mobile/src/app/(app)/search.tsx:1` menyesatkan dan dikoreksi di PR-1.

**FR-8 [MUST]** Peta gate — **pakai ulang helper, jangan tulis ulang predikat**:

| Scope | Gate wajib | Policy padanan (terverifikasi) |
|---|---|---|
| 7 card | `public.can_access_<entity>(id)` | policy card 0046 (confidential-aware pasca 0051/0077) |
| `task_instance` | `public.can_access_task(ti.task_id)` | `instances_select` (0046:2831) |
| `people` | `organization_id = public.current_user_org() OR id = auth.uid()` | `profiles_select_same_org` (0001:149-151) |
| `comment` | `organization_id = current_user_org()` **AND** dispatch literal (§6.4) | `comments_select` (0046:2777-2778) |
| `chat` | delegasi penuh ke `search_chat_messages` | `chat_messages_select` (0060:71-88) |
| `evidence` | `EXISTS (task_submissions s WHERE s.id = ef.submission_id AND public.can_access_task(s.task_id) AND (s.status <> 'draft' OR s.submitted_by = auth.uid()))` | `evidence_select` (0046:2789-2790) |
| `activity_log` | `organization_id = current_user_org() AND (has_permission('view_activity_log') OR actor_id = auth.uid())` + filter confidential FR-11 | `activity_logs_select` (0005:557-560) |
| `governance_violation` | `organization_id = current_user_org() AND (has_permission('view_governance_violation') OR user_id = auth.uid())` + filter confidential FR-11 | `governance_violations_select` (0005:562-565) |

**FR-9 [MUST NOT]**
- `evidence_files` **tidak punya kolom `organization_id`** — dilarang menambah filter org di cabang itu (kolomnya tidak ada); isolasi 100% turunan `can_access_task`, dan karena itu wajib punya test isolasi lintas-org tersendiri.
- `organization_id` **nullable** pada `activity_logs`/`governance_violations`: `= current_user_org()` bernilai NULL → fail-closed. **Dilarang** "memperbaiki" dengan `coalesce` atau `is not distinct from`.
- Dilarang subquery langsung ke `confidential_access_rules`; harus lewat helper.
- Dilarang "merapikan" `can_access_confidential_chat` menjadi `can_access_action_plan` (NG-12).

**FR-10 [DECIDED — default spec, sign-off owner: BL10-OQ-02]** Scope `activity_log` dan `governance_violation` **mengikuti RLS apa adanya, termasuk cabang self-row**. Label grup ditentukan klien dari `can()`: pemegang permission melihat "Log Aktivitas"/"Governance Violation"; tanpa permission melihat "Aktivitas Saya"/"Catatan Governance Saya". Perbedaan label ini adalah fungsi **permission pemanggil sendiri** (yang sudah ia ketahui), bukan fungsi data pihak lain — lihat amandemen FR-16.

**FR-11 [DECIDED — default fail-closed, sign-off owner: BL10-OQ-01]** Baris audit yang `entity_id`-nya menunjuk entitas yang tidak dapat diakses aktor karena **Confidential Access** dikeluarkan dari hasil Search. `entity_type` tak dikenal atau `entity_id` NULL juga dikeluarkan. Filter ini hidup **hanya di RPC search**; RLS tabel dan layar `/settings-activity-log` tidak diubah.

**FR-12 [DECIDED — sign-off owner: BL10-OQ-03]** Scope `evidence` mengembalikan bukti dari submission `status <> 'draft'` **ATAU** `submitted_by = auth.uid()`. Ini penyempitan sengaja terhadap `evidence_select` (yang tidak memfilter status sama sekali) demi semangat evidence locking, sambil tetap membuat PIC dapat menemukan draft yang baru ia unggah. Wajib dicatat di header migrasi 0087. *(Terverifikasi: kolom `status text check in ('draft','submitted')` ditambahkan `0019_fase_exec_ap5_ap6.sql:30-32`; `submitted_by` ada sejak 0005:94.)*

**FR-13 [MUST NOT]** `search_global` **tidak boleh** `raise exception` untuk kondisi otorisasi apa pun. Satu-satunya exception yang diizinkan adalah **error bentuk-request** pada cursor (FR-19), yang tidak bergantung pada identitas atau data aktor.

**FR-14 [MUST]** Klien bukan penegak. `can()` (`use-profile.ts:89-94`) hanya memilih **label** dan mengurangi permukaan UI. Dilarang menyaring hasil permission di klien pasca-fetch.

### 5.4 Anti-oracle (invarian)

**FR-15 [MUST]** Hasil kosong dan hasil tersaring-otorisasi melewati jalur kode yang sama, gate + `LIMIT` yang sama, dan menghasilkan payload identik.

**FR-16 [MUST NOT]** Dilarang differentiator visual/tekstual yang merupakan fungsi **data pihak lain**: header grup kosong, "Log Aktivitas (0)", "N hasil disembunyikan", total count, count per grup, nomor halaman global, banner error yang menyebut nama scope.
**Pengecualian tertulis:** perbedaan yang murni fungsi **permission pemanggil sendiri** (label grup FR-10) bukan differentiator terlarang.

**FR-17 [MUST]** Empty state untuk no-match dan silent-filtered memakai copy yang sudah dikunci owner (`specs/search-pesan-inbox.md` OQ-6, RESOLVED 2026-07-12): *"Tidak ada hasil yang cocok dengan pencarianmu."* + aksi "Hapus pencarian", tanpa hint/ikon/count pembeda.

### 5.5 Grouping, ordering, paging

**FR-18 [DECIDED]** **Ordering seragam `created_at DESC, id DESC` untuk seluruh 14 scope**, diproyeksikan sebagai `sort_ts`/`sort_id`.
Alasan: kontrak cursor keyset hanya bisa koheren bila seluruh scope berbagi satu tipe kunci urut. Alternatif "card diurut nama ASC" **ditolak** karena kunci nama tidak dapat dibawa oleh cursor bertipe `timestamptz` sehingga paging per-grup untuk card menjadi tidak dapat diimplementasi (baris terlewat diam-diam — dan pada permukaan anti-oracle, "baris hilang" tidak dapat dibedakan dari "baris disembunyikan").
*Terverifikasi:* `goals`/`strategies` (0010:49,85), `initiatives`/`action_plans` (0005:58,83), `development_areas`/`problem_statements` (0012:50,69), `task_instances` (0007:72), `comments` (0008:206), `evidence_files` (0005:132), `profiles` (0001:30) semuanya punya `created_at`. Kolom `created_at` untuk `tasks` diwarisi dari rename 0045 dan wajib di-assert di contract test.

**FR-19 [DECIDED]** **Paging per grup.** UI menampilkan `p_limit` (default 5) sebagai preview per grup + aksi "Lihat semua" yang memuat halaman berikutnya untuk **scope itu saja**, memakai cursor `(p_cursor_ts, p_cursor_id)`. Cursor hanya sah bila `p_scopes` berisi **tepat satu** scope; selain itu RPC melempar exception bentuk-request.
Alasan keamanan: LIMIT global lintas-scope membuat jumlah baris tiap grup menjadi fungsi dari data yang tersaring di grup lain — halaman yang "melompat" dapat dipakai menyimpulkan keberadaan baris tersembunyi.

**FR-20 [MUST NOT]** Tidak ada `OFFSET` di jalur search mana pun, tidak ada nomor halaman global, tidak ada `ORDER BY` lintas-scope.

**FR-21 [MUST]** UI memakai `SectionList` dengan urutan section **tetap dan deterministik** (urutan §38, §6.1), dibangun dari list datar server tanpa `sort()` di klien (pola `settings-activity-log.tsx:166-180`, `groupHitsByRoom` di `inbox.tsx:176-191`).

**FR-22 [MUST]** Nilai `p_scopes` yang tidak dikenal (typo, scope belum dirilis, string arbitrer) menghasilkan **0 baris tanpa exception** — agar error-vs-kosong tidak menjadi oracle bentuk-request.

### 5.6 Perilaku layar

**FR-23 [MUST]** Entry point tetap "Search pill pendek berlabel Cari" di header global; tanpa scope-selector di header, tanpa tab bottom-nav baru.

**FR-24 [MUST]** Debounce 250 ms + `enabled` pada panjang ≥ 2 (konvensi `use-search-messages.ts`). Guard otoritatif tetap di server.

**FR-25 [MUST]** State per PRD §40: loading = **skeleton card generik** (satu blok, **tanpa section header dan tanpa label scope** — skeleton berlabel scope adalah oracle), empty state instruktif sebelum mengetik, error berbahasa tenang + "Coba lagi" tanpa kode Postgres mentah.

**FR-26 [MUST]** `staleTime = 0` untuk seluruh query search, sehingga hasil selalu di-refetch dan jendela hasil basi pasca-pencabutan akses seminimal mungkin. Invalidasi realtime untuk scope membership-bound non-chat adalah debt tercatat (BL10-OQ-12).

**FR-27 [MUST]** Hasil **read-only mutlak** (NG-4). Evidence locking (PRD §24.1) dan sifat append-only audit ditegakkan struktural: BL-10 tidak menambah policy tulis apa pun.

**FR-28 [MUST]** Perilaku tap:

| Scope | Target |
|---|---|
| 7 card | `/{ENTITY_ROUTE_SEGMENT}/{id}` |
| `task_instance` | `/task/instance/{id}` |
| `people` | `/people-profile/{id}` |
| `chat` | `/inbox/{parent_id}?highlight={id}` |
| `comment`, `evidence` | rute entitas induk dari `parent_id` |
| `activity_log`, `governance_violation` | **tidak dapat ditekan** |

Alasan non-tappable (keputusan tertulis, bukan konsekuensi tak sengaja): tidak ada rute per-item, dan menavigasi user tanpa permission ke `/settings-activity-log` akan mendaratkannya di `AccessDenied` — dinding penolakan yang justru mengonfirmasi keberadaan permukaan Admin Lanjutan. Baris ditandai a11y sebagai teks biasa, bukan tombol.

**FR-29 [MUST]** Hasil People **de-scored**: nama + jabatan/role saja (PRD §32, `wiki/entities/surfaces.md`). Email **tidak dicari dan tidak dikembalikan**.

**FR-30 [MUST]** Tidak ada snake_case mentah yang bocor ke UI. `governance_violation` dirender lewat `governanceViolationTypeLabel()` (gate CI BL-13). Untuk `activity_log`, ekstraksi peta label yang saat ini terduplikasi di `settings-activity-log.tsx` dan `components/activity-log-panel.tsx` ke `mobile/src/lib/activity-governance.ts` adalah **prasyarat PR-4**, bukan polish.

**FR-31 [MUST]** Arsip: `p_include_archived` berlaku untuk 7 scope card (PRD §37 — card terarsip tetap dapat ditemukan user berwenang); scope turunan mengikuti akses induk tanpa filter arsip tambahan (konsisten dengan keputusan Inbox: archived room di-INCLUDE); `people` dan scope audit tidak punya konsep arsip.

### 5.7 Governance operasional

**FR-32 [MUST NOT]** Search **tidak menulis** `activity_logs` maupun `governance_violations`. Penyaringan hasil **bukan** "percobaan akses"; emisi governance tetap milik jalur buka-detail existing. `STABLE` (FR-3) adalah penegak mekanis.

**FR-33 [MUST NOT]** Tidak mem-persist raw query **maupun hash** query di tabel readable-user (rainbow-table pada domain kecil seperti nama karyawan).

**FR-34 [MUST]** Observability lewat logger seam terstruktur ke stdout/sink terpusat: JSON key-value, ber-`requestId`, hanya metrik agregat (jumlah query per aktor, latensi, jumlah scope yang mengembalikan hasil, panjang query sebagai angka). **[MUST NOT]** melog isi query, nama entity, atau PII. Penghitung per-aktor ini adalah kontrol kompensasi atas keputusan nol-emisi audit (BL10-OQ-09).

**FR-35 [MUST]** Grant per tanda tangan di setiap migrasi:
```sql
revoke execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  from public, anon, authenticated;
grant  execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  to authenticated;
```
`REVOKE ... FROM authenticated` saja tidak membatalkan grant PUBLIC (preseden 0066:22-31).

---

## 6. Data contracts

### 6.1 Taksonomi & label kanonik

Sumber nama = `PRD.md` §38 (pasca-rename 0045). `prd/03-sistem-permission-data-governance.md:213` masih memakai kosakata pra-0045 dan **diamandemen di PR-1** (kelas bug yang sama dengan BL-04).

`SEARCH_SCOPE_LABEL` — **satu peta kanonik, diuji snapshot**, urutan di bawah = urutan section di layar:

| `scope` | Label grup | Rilis |
|---|---|---|
| `goal` | Goal | PR-1 |
| `strategy` | Strategi | PR-1 |
| `initiative` | Inisiatif | PR-1 |
| `action_plan` | Rencana Aksi | PR-1 |
| `task` | Tugas | PR-1 |
| `task_instance` | Instansi Tugas | PR-3 |
| `development_area` | Area Pengembangan | PR-1 |
| `problem_statement` | Problem Statement | PR-1 |
| `people` | Orang | PR-2 |
| `comment` | Komentar | PR-3 |
| `chat` | Pesan | PR-1 |
| `evidence` | Bukti | PR-3 |
| `activity_log` | Log Aktivitas *(tanpa permission: Aktivitas Saya)* | PR-4 |
| `governance_violation` | Governance Violation *(tanpa permission: Catatan Governance Saya)* | PR-4 |

"Problem Statement" dan "Governance Violation" dipertahankan dalam bentuk aslinya karena keduanya adalah **istilah produk V1.83 di PRD**, bukan nama tabel.

### 6.2 Tanda tangan RPC (dibekukan)

```sql
create or replace function public.search_global(
  p_query            text,
  p_scopes           text[]      default null,   -- null = semua scope yang dirilis
  p_include_archived boolean     default false,
  p_limit            int         default 5,      -- per scope; clamp 1..30
  p_cursor_ts        timestamptz default null,   -- keyset; hanya sah bila p_scopes = 1 scope
  p_cursor_id        uuid        default null
)
returns table (
  scope     text,         -- salah satu dari 14 nilai §6.1
  id        uuid,         -- id baris sumber
  parent_id uuid,         -- target deep-link bila id sendiri bukan rute; null bila tak ada
  title     text,
  subtitle  text,         -- boleh null
  snippet   text,         -- <= 240 char, boleh null
  status    text,         -- boleh null
  sort_ts   timestamptz,  -- kunci keyset #1 (= created_at)
  sort_id   uuid          -- kunci keyset #2 (= id)
)
language plpgsql stable security definer set search_path = '';
```

**Tidak ada kolom `payload jsonb`.** Kolom jsonb tanpa kontrak adalah kanal serah-terima baris mentah yang akan membatalkan seluruh disiplin minimisasi §6.3.

Struktur body: satu subquery per scope dengan `order by created_at desc, id desc limit lim` **di dalam** subquery-nya sendiri (bukan satu `limit` di akhir UNION), digabung `union all`.

Cabang chat:
```sql
select 'chat', m.message_id, m.chat_room_id, m.room_name, m.author_name,
       left(m.snippet, 240), null, m.created_at, m.message_id
from public.search_chat_messages(q, null, lim, p_cursor_ts, p_cursor_id) m
```
> **Catatan terverifikasi:** `search_chat_messages` (0075:57) mengembalikan `cm.body as snippet` **utuh** — yang di-truncate 200 char di sana adalah **query**, bukan snippet. Truncation 240 char di proyeksi `search_global` karena itu wajib, bukan opsional.

### 6.3 Bentuk hasil per scope (whitelist)

| scope | field di-match | `title` | `subtitle` | `snippet` | `parent_id` |
|---|---|---|---|---|---|
| 7 card | `name` | `name` | — | — | null |
| `task_instance` | `tasks.name` induk **OR** `missed_reason` | nama Task induk | `instance_date` + status | `missed_reason` bila cocok | `task_id` |
| `people` | `full_name`, `position_title` | `full_name` | `position_title` | — | null |
| `comment` | `body` | nama entity induk | jenis induk | `body` (≤240) | `entity_id` (§6.4) |
| `chat` | `body` (via RPC) | `room_name` | nama pengirim | `body` (≤240) | `chat_room_id` |
| `evidence` | `file_name`, `text_content` | `file_name` atau "Catatan bukti" | nama Task/Instance induk | `text_content` (≤240) | `task_id` induk |
| `activity_log` | **nama entitas induk** (§6.3.1) | nama entitas induk | `action` mentah | — | `entity_id` |
| `governance_violation` | **nama entitas induk** (§6.3.1) | nama entitas induk | `violation_type` + severity | — | `entity_id` |

**Larangan keluaran (diuji negatif, AC-02):** `evidence_files.storage_path` dan `url`; `profiles.email`; `activity_logs.detail`; `governance_violations.resolution_note` (catatan admin tentang user — menjadikannya searchable oleh subjeknya adalah perubahan permukaan disclosure yang nyata, dan tidak diminta §38).

### 6.3.1 BL10-OQ-05 terjawab — scope audit dicocokkan lewat nama entitas induk

**Keputusan owner 2026-07-23.** Baris `activity_log`/`governance_violation` dicocokkan pada **nama entitas yang ditunjuk `entity_id`**, bukan pada `action`/`violation_type`.

Alasannya terukur, bukan preferensi. Di database nyata: `activity_logs` punya **733 baris tetapi hanya 11 `action` unik**, dan `create` sendiri **536 (73%)**. Mencocokkan pada `action` berarti mengetik "dibuat" mengembalikan **nol** (nilainya snake_case), sedangkan mengetik "create" mengembalikan **tiga perempat seluruh log** — itu dump, bukan pencarian. Menaruh peta label Indonesia di SQL juga ditolak: ia menduplikasi `GOVERNANCE_VIOLATION_TYPE_LABEL` di klien, dan gate CI BL-13 dipasang persis untuk mencegah peta itu menyimpang.

**Entitas diresolusi lewat identitas, bukan label.** `entity_type` mencampur literal warisan pra-0045 dengan literal baru, dan berbeda dari komentar (§6.4) di sini **ambigu untuk gating** — `strategy` bisa berarti tabel `strategies` (baru) atau `initiatives` (warisan), yang gate-nya berbeda. `entity_id` adalah UUID dan hanya ada di satu tabel, jadi tujuh `LEFT JOIN` menjawabnya tanpa menebak.

Efek samping yang diinginkan: **FR-11 fail-closed menjadi struktural.** Baris yang entitasnya tak dapat diakses — termasuk yang menunjuk tabel non-card seperti `period_snapshot`, dan yang `entity_id`-nya NULL — gugur lewat gate per-entitas, bukan lewat filter terpisah yang bisa lupa dipasang.

> [!warning] Konsekuensi pada cabang self-row FR-10 — batas yang harus diketahui
> Keputusan ini bertabrakan dengan FR-10 saat seorang aktor punya baris audit atas entitas yang **tidak berhak ia lihat**. FR-10 mengatakan self-row ikut RLS (baris itu miliknya); OQ-05 mengatakan yang ditampilkan adalah nama entitasnya. Menampilkan keduanya berarti **membocorkan nama entitas** kepada orang yang tidak berhak melihatnya.
>
> Search memilih **tidak bocor**: gate per-entitas berlaku juga pada cabang self-row. Konsekuensinya jujur dan disengaja — **Search bukan pengganti `/settings-activity-log`**. Layar itu tidak diubah dan tetap menampilkan self-row apa adanya (tanpa nama entitas). Yang dipersempit hanyalah permukaan Search.
>
> Dikunci `0088-DB-103` (tidak bocor) berpasangan dengan `0088-DB-104` (self-row tetap hidup saat entitasnya boleh dilihat) — tanpa pasangan itu, `DB-103` akan hijau pada implementasi yang keliru mematikan seluruh cabang self-row.

### 6.4 Normalisasi `entity_type` warisan

Rename 0045 **tidak memigrasi nilai data**. `comments_entity_type_check` (0046:43-51) mengizinkan campuran lama+baru.

**[MUST NOT]** memakai `map_legacy_entity_type` di jalur search: helper itu memetakan `action_plan→task` dan `strategy→initiative` tanpa bisa membedakan baris pra-0045 dari baris baru yang sah memakai literal sama.

Kontrak = tabel dispatch statis, disalin dari policy `comments_select` yang sudah berjalan. Ini **benar untuk gate** justru karena `action_plan` dan `task` sama-sama digate `can_access_task`:

| literal tersimpan | gate | rute deep-link |
|---|---|---|
| `action_plan` | `can_access_task(entity_id)` | `/task/{entity_id}` |
| `task` | `can_access_task(entity_id)` | `/task/{entity_id}` |
| `initiative` | `can_access_initiative(entity_id)` | rute inisiatif |
| `action_plan_instance` | `can_access_task((select task_id from task_instances where id=entity_id))` | `/task/instance/{entity_id}` |
| `task_instance` | idem | `/task/instance/{entity_id}` |
| lainnya / null | **tolak (fail-closed)** | — |

### 6.5 Perubahan skema

**Tidak ada tabel baru, kolom baru, atau policy baru.** Index (murni penambahan; `pg_trgm` sudah terpasang di skema `extensions`, 0054:42):

| index | ekspresi | PR |
|---|---|---|
| `idx_profiles_full_name_trgm` | `gin (full_name extensions.gin_trgm_ops)` | PR-2 |
| `idx_comments_body_trgm` | `gin (body extensions.gin_trgm_ops)` | PR-3 |
| `idx_evidence_files_file_name_trgm` | `gin (file_name extensions.gin_trgm_ops)` | PR-3 |
| `idx_evidence_files_text_content_trgm` | `gin (text_content extensions.gin_trgm_ops)` | PR-3 |

### 6.6 Kontrak TypeScript

File **baru** `mobile/src/lib/search.ts` (jangan tumpangkan ke `governance-admin.ts`):

```ts
export const SEARCH_SCOPES = [
  'goal','strategy','initiative','action_plan','task','task_instance',
  'development_area','problem_statement','people','comment','chat',
  'evidence','activity_log','governance_violation',
] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const SEARCH_SCOPE_LABEL: Record<SearchScope, string>;   // §6.1

export type SearchHit = {
  scope: SearchScope;
  id: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  status: string | null;
  sortTs: string;   // ISO timestamptz
  sortId: string;
};

export type SearchGlobalArgs = {
  query: string;
  scopes?: SearchScope[] | null;
  includeArchived?: boolean;
  limit?: number;              // per scope; server clamp 1..30
  cursorTs?: string | null;    // hanya sah bila scopes.length === 1
  cursorId?: string | null;
};

export async function searchGlobal(args: SearchGlobalArgs): Promise<SearchHit[]>;
/** Penyempit eksplisit; scope non-card mengembalikan null. */
export function cardScopeOf(scope: SearchScope): CardEntityType | null;
```

Hook: `useSearchGlobal` (queryKey `['search_global', query, scopes, includeArchived]`) dan `useSearchScopePage` (`useInfiniteQuery`, queryKey `['search_global_scope', scope, query]`). **Jangan** memakai ulang `['cards_search']` — key itu milik bersama layar Arsip (pelajaran BL-09c).

**Tidak berubah:** `CardEntityType`, `ENTITY_ROUTE_SEGMENT`, `push-route-resolver`, `SearchResult`, `searchCards`, `useSearchCards`, `settings-archive.tsx`.
`database.types.ts` diregenerasi setelah tiap migrasi.

---

## 7. Acceptance criteria

Lihat field `acceptance_criteria` (AC-01..AC-44). Ringkasan lapis uji:

- **DB contract test** (`supabase/tests/`, di atas `_fixtures.sql` dua organisasi): AC-01, 02, 03, 04, 05, 06, 07, 08, 10, 11, 12, 13, 21, 22, 23, 24, 25, 26, 27, 28, 32, 34, 35, 36, 37, 40, 43
- **Jest klien**: AC-09, 14, 15, 16, 17, 18, 19, 20, 29, 30, 31, 38, 39, 41, 42
- **Type-check / review diff**: AC-33, 44

Aturan cakupan test: **satu test per guard per scope** — bukan satu test "search jalan". Pelajaran regresi 0060→0075: `create or replace` penuh diam-diam mengembalikan body lama dan menghilangkan tiga guard sekaligus, lolos sampai ditangkap kontrak test 0044-DB-8.

---

## 8. Edge case & error state

| ID | Kondisi | Perilaku |
|---|---|---|
| EE-01 | Query kosong / 1 karakter | State awal instruktif; RPC tidak dipanggil; server tetap guard `length<2` |
| EE-02 | Query hanya `%` / `_` / whitespace | Setelah btrim + escape, dicari literal; bila nol → EE-03 |
| EE-03 | Hasil nol (sebab apa pun) | Copy tunggal identik (FR-17) + "Hapus pencarian" |
| EE-04 | Sebagian grup kosong | Grup tidak dirender; tanpa empty state per-grup |
| EE-05 | Akhir halaman satu grup | Footer `— akhir hasil —` (hanya untuk grup yang sudah punya hasil) |
| EE-06 | RPC belum di-apply (PGRST202) | Banner **global netral** + "Coba lagi"; tanpa nama scope |
| EE-07 | Error jaringan/5xx | `ErrorState` berbahasa tenang + "Coba lagi" (retry query, bukan reload layar) |
| EE-08 | Error saat memuat halaman berikutnya | Hasil yang sudah tampil **tidak hilang**; footer grup itu menampilkan aksi coba-lagi inline; grup lain tidak terpengaruh |
| EE-09 | Cursor menunjuk baris yang sudah terhapus | Keyset `(created_at,id) <` tetap menghasilkan halaman berikutnya yang benar — tidak ada error, tidak ada reset ke awal |
| EE-10 | Baris Activity Log di luar retensi 12 bulan (`purge_old_activity_logs`, aktif 2026-08-06) | Tidak pernah muncul; karena baris audit non-tappable (FR-28), tidak ada deep-link rusak |
| EE-11 | Query berubah cepat | Hanya respons untuk query terakhir dirender; hasil lama diganti skeleton |
| EE-12 | Sesi/token kadaluwarsa | Jalur auth existing; tidak ditangani khusus oleh Search |
| EE-13 | Offline | React Query mengembalikan cache terakhir bila ada; bila tidak → EE-07 |
| EE-14 | Pencabutan akses mid-sesi | `staleTime=0` (FR-26); label tidak pernah menyimpang dari isi baris yang dirender; invalidasi realtime non-chat = debt (BL10-OQ-12) |

**Tidak ada `AccessDenied` di layar Search** — berbeda dari `settings-activity-log.tsx`. Search terbuka untuk semua user; penolakan per-scope diwujudkan sebagai ketiadaan grup.

**Perangkap test yang sudah diketahui:** menekan `Pressable` ber-`active:` di jest membuat render tes **berikutnya** kosong — urutkan tes, jangan mendebug komponennya (memori proyek `rn-css-pressable-test-blank-render`).

---

## 9. Rencana pengiriman (kanonik — satu-satunya versi)

Grouping ikut PR-1 tanpa pengecualian: memangkas scope punya pembenaran rilis, "tanpa grouping" tidak punya pembenaran produk apa pun.

| PR | Migrasi | Isi | Alasan urutan | Cakupan |
|---|---|---|---|---|
| **PR-1** | `0085_search_global.sql` | `search_global` + 7 scope card + `chat` (delegasi) + grouping + paging per-grup + anti-oracle + layar Search ditulis ulang + amandemen dokumen | Nol permukaan otorisasi baru: 7 card menyalin gate `search_cards` yang sudah ada, chat mendelegasi ke RPC yang sudah lolos review + contract test. Sekaligus memperbaiki bug LIKE-escaping. | 9/14 |
| **PR-2** | `0086_search_global_people.sql` | `people` + index trgm | Gate paling sederhana (`profiles_select_same_org`, tanpa permission gate). Menutup utang FR-8.5.3 — **perbaikan FR Fase 8 yang meleset, bukan fitur baru** | 10/14 |
| **PR-3** | `0087_search_global_derived.sql` | `task_instance` + `comment` + `evidence` + 3 index trgm | Mewarisi `can_access_task`/`can_access_action_plan` yang sudah confidential-aware pasca-0077. Butuh sign-off BL10-OQ-03 (bukti draft) | 13/14 |
| **PR-4** | `0088_search_global_admin.sql` | `activity_log` + `governance_violation` + ekstraksi peta label | Terakhir: dua keputusan owner belum final (BL10-OQ-01, BL10-OQ-02), definisi match belum ada (BL10-OQ-05), menyentuh tabel append-only yang tidak bisa dikoreksi bila salah | 14/14 |

Scope yang belum dirilis **tidak dirender sebagai grup kosong** (AC-16) — ketiadaan grup tidak dapat dibedakan dari nihil hasil.

Setiap PR menyertakan contract test FR-43 untuk scope yang ia tambahkan.

---

## 10. Amandemen dokumen (wajib ikut PR-1)

1. `prd/03-sistem-permission-data-governance.md:213` — taksonomi 14 scope diselaraskan ke `PRD.md` V1.83 (KPI Area → Strategy, Action Plan Instance → Task Instance).
2. `specs/search-pesan-inbox.md` §1.3/FR-1 — catat pembalikan "Global Search tidak dibebani cakupan pesan V1" beserta tanggal. Ini jalur yang memang direncanakan ("debt Global Search"), tapi harus tertulis agar tidak ada dua spec yang saling menyangkal.
3. `specs/search-pesan-inbox.md` §8 (catatan 2026-07-12 "chat tidak memodelkan confidential per-room") — ditandai **stale**, dibalik OWNER-A 2026-07-15 + migrasi 0060. Alasan reuse yang benar: gate confidential sudah ditegakkan **di dalam** RPC-nya.
4. `mobile/src/app/(app)/search.tsx:1` — komentar "RLS-scoped via RPC" dikoreksi menjadi "SECURITY DEFINER; gate inline, RLS tidak berlaku".
5. `wiki/entities/database-blueprint.md` — dokumentasikan `search_global` (dan `search_cards`, yang belum ada di blueprint sama sekali).
6. `wiki/concepts/permission-model.md:31` — akui cabang self-row pada kedua policy audit.
7. `wiki/concepts/feature-gap-backlog.md` — BL-10 dipecah menjadi BL-10a..BL-10d sesuai §9.

---

## 11. Catatan koreksi terhadap sumber

Klaim-klaim berikut beredar di draft awal dan **tidak didukung kode** — jangan dikutip ulang:

- **"PRD §31 UX-4 (PRD.md:1417)"** salah alamat, dan isinya mengatur **shortcut menu** ("Staff biasa tidak melihat Log Aktivitas sistem sebagai shortcut utama"), bukan hasil Search. Aturan menyembunyikan grup kosong berdiri sendiri di atas anti-oracle §38 — jangan disandarkan pada kutipan yang tidak menopangnya.
- **"Activity Log & Governance Violation adalah data admin"** tidak akurat: kedua policy ber-OR dengan self-row (0005:557-565).
- **"Snippet chat sudah ≤240 char, preseden Chat"** salah: `search_chat_messages` mengembalikan `cm.body` utuh (0075:57).
- **"90 hari terakhir untuk Task Instance"** tidak punya dasar sumber mana pun dan dihapus dari spec (lihat BL10-OQ-07).
- **"staleTime 15 detik"** juga angka tanpa sumber; diganti `staleTime = 0` (FR-26).

---

## 12. Handoff ke TDD

**Fitur (untuk `/tdd-plan`):** lihat field `tdd_handoff.feature`.

**Urutan red-green yang disarankan untuk PR-1:**

1. **DB merah dulu** — tulis `supabase/tests/0085_search_global_contract.sql` sebelum migrasi: assert eksistensi fungsi + `provolatile='s'` + `proconfig` + daftar kolom keluaran + ACL. Semuanya merah karena fungsi belum ada.
2. **Guard biaya** — test `length<2`, truncation 200 char, escape `%`/`_`/`\`, clamp 1..30. Implementasi minimal: kerangka fungsi + guard, mengembalikan 0 baris.
3. **Per scope card, satu per satu** — test positif → test negatif (0 baris, bukan error) → test lintas-org → test reduksi-RLS. Baru tambahkan cabang UNION-nya.
4. **Cabang chat** — test delegasi (ubah perilaku `search_chat_messages` → hasil `search_global` ikut berubah) + test truncation 240 char.
5. **Cursor** — test exception bentuk-request untuk multi-scope + test tidak ada duplikasi di batas halaman.
6. **Klien** — `search.ts` (peta label snapshot) → hook → layar. Test UI paling penting duluan: grup nol-hasil tidak dirender, empty state identik untuk dua sebab, tanpa count.
7. **Regresi** — jalankan test layar Arsip dan `push-route-resolver.test.ts` tanpa modifikasi apa pun; keduanya harus hijau (bukti NG-6 dan NG-7 dipatuhi).

**Blocker sebelum PR-3 dan PR-4:** BL10-OQ-03 (PR-3); BL10-OQ-01, BL10-OQ-02, BL10-OQ-04, BL10-OQ-05 (PR-4). PR-1 dan PR-2 **tidak diblokir** oleh open question mana pun.

**Paths:** lihat field `tdd_handoff.paths`.
