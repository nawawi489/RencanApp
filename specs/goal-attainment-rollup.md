# Spec: Kuantifikasi Capaian Goal via % Attainment Roll-up (P1)

Status: **DRAFT — siap /tdd-plan** (disusun via /sdd-plan, 2026-07-18).
Sumber kebenaran eksekusi. Bila bertabrakan dengan PRD/Wiki lama soal makna "Capaian", **dokumen ini menang** (lihat Supersede di §1).

---

## 0. Ringkasan Eksekutif

Orb Goal & Strategi di pohon Workspace berlabel **"Capaian X%"**, tetapi angkanya berasal dari RPC `workspace_card_progress` yang menghitung **% anak berstatus `done`** (status-rollup) — bukan pencapaian numerik terhadap target. Ini satu-satunya angka di aplikasi yang berbohong, tentang hal yang jadi nama produk.

Fitur ini mengubah orb Goal & Strategi agar menampilkan **% attainment numerik nyata** bila kartu **terukur** (`target_numeric > 0`), dan jatuh ke label netral **"Progress"** (status-rollup lama) bila **kualitatif**. Capaian Goal dihitung sebagai **rata-rata sederhana** attainment Strategi anak yang terukur & RLS-visible. Goal tidak mendapat kolom/target sendiri.

Perubahan bersifat **read-path only**. Satu-satunya perubahan tulis adalah **redefinisi RPC** `workspace_card_progress` menjadi attainment-aware + rekonsiliasi UI + satu perbaikan invalidasi cache.

---

## 1. Problem, Tujuan & Non-Goals

### Problem
- **Label kind-based, bukan data-driven.** `treeOrbLabel(kind)` ([progress.ts:54](../mobile/src/lib/progress.ts)) memberi `'Capaian'` untuk semua kartu `goal`/`strategy` tanpa memeriksa apakah terukur.
- **Nilai = % status, bukan % attainment.** RPC live ([0046:2681-2742](../supabase/migrations/0046_rewrite_bodies_and_policies.sql)) menghitung `% anak done`. Sebuah Goal bisa "Capaian 100%" karena semua anak `done`, padahal realisasi numeriknya jauh di bawah target.
- **Jalur presisi sudah ada tapi hanya di sebagian permukaan.** Detail Strategi ([strategy/[id].tsx](../mobile/src/app/(app)/strategy/[id].tsx)) & Home `listKpiNeedsAttention` ([home.ts](../mobile/src/lib/home.ts)) sudah memakai `computeKpiGap` ([strategy-gap.ts](../mobile/src/lib/strategy-gap.ts)) atas view `strategy_current_values`. Orb pohon & header detail masih tertinggal pada status-rollup.

### Tujuan
1. Orb Goal & Strategi menampilkan attainment numerik jujur bila terukur; label netral "Progress" bila kualitatif.
2. Capaian Goal = **mean sederhana** `computeKpiGap.percent` Strategi anak **terukur & RLS-visible**. Goal tidak menyimpan target apa pun.
3. Perbaiki orb Strategi sekalian (bukan Goal-only) → konsisten dengan detail Strategi + Home.
4. `treeOrbLabel` menjadi **data-driven** lewat flag `is_measured` dari RPC.
5. Sublabel cakupan pada Goal (mis. "3/5 Strategi terukur") agar rata-rata tidak dibaca sebagai representasi seluruh anak.
6. **Rekonsiliasi**: header detail Goal & Strategi memakai sumber attainment yang **sama** dengan orb pohon — tidak boleh ada dua angka "Capaian" berbeda untuk kartu yang sama.

### Non-Goals (eksplisit)
- **Tidak menambah kolom/target ke Goal.** Tidak ada `ALTER TABLE goals`, tidak ada `target_numeric` Goal, tidak ada field baru form "New Goal", tidak ada override PRD §17. `goals.target_value` (text) tidak disentuh.
- **Bukan weighted average.** Mean sederhana. Tidak ada kolom `weight` (ditolak di RWT non-goal).
- **Tidak menyentuh** `strategy_target_breakdowns` / `contribution_pct`.
- **Read-path only.** Tidak memmaterialisasi/menyimpan capaian ke tabel mana pun.
- **RPC tetap `SECURITY INVOKER`.** Tidak pernah `DEFINER`.
- **Home `listGoalNeedsAttention` = OUT of V1** (P2 fast-follow — lihat §9).
- **Tidak mengubah `computeKpiGap`** (dipakai apa adanya).

> [!warning] Supersede keputusan 2026-07-03
> `workspace-progress-orb-tdd-plan.md` (2026-07-03) menetapkan "Capaian & Progress berbagi rumus %done". **DIGANTIKAN** oleh spec ini: "Capaian" kini = % attainment numerik nyata; "%done" hanya bertahan sebagai fallback **dan wajib dilabeli "Progress"**, bukan "Capaian".

> [!note] Divergensi dari PRD §14 (bukan regresi)
> Prototype PRD §14 menampilkan Goal "Target bulan 4M / Aktual 3.1M / Capaian 68%" dan Strategy orb "65%" tanpa label. Angka Goal kini **derivasi agregat** dari Strategi anak (bukan field), dan orb Strategi kini **berlabel** Capaian/Progress. QA jangan menandai "68% hilang" atau "label baru" sebagai bug.

---

## 2. Keputusan yang Sudah Terkunci (owner) + yang Diselesaikan Spec

### Terkunci owner (jangan relitigasi)
| # | Keputusan |
|---|---|
| D1 | Capaian Goal = mean sederhana attainment Strategi terukur; Goal tak dapat kolom/target sendiri. |
| D2 | Perbaiki orb Strategi sekalian. |
| D3 | Weighted average OUT. |
| D4 | Fallback: kualitatif → "Progress"; terukur → "Capaian"; sublabel Goal "n/m Strategi terukur". |
| D5 | `treeOrbLabel` data-driven; RPC kembalikan sinyal numerik-vs-status. |

### Diselesaikan spec (default masuk akal, **reversible** — angkat ke owner bila ingin ubah)
| # | Isu | Keputusan spec | Alasan |
|---|---|---|---|
| S1 | Clamp raw vs clamped | **Clamp per-child ke 0..100 SEBELUM mean** | Jaga domain orb & tone; cegah 1 over-achiever (300%) menutupi 3 laggard. Konsisten dgn clamp `fetchCardProgress`. |
| S2 | Bentuk RETURN RPC | **`progress int` + `is_measured boolean`** (tanpa kolom `kind`) | Aman utk parser by-name PostgREST; `kind` sudah diketahui klien per-row. |
| S3 | Header detail vs orb pohon | **Header detail Goal & Strategi pakai sumber attainment SAMA dgn pohon** (RPC) | Cegah dua angka "Capaian" berbeda. |
| S4 | Invalidasi cache | **Approve/reject Nilai Hasil → `invalidateQueries(['workspace_card_progress'])`** (global, V1) | Tutup gap stale; granular = optimasi P2. |
| S5 | Visibilitas n & m | **n & m dari predikat RLS yang SAMA** (`strategies_select`); Strategi row-visible tapi `numeric_total` NULL → `current=0` → attainment 0%, tetap dihitung di n & m | Tidak pernah membocorkan nilai tersembunyi (NULL→0). |
| S6 | Populasi status | Himpunan terukur mengikuti `status IN ('active','done')` — draft dikecualikan (O4 DECIDED) | Cegah draft tanpa nilai menekan mean; aktif & selesai = status bermakna. |
| S7 | DROP CASCADE? | **DROP tanpa CASCADE** + verifikasi `pg_depend` | Tak ada dependen pada RPC ini; CASCADE di 0046 hanya krn batch 62 fungsi. |

### Residual — DIPUTUSKAN owner 2026-07-18
- **O1 — DECIDED: pertahankan S1** (clamp per-child 0..100 sebelum mean). Over-achievement tidak mengangkat mean.
- **O2 — DECIDED: tidak ada penjelasan UI divergensi antar-peran di V1.**
- **O3 — ACKNOWLEDGED: gap CI diketahui.** Wire pgTAP/SQL tests atau advisor `security_definer_view` ke CI adalah **task infra terpisah** (bukan bagian P1). Untuk P1: contract test dijalankan **manual** (§8).
- **O4 — DECIDED: populasi mean = `status IN ('active','done')`** — Strategi `status='draft'` dikecualikan. Draft terukur tanpa nilai approved tidak lagi menekan mean ke 0%. Goal yang semua Strategi terukurnya draft → `is_measured=false` → label "Progress".

---

## 3. User Stories

- Sebagai **CEO/Owner**, saya ingin orb "Capaian" menampilkan attainment numerik nyata, supaya keputusan strategis berpijak pada realisasi terukur, bukan proxy penyelesaian tugas.
- Sebagai **Manager**, saya ingin orb Strategi terukur konsisten dengan kartu "Capaian vs Target" di detail Strategi (satu angka, bukan dua).
- Sebagai **PIC/Staff**, saya ingin label membedakan "Capaian" (hasil terukur) vs "Progress" (kemajuan status), supaya tidak salah tafsir.
- Sebagai **CEO/Owner**, saya ingin Goal campuran (sebagian terukur, sebagian kualitatif) menampilkan Capaian numerik dari Strategi terukur saja + sublabel "3/5 Strategi terukur".
- Sebagai **Staff**, saya menerima Capaian Goal yang saya lihat bisa berbeda dari peran lain karena RLS memfilter Strategi yang terlihat — ini keamanan yang disengaja, bukan bug (keputusan owner 2026-07-03).

---

## 4. Functional Requirements

### A. Attainment per-Strategi
- **FR-1.** Attainment Strategi = `clamp(0, 100, round(100 * coalesce(numeric_total, 0) / target_numeric))`. `numeric_total` dari view `strategy_current_values` (approved-only), `target_numeric` dari `strategies`.
- **FR-2.** Strategi **terukur** ⇔ `target_numeric IS NOT NULL AND target_numeric > 0`. (CHECK hanya `>= 0`, jadi `0` **wajib** diguard — `0` = kualitatif.)
- **FR-3.** Strategi terukur tanpa nilai approved (view kosong) → `current = 0` → attainment **0%** (bukan `—`, bukan di-exclude).
- **FR-4.** `is_measured` server ≡ `computeKpiGap(...).hasTarget` klien. **Satu definisi**; orb (server) dan kartu detail (klien) tidak boleh beda klasifikasi.

### B. Roll-up Goal
- **FR-5.** Capaian Goal = **mean aritmetika** attainment (FR-1, sudah di-clamp per-child) atas Strategi anak **terukur & RLS-visible**, `round` ke integer.
- **FR-6.** Numerator & denominator (n, m) hanya dari himpunan **RLS-visible** (S5). Tidak ada existence leak.
- **FR-7.** Goal dengan **0** Strategi terukur RLS-visible → fallback **status-rollup lama** + label **"Progress"**.
- **FR-8.** Goal dengan ≥1 Strategi terukur RLS-visible → attainment numerik + label **"Capaian"**.

### C. Kontrak RPC
- **FR-9.** RPC `workspace_card_progress(p_card_ids uuid[])` → `RETURNS TABLE(card_id uuid, progress int, is_measured boolean)`.
- **FR-10.** Semantik `progress` per-kartu:
  - Goal terukur → mean attainment (FR-5), `is_measured = true`.
  - Goal nol-terukur → status-rollup lama, `is_measured = false`.
  - Strategi terukur → attainment dirinya (FR-1), `is_measured = true`.
  - Strategi kualitatif → status-rollup lama, `is_measured = false`.
  - `initiative`/`action_plan`/`task`/`development_area`/`problem_statement` → status-rollup lama **persis** (tidak berubah), `is_measured = false`.
- **FR-11.** RPC **WAJIB** `SECURITY INVOKER` **eksplisit** + `SET search_path = ''`. **WAJIB** `GRANT EXECUTE ... TO authenticated` + `REVOKE EXECUTE ... FROM PUBLIC, anon` (DROP+CREATE mereset ACL ke PUBLIC — [0062:26-28](../supabase/migrations/0062_revoke_authenticated_internal_rpcs.sql)).
- **FR-12.** 6 cabang `child_status` status-rollup **disalin verbatim** dari [0046:2692-2727](../supabase/migrations/0046_rewrite_bodies_and_policies.sql) (jangan rewrite dari ingatan; jebakan drift: `problem_statement → action_plans` via `problem_statement_id`).

### D. Klien (label & orb)
- **FR-13.** `treeOrbLabel(kind, isMeasured)` — `(kind === 'goal' || kind === 'strategy') && isMeasured` → "Capaian"; selain itu "Progress".
- **FR-14.** `fetchCardProgress` mengembalikan `progress` + `isMeasured`. Hook `useCardProgress` mengekspos **`progressOf(id): number | null`** (tak berubah) **+ `measuredOf(id): boolean`** baru — supaya 7 callsite orb tidak pecah (lihat §6).
- **FR-15.** Sublabel cakupan Goal: **"n/m Strategi terukur"** bila `m ≥ 1`; `m = 0` → "Belum ada turunan". **Populasi n & m WAJIB `status IN ('active','done')`** (selaras populasi mean server FR-5, O4) — n = Strategi active/done RLS-visible dengan `target_numeric > 0`, m = total Strategi active/done RLS-visible. Jangan hitung archived maupun draft (kalau tidak, orb "Progress" bisa berpasangan sublabel "n/n terukur" yang kontradiktif).
- **FR-15b (over-achiever, orb vs kartu detail).** Orb adalah **fill-gauge ter-clamp 0..100** (S1). Kartu detail Strategi "Capaian vs Target" (`computeKpiGap.percent`, bisa >100) **tetap menampilkan angka eksak** (mis. 120%). Untuk attainment ≤100% orb ≡ kartu; untuk >100% orb menampilkan **100%** (gauge penuh) dan kartu **120%** — **keduanya berlabel "Capaian", divergensi di atas target DISENGAJA** (over-achievement adalah info nyata), bukan kontradiksi. QA jangan menandai ini bug.
- **FR-16.** Header detail Goal & Strategi (`ProgressOrb`) menerima **prop `label`** baru (default "Capaian"; a11y string ikut label) dan memakai attainment dari RPC (S3). Kartu "Progress vs Capaian" Goal: "Capaian" = attainment numerik, "Progress kerja" = `ratioActiveOfChildren` (status) tetap ada tapi jelas berlabel Progress. Untuk Goal/Strategi kualitatif → hanya blok "Progress".

### E. Invalidasi
- **FR-17.** Jalur approve/reject Nilai Hasil (yang mengubah `numeric_total`) **wajib** `invalidateQueries(['workspace_card_progress'])` + query detail Goal/Strategi terkait. (Saat ini gap — tidak ter-invalidate.)

### F. A11y (DESIGN §4, mengikat)
- **FR-18.** Perbedaan Capaian/Progress **tidak** boleh mengandalkan warna saja — label teks + `accessibilityLabel` orb menyebut "Capaian"/"Progress". Angka + label + sublabel harus bermakna tanpa warna.

---

## 5. Data Contract

### Migrasi `0070_workspace_card_progress_attainment.sql` [verifikasi nomor terakhir = 0069 sebelum eksekusi; repo pernah tabrakan nomor paralel]

```sql
-- workspace_card_progress v2 — attainment-aware roll-up Goal/Strategi. READ-ONLY.
-- SECURITY INVOKER: RLS induk+anak ditegakkan per pemanggil (anti cross-org).
BEGIN;

-- RETURNS TABLE berubah (tambah is_measured) → wajib DROP+CREATE (bukan REPLACE).
-- Tanpa CASCADE: verifikasi tak ada dependen (pg_depend) — hanya dipanggil via PostgREST.
DROP FUNCTION IF EXISTS public.workspace_card_progress(uuid[]);

CREATE FUNCTION public.workspace_card_progress(p_card_ids uuid[])
  RETURNS TABLE(card_id uuid, progress integer, is_measured boolean)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER            -- EKSPLISIT (0046 menghilangkannya → default; jangan ulang)
  SET search_path TO ''
AS $function$
  with ids as (select unnest(p_card_ids) as id),

  -- (A) STATUS-ROLLUP — DISALIN VERBATIM dari 0046:2692-2741 (6 cabang, jangan diubah).
  child_status as (
    select k.goal_id as pid, k.status as cstatus
      from public.strategies k join ids on ids.id = k.goal_id where k.status <> 'archived'
    union all
    select s.strategy_id, s.status
      from public.initiatives s join ids on ids.id = s.strategy_id where s.status <> 'archived'
    union all
    select i.initiative_id, i.status
      from public.action_plans i join ids on ids.id = i.initiative_id where i.status <> 'archived'
    union all
    select a.action_plan_id, a.status
      from public.tasks a join ids on ids.id = a.action_plan_id where a.status <> 'archived'
    union all
    select p.development_area_id, p.status
      from public.problem_statements p join ids on ids.id = p.development_area_id where p.status <> 'archived'
    union all
    select i.problem_statement_id, i.status
      from public.action_plans i join ids on ids.id = i.problem_statement_id where i.status <> 'archived'
  ),
  status_rollup as (
    select ids.id as pid,
           coalesce(round(100.0 * count(*) filter (where cs.cstatus = 'done')
                          / nullif(count(cs.cstatus), 0)), 0)::int as progress
      from ids left join child_status cs on cs.pid = ids.id
     group by ids.id
  ),

  -- (B) GOAL attainment = mean( clamp(attainment per Strategi TERUKUR anak) ), group by goal.
  --     numeric_total & target_numeric di grain STRATEGI (bukan goal). Guard target>0.
  goal_attainment as (
    select st.goal_id as pid,
           round(avg( least(100, greatest(0,
             round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric))) ))::int as progress
      from public.strategies st
      join ids on ids.id = st.goal_id
      left join public.strategy_current_values scv on scv.strategy_id = st.id
     where st.status in ('active','done')             -- O4: exclude draft+archived
       and st.target_numeric is not null and st.target_numeric > 0   -- guard div-by-zero
     group by st.goal_id
  ),

  -- (C) STRATEGI attainment = capaian dirinya vs target.
  strategy_attainment as (
    select st.id as pid,
           least(100, greatest(0,
             round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric)))::int as progress
      from public.strategies st
      join ids on ids.id = st.id
      left join public.strategy_current_values scv on scv.strategy_id = st.id
     where st.target_numeric is not null and st.target_numeric > 0
  ),

  measured as (
    select pid, progress from goal_attainment
    union all
    select pid, progress from strategy_attainment
  )

  select
    ids.id as card_id,
    coalesce(m.progress, sr.progress, 0)::int as progress,
    (m.pid is not null) as is_measured
  from ids
  left join measured m on m.pid = ids.id
  left join status_rollup sr on sr.pid = ids.id;
$function$;

-- ACL WAJIB (DROP mereset ke EXECUTE TO PUBLIC — 0062).
REVOKE EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) TO authenticated;

COMMIT;
```

**Keputusan view:** **TIDAK** membuat `goal_current_values` (inline di RPC). Alasan: hindari objek baru yang bisa ke-CASCADE / kehilangan `security_invoker` saat rebuild (pelajaran 0045→0061); hanya satu konsumen. Bila kelak >1 konsumen (Home + laporan), baru buat view `WITH (security_invoker = true)`.

### TypeScript
```ts
// mobile/src/lib/workspace-progress.ts
type CardProgressRow = { card_id: string; progress: number; is_measured: boolean };
export type CardProgress = { progress: number; isMeasured: boolean };

export async function fetchCardProgress(ids: string[]): Promise<Map<string, CardProgress>> {
  const map = new Map<string, CardProgress>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.rpc('workspace_card_progress', { p_card_ids: ids });
  if (error) throw error;
  for (const row of (data ?? []) as CardProgressRow[]) {
    map.set(row.card_id, {
      progress: Math.max(0, Math.min(100, Math.round(row.progress))),
      isMeasured: row.is_measured === true,
    });
  }
  return map;
}

// mobile/src/lib/progress.ts — backward-compatible (param opsional; default false → "Progress")
export function treeOrbLabel(kind: string, isMeasured = false): 'Capaian' | 'Progress' {
  return (kind === 'goal' || kind === 'strategy') && isMeasured ? 'Capaian' : 'Progress';
}

// mobile/src/hooks/use-workspace.ts — useCardProgress mengekspos DUA getter agar callsite orb tak pecah
// progressOf(id): number | null   (map.get(id)?.progress ?? null)
// measuredOf(id): boolean         (map.get(id)?.isMeasured ?? false)
```
Regen `database.types.ts` (`Returns` = `{ card_id: string; progress: number; is_measured: boolean }[]`) via `npx supabase gen types` / `mcp__supabase__generate_typescript_types`.

### RLS
- Tidak ada policy baru (read-only). `SECURITY INVOKER` menegakkan cross-org via `strategies_select` ([0046:2819](../supabase/migrations/0046_rewrite_bodies_and_policies.sql)), `goals_select` ([0049](../supabase/migrations/0049_hotfix_missing_select_policies.sql)), dan view `strategy_current_values` (`security_invoker=true`, [0061](../supabase/migrations/0061_fix_strategy_current_values_security_invoker.sql)).
- Dua peran boleh melihat Capaian berbeda (per-visibilitas) — invarian yang dipertahankan.

---

## 6. Callsite yang Tersentuh (inventaris)

- `mobile/src/lib/workspace-progress.ts` — `CardProgressRow`, `fetchCardProgress` (Map bawa flag).
- `mobile/src/lib/__tests__/workspace-progress.test.ts` — 6 assertion Map-angka + 3 test `treeOrbLabel` **akan merah** → update shape + signature.
- `mobile/src/lib/progress.ts` — `treeOrbLabel` signature.
- `mobile/src/hooks/use-workspace.ts:76-94` — `useCardProgress` tambah `measuredOf`; `progressOf` tetap `number|null`.
- `mobile/src/screens/workspace-screen.tsx` — `TreeOrbCell` terima `isMeasured`; 7 callsite orb (`:506,564,638,684,755,796,...`) teruskan `measuredOf(id)` → `treeOrbLabel`.
- `mobile/src/components/ui.tsx` — `ProgressOrb` tambah prop `label` (default "Capaian", a11y ikut). `TreeProgressOrb` sudah terima `label`.
- `mobile/src/app/(app)/goal/[id].tsx` — orb header + kartu "Progress vs Capaian" pakai attainment RPC (S3).
- `mobile/src/app/(app)/strategy/[id].tsx` — rekonsiliasi orb header ↔ kartu "Capaian vs Target".
- Jalur approve/reject Nilai Hasil (review) — tambah invalidasi (FR-17).

---

## 7. Acceptance Criteria (Given/When/Then)

### A — Attainment Strategi
- **AC-A1** Given Strategi terukur `target=100, numeric_total=80` · When dihitung · Then `80%`, label Capaian.
- **AC-A2** Given `target=3, numeric_total=2` · Then `round(66.67)=67%`.
- **AC-A3** Given terukur tanpa nilai approved (`numeric_total` NULL) · Then `0%` (bukan `—`).
- **AC-A4** Given `target=100, numeric_total=120` · Then clamp → `100%` (bukan 120).
- **AC-A5** Given `target=0` · Then diperlakukan **kualitatif** (guard div-by-zero) → status-rollup + "Progress".
- **AC-A6** Given ada nilai pending 50 + approved 30 atas `target=100` · Then hanya approved → `30%`.

### B — Roll-up Goal
- **AC-B1** Given anak terukur A=80%, B(clamped)=100% · Then Goal `mean=90%`, Capaian.
- **AC-B2** Given A(`target=10`)=100%, B(`target=1000`)=0% · Then `mean=50%` (mean sederhana, target besar tak menambah bobot).
- **AC-B3** Given A=40%, B=60%, C kualitatif · Then C dikecualikan → `50%`.
- **AC-B4** Given A=100% (visible), B=0% (tidak RLS-visible) · Then pemanggil melihat `mean=100%`, sublabel `1/1`.

### C — Fallback & label
- **AC-C1** Given Strategi kualitatif, 2/4 anak done · Then `50%` label **Progress**.
- **AC-C2** Given Goal semua anak kualitatif / nol terukur visible · Then status-rollup + **Progress** (bukan Capaian, bukan `—`).
- **AC-C3** Given node `is_measured=true` vs `false` · Then label ditentukan flag: Capaian vs Progress.
- **AC-C4** Given Goal ≥1 Strategi terukur visible · Then label **Capaian**, nilai = mean (Grup B).

### D — Sublabel
- **AC-D1** Given 5 Strategi visible, 3 terukur · Then "3/5 Strategi terukur".
- **AC-D2** Given fisik 8 Strategi (3 terukur) tapi hanya 4 visible (2 terukur) · Then "2/4 Strategi terukur" (bukan 3/8) — no existence leak.
- **AC-D3** Given `m = 0` (tak ada Strategi visible) · Then sublabel "Belum ada turunan" (bukan "0/0").

### E — Governance
- **AC-E1** Given RPC `SECURITY INVOKER` · When dua peran memanggil Goal sama · Then masing-masing hanya lihat Strategi RLS-visible-nya; angka boleh beda tanpa error.
- **AC-E2** Given A=100% (visible P1&P2), B=0% (visible P1 saja) · Then P1 lihat `50%` (2/2), P2 lihat `100%` (1/1); keduanya valid.
- **AC-E3** Given pemanggil Org X minta `p_card_ids` milik Org Y · Then nol baris visible → kosong; tak ada angka/keberadaan Org Y bocor.
- **AC-E4 (inference n=1)** Given Goal 1 Strategi terukur visible yang task-nya TIDAK visible · Then `numeric_total` NULL → `current=0` → attainment 0%; roll-up tidak memaparkan nilai tersembunyi.
- **AC-E5 (ACL)** Then `has_function_privilege('anon', 'public.workspace_card_progress(uuid[])', 'EXECUTE') = false`.
- **AC-E6 (invoker)** Then `pg_proc.prosecdef = false` untuk `workspace_card_progress`, dan `proconfig` memuat `search_path=`.
- **AC-E7 (view)** Then `pg_class.reloptions` `strategy_current_values` memuat `security_invoker=true`.

### F — Edge
- **AC-F1** RLS-miss / error / undefined → orb `—` (bukan 0%).
- **AC-F2** Induk status-rollup childless → `0` (bukan `—`).
- **AC-F3** Loading → skeleton (bukan flash 0%).
- **AC-F4** `numeric_total` negatif → attainment di-floor 0 (`computeKpiGap` `max(0,...)`), lalu clamp atas.

### G — UI detail
- **AC-G1** Detail Goal terukur: kartu tampil "Capaian 90%" + "Progress kerja 40%" terpisah berlabel.
- **AC-G2** Orb pohon Goal ≡ orb header detail Goal (nilai & label identik, single source).
- **AC-G3** Detail Strategi terukur: orb `80%` ≡ kartu "Capaian vs Target" `80/100`; tidak ada selisih.
- **AC-G4** Detail Strategi kualitatif: hanya "Progress"; tidak ada orb "Capaian"/kartu numerik.

### H — Cache
- **AC-H1** Given approve Nilai Hasil Strategi X · When sukses · Then `['workspace_card_progress']` ter-invalidate → orb Goal induk & Strategi X refetch nilai baru.

---

## 8. Verifikasi & Gap CI

- **Baseline**: 1405/1405 jest, `tsc` clean. Setelah perubahan: perbarui test yang merah (workspace-progress.test.ts), tambah unit untuk `treeOrbLabel(kind,isMeasured)`, roll-up mean, fallback.
- **Contract test SQL baru** (pola [0063](../supabase/tests/0063_cross_org_isolation_contract.sql)): AC-E3..E7 (cross-org, ACL anon, invoker, search_path, view invoker), div-by-zero (`target=0` → `is_measured=false`, tak crash), roll-up correctness seed campuran.
- **⚠️ Gap CI (O3)**: `.github/workflows/ci.yml` hanya `npm run test:ci` — **tidak** menjalankan `supabase/tests/*.sql`. Contract test governance = **nol proteksi CI** (jalur yang meloloskan regresi 0045→0061). Jalankan **manual** via `mcp__supabase__execute_sql` atau `docker exec supabase_db_supabase psql -f`. **Rekomendasi**: wire pgTAP/SQL ke CI atau jadikan advisor `security_definer_view` gate rilis.
- **DB lokal**: Supabase MCP ≠ app local DB (54321/54322). Apply DDL lokal via `docker exec supabase_db_supabase psql`.
- **Sebelum DROP**: verifikasi `pg_depend` tak ada dependen pada `workspace_card_progress`; bila ada tak terduga → **berhenti**, jangan tambah CASCADE.

---

## 9. Open Questions (residual, tidak memblokir)
1. **O1** — Clamp per-child (S1) final, atau izinkan >100 mengangkat mean? (Rekomendasi: pertahankan clamp.)
2. **O2** — Perlukah UI menjelaskan divergensi angka antar-peran? (Rekomendasi: tidak di V1.)
3. **O3** — Wire contract test SQL / advisor ke CI (task infra terpisah).
4. Home `listGoalNeedsAttention` — dijadwalkan **P2**; konfirmasi bila ingin naik ke V1.

---

## 10. Handoff ke TDD

**Feature (untuk /tdd-plan):** Redefinisi RPC `workspace_card_progress` menjadi attainment-aware (Goal = mean clamp-per-child attainment Strategi terukur RLS-visible; Strategi = attainment sendiri; kind lain status-rollup verbatim), + kolom `is_measured`, + `SECURITY INVOKER` eksplisit + `SET search_path=''` + `GRANT authenticated`/`REVOKE PUBLIC,anon`; wiring klien `fetchCardProgress`/`useCardProgress(measuredOf)`/`treeOrbLabel(kind,isMeasured)`/`ProgressOrb label`/sublabel "n/m Strategi terukur"; rekonsiliasi header detail Goal & Strategi ke sumber attainment yang sama; invalidasi `['workspace_card_progress']` di jalur approve/reject Nilai Hasil.

**Paths:**
- `supabase/migrations/0070_workspace_card_progress_attainment.sql` (baru)
- `supabase/tests/0070_*_contract.sql` (baru — manual)
- `mobile/src/lib/workspace-progress.ts`, `mobile/src/lib/progress.ts`
- `mobile/src/hooks/use-workspace.ts`
- `mobile/src/screens/workspace-screen.tsx`
- `mobile/src/components/ui.tsx` (`ProgressOrb` prop `label`)
- `mobile/src/app/(app)/goal/[id].tsx`, `mobile/src/app/(app)/strategy/[id].tsx`
- Jalur review/approve Nilai Hasil (invalidasi)
- `mobile/src/lib/database.types.ts` (regen)
- Test: `mobile/src/lib/__tests__/workspace-progress.test.ts` (+ unit baru)

**Baseline test-first:** mulai dari contract SQL (RPC shape, invoker, ACL, cross-org, roll-up) + unit `treeOrbLabel`/mean/fallback (red) → implementasi (green) → rekonsiliasi UI + invalidasi.
