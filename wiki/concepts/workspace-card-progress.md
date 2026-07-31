---
type: concept
tags: [database, performance, workspace, progress, attainment, rpc, migration-0102, migration-0118, recursive-rollup, benchmark]
updated: 2026-07-31
sources: 0
---

# Workspace Card Progress — Rollup Capaian & Push-Down Perf

`public.workspace_card_progress(p_card_ids uuid[]) RETURNS TABLE(card_id uuid, progress int, is_measured bool)` adalah **server rollup tunggal** untuk angka orb tiap card tree Workspace (lihat [[workspace-progress-orb-tdd-plan]]). `LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''`, dipanggil via PostgREST, `GRANT EXECUTE` hanya `authenticated` (PUBLIC/anon di-revoke).

## Evolusi

- **0037** (WSA-15, V1.82): rollup awal `% anak langsung berstatus done`.
- **0070 / 0074** (attainment-aware v2): tambah kolom `is_measured`. Cabang **Goal** = rata-rata `clamp(0..100)` capaian per Strategy terukur (status `active`/`done`, `target_numeric > 0`); cabang **Strategy** = capaian sendiri vs target; fallback ke status-rollup saat tak ada sinyal terukur (`is_measured=false`).
- **0102** (push-down perf, [PR #192](https://github.com/nawawi489/RencanApp/pull/192)): filter `strategy_id` didorong ke agregat current-values. **Nol perubahan output.**
- **0118** (rollup rekursif Initiative & Action Plan / "Opsi B", [PR #228](https://github.com/nawawi489/RencanApp/pull/228)): level **Action Plan** dan **Initiative** beralih dari `%-anak-done` ke **rata-rata tak berbobot progress anak**. Level lain (Goal/Strategy attainment, Problem Statement, Development Area) tak berubah.

## Masalah perf (pra-0102)

Kedua cabang attainment mereferensikan view `public.strategy_current_values` (didefinisi 0045, `security_invoker=true` sejak 0064). View itu **tidak punya filter per-strategy** — tiap referensi meng-agregat **SELURUH approved result set** organisasi:

```sql
SELECT rv.strategy_id, sum(...) FROM public.task_result_values rv
  JOIN public.task_submissions s ON s.id = rv.submission_id
  WHERE s.review_status = 'approved' AND rv.strategy_id IS NOT NULL
  GROUP BY rv.strategy_id;
```

Jadi request 1-card pun memaksa agregasi berkelompok penuh atas semua approved submission, lalu hash-join ke segelintir card. Biayanya tumbuh seiring **total approved submission**, lepas dari isi `p_card_ids` — mendominasi begitu approved submission menembus ribuan.

## Fix — push-down (0102)

Inline agregat `numeric_total` yang **sama persis** sebagai CTE, dibatasi ke strategi yang benar-benar di-join kedua cabang:

```sql
strategies WHERE id = ANY(p_card_ids) OR goal_id = ANY(p_card_ids)
```

Set ini adalah **superset persis** dari `strategy_id` yang bisa dicocokkan `scv.strategy_id = st.id` (cabang Strategy: `st.id ∈ ids`; cabang Goal: `st.goal_id ∈ ids`). Menyaring input agregat by `strategy_id` tidak mengubah `sum` strategi mana pun yang dipertahankan, dan setiap strategi yang di-join dipertahankan → output byte-for-byte identik. Scan terbatas dilayani indeks parsial `idx_task_result_values_strategy` (`btree(strategy_id) WHERE strategy_id IS NOT NULL`).

View `strategy_current_values` **tidak diubah** (caller lain bergantung padanya) — push-down hanya hidup di dalam fungsi. `CREATE OR REPLACE` (tanpa `DROP`) → ACL & return shape terjaga; grant di-reassert eksplisit (`authenticated`).

## Rollup rekursif Initiative & Action Plan (Opsi B, 0118)

Sebelum 0118, Action Plan (AP) dan Initiative dirollup lewat cabang status (`round(100 * anak_done / total_anak)`) — menjawab "berapa anak selesai", bukan "seberapa jauh pekerjaan berjalan". Sebuah AP dengan Tugas 50%/80% tetap terbaca 0% sampai tiap Tugas jadi `done`. Opsi B mengganti kedua level itu dengan **rata-rata tak berbobot progress anak**, mencerminkan heuristik klien di `mobile/src/lib/progress.ts` (satu sumber kebenaran mapping status→progress — RPC harus meniru, bukan menyimpang):

- **Leaf Tugas** (`task_progress`): `one_time` → mapping status (`draft`/`archived`/`cancelled`/tak dikenal `0`, `assigned 10`, `revision 30`, `in_progress 50`, `submitted 80`, `done 100`); `repeat` → **Repeat Compliance** = `round(100 * done / total)` atas **task_instances non-archived** (all-time; **tanpa** gerbang `submitted_late`, **tanpa** period-scoping — beda dari ekspresi skor 0100). Tanpa instance → `0`.
- **Action Plan** (`ap_progress`) = `avg(coalesce(task,0))` atas Tugas non-archived; AP tanpa Tugas → `0`.
- **Initiative** (`initiative_progress`) = `avg(ap_progress)` atas AP non-archived; Initiative tanpa AP → `0`.
- **Presisi (OQ-3)**: progress dibawa `numeric` presisi penuh antar level; `round()` **hanya** di batas output (`round(coalesce(m, ip, app, sr, 0))::int`). Rata-rata tak berbobot, **bukan** `sum(done)/sum(all)`.

**Isolasi (kritis).** Hanya pid Initiative/AP yang beralih ke rata-rata rekursif. Node type `action_plans` dirollup **berbeda tergantung induk**: saat **Initiative** bertanya → rata-rata rekursif; saat **Problem Statement** bertanya → tetap `%-AP-done` (count-done). Development Area (→ Problem Statement) dan Goal/Strategy attainment juga tak tersentuh. `is_measured` tetap `true` **hanya** untuk attainment — progress rekursif AP/Initiative `is_measured=false`.

**Confidential aman (SECURITY INVOKER).** Fungsi tetap invoker: RLS `task_instances`/`task_submissions` (gerbang `can_access_task`) berlaku per pemanggil, jadi instance rahasia yang tak boleh dilihat **tak bocor** ke rata-rata — dua pemanggil beda visibilitas melihat agregat parsial berbeda (bukan angka penuh). `tasks_select` sendiri workspace-wide, jadi kebocoran hanya mungkin di level instance (Tugas repeat) — itulah yang diuji.

`CREATE OR REPLACE` (tanpa `DROP`), **return shape & signature tak berubah** → `database.types.ts` byte-identik (gate drift CI hijau), ACL di-reassert (`authenticated`; `PUBLIC`/`anon` revoke). Cabang attainment (Goal/Strategy) + `scv`/`relevant_strategies`/`status_rollup` disalin **byte-for-byte** dari 0102. Kontrak: `supabase/tests/0118_recursive_rollup_contract.sql` (14 blok, termasuk attainment byte-for-byte & kebocoran confidential level-instance).

Klien: header detail **Inisiatif** & **Rencana Aksi** (`initiative/[id].tsx`, `action-plan/[id].tsx`) kini menarik angka orb dari RPC ini via `useCardProgress` agar sinkron dengan orb tree — bukan lagi heuristik `ratioDoneOfChildren` klien.

### Benchmark (0118 vs 0102)

`scripts/ops/benchmark-workspace-card-progress-0118.sql` — seed org disposable (~210 initiative, ~1.6K AP, ~12K task, ~48K instance), timing kedua badan fungsi (0118 rekursif vs 0102 count-done) pada data IDENTIK, batch size digrounding dari pemanggilan nyata `use-workspace.ts` (Initiative/AP selalu "anak satu parent expanded" — kecil; hanya Goal/Development-Area yang fetch flat org-wide, level itu tak tersentuh 0118).

**Hasil ringkas (5 iterasi, median dari 4 sampel non-warm-up per skenario):**

| Skenario | batch | 0118 (median) | 0102 (median) | Rasio |
|---|---|---|---|---|
| 1 initiative / 1 AP tipikal | 1 | ~640 ms | ~280 ms | 2.3x |
| initiative 1 Strategy | 30 | ~470 ms | ~440 ms | 1.1x |
| AP 1 initiative | 50 | ~600 ms | ~600 ms | 1.0x |
| **semua initiative org (stress)** | 210 | 2.1 s | 2.2 s | 0.95x |
| **semua AP org (stress)** | 1573 | **~100 s** | **~14 s** | **~7x** |

**Interpretasi jujur — bacaan mixed:**

- Semua skenario "batch UI nyata" (single card, satu Strategy expanded, satu Initiative expanded) berada di rentang wajar untuk rollup server (600 ms atau lebih baik). Detail-page dan tree yang di-batching per parent expanded tidak terpengaruh regresi.
- Stress case "semua AP org sekaligus" (1573 AP dalam satu call) **sekitar 7x lebih lambat** di bawah 0118 dibanding 0102 dan tidak stabil (variance tinggi antar-run pada data identik). `EXPLAIN` internal (via `WITH … AS MATERIALIZED` probe atas badan CTE langsung) menunjukkan 97% runtime dihabiskan `Index Scan using idx_task_instances_task on task_instances` dengan filter `can_access_task(task_id)` — RLS SECURITY DEFINER dipanggil per baris instance (45K+ evaluasi). 0102 tak pernah menyentuh `task_instances`, jadi tak membayar biaya ini.
- **Pemanggilan klien saat ini tidak pernah mengirim batch sebesar ini** — `useCardProgress` di `mobile/src/hooks/use-workspace.ts` selalu "children of one expanded parent" (single/low-double-digit). Jadi regresi stress-case bukan degradasi UX yang teramati, tapi **latent risk** kalau UI di masa depan pernah mem-batch flat org-wide untuk Initiative/AP.
- Percobaan mitigasi (`WITH … AS MATERIALIZED` pada `relevant_ap`/`task_progress`/`ap_progress`/`initiative_progress`) **tidak menurunkan waktu stress case** — implying planner sudah memilih materialization, atau `can_access_task` per-instance memang bottleneck yang materialization tak sembunyikan. Optimasi lebih dalam (misal: guard visibility di level AP dulu, atau ambil `task_id` set ter-authorize dalam satu pass) memerlukan investigasi terpisah — bukan blocker rilis, di-defer.

> [!warning] Timing tepat setelah bulk-seed tanpa `ANALYZE` bisa memberi hasil SANGAT berbeda (bukan sekadar noise)
> Sebuah run intermediate benchmark ini (tanpa `ANALYZE` eksplisit sebelum timing) melaporkan angka SANGAT lebih rendah dari yang direplikasi berulang setelahnya — sempat memicu kesimpulan sementara "tidak ada regresi". Bila di-`ANALYZE` sebelum timing DAN diulang beberapa run, angka konsisten dengan tabel di atas. Pelajaran: (a) `ANALYZE` sebelum timing tepat pasca bulk-insert non-negotiable, (b) satu run hijau ≠ tidak ada regresi — reproduksi wajib.

> [!warning] Kejutan **hand-typed function body** di ops script
> Fungsi `LANGUAGE SQL` menyimpan komentar sebagai bagian `prosrc` (bukan cuma didokumentasi). Hand-copied "restore body" yang menghilangkan komentar akan hash BEDA dari file migrasi walau logic-nya identik. Ops script `scripts/ops/benchmark-workspace-card-progress-0118.sql` restore lewat body byte-exact dari migrasi + integrity check `raise exception` bila hash tak cocok — kalau gagal, restore dari file migrasi otoritatif (`supabase/migrations/0118_….sql`), jangan diedit tangan.

## Gotcha durable

> [!warning] View agregat tanpa parameter = hitung ulang seluruh dataset tiap referensi
> View SQL yang meng-agregat tabel besar tanpa filter akan menghitung ulang **seluruh** dataset setiap kali direferensikan, walau pemanggil hanya butuh beberapa baris. Bila kunci join pemanggil (di sini `strategy_id`) bisa diturunkan di dalam fungsi, dorong filter ke agregat inline (CTE) dan biarkan indeks membatasinya. **Jangan ubah view-nya** — caller lain mungkin bergantung.

## Verifikasi ekuivalensi (wajib untuk perubahan angka user-visible)

Read-only di `begin … rollback` pada staging: badan migrasi **persis** diterapkan ke fungsi live, lalu diff tiap kolom OLD vs NEW atas **37 card nyata** (goal/strategy/initiative/action_plan/dev-area/problem_statement) + kasus adversarial berseed (agregasi non-nol, filter `value_type`, eksklusi strategi luar-scope) → **0 mismatch**. `EXPLAIN` mengonfirmasi agregat kini terbatas `strategy_id`. `has_function_privilege` (`authenticated`/`anon`/`service_role`) identik sebelum/sesudah. Staging tetap bersih (semua di-rollback).

Berkaitan dengan: [[workspace-progress-orb-tdd-plan]], [[database-blueprint]], [[architecture]], [[execution-loop]].
