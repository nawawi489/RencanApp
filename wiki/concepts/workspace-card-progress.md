---
type: concept
tags: [database, performance, workspace, progress, attainment, rpc, migration-0102]
updated: 2026-07-25
sources: 0
---

# Workspace Card Progress — Rollup Capaian & Push-Down Perf

`public.workspace_card_progress(p_card_ids uuid[]) RETURNS TABLE(card_id uuid, progress int, is_measured bool)` adalah **server rollup tunggal** untuk angka orb tiap card tree Workspace (lihat [[workspace-progress-orb-tdd-plan]]). `LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''`, dipanggil via PostgREST, `GRANT EXECUTE` hanya `authenticated` (PUBLIC/anon di-revoke).

## Evolusi

- **0037** (WSA-15, V1.82): rollup awal `% anak langsung berstatus done`.
- **0070 / 0074** (attainment-aware v2): tambah kolom `is_measured`. Cabang **Goal** = rata-rata `clamp(0..100)` capaian per Strategy terukur (status `active`/`done`, `target_numeric > 0`); cabang **Strategy** = capaian sendiri vs target; fallback ke status-rollup saat tak ada sinyal terukur (`is_measured=false`).
- **0102** (push-down perf, [PR #192](https://github.com/nawawi489/RencanApp/pull/192)): filter `strategy_id` didorong ke agregat current-values. **Nol perubahan output.**

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

## Gotcha durable

> [!warning] View agregat tanpa parameter = hitung ulang seluruh dataset tiap referensi
> View SQL yang meng-agregat tabel besar tanpa filter akan menghitung ulang **seluruh** dataset setiap kali direferensikan, walau pemanggil hanya butuh beberapa baris. Bila kunci join pemanggil (di sini `strategy_id`) bisa diturunkan di dalam fungsi, dorong filter ke agregat inline (CTE) dan biarkan indeks membatasinya. **Jangan ubah view-nya** — caller lain mungkin bergantung.

## Verifikasi ekuivalensi (wajib untuk perubahan angka user-visible)

Read-only di `begin … rollback` pada staging: badan migrasi **persis** diterapkan ke fungsi live, lalu diff tiap kolom OLD vs NEW atas **37 card nyata** (goal/strategy/initiative/action_plan/dev-area/problem_statement) + kasus adversarial berseed (agregasi non-nol, filter `value_type`, eksklusi strategi luar-scope) → **0 mismatch**. `EXPLAIN` mengonfirmasi agregat kini terbatas `strategy_id`. `has_function_privilege` (`authenticated`/`anon`/`service_role`) identik sebelum/sesudah. Staging tetap bersih (semua di-rollback).

Berkaitan dengan: [[workspace-progress-orb-tdd-plan]], [[database-blueprint]], [[architecture]], [[execution-loop]].
