# Fase 6: Development Workspace — Spec Final

---

## 1. Problem Statement

RencanApp (EMS V1.8.1) saat ini hanya memiliki satu jalur eksekusi: **Performance Workspace** (Goal - KPI Area - Strategy - Initiative - Action Plan). Jalur kedua -- **Development Workspace** -- sudah didefinisikan di PRD (S3, S7, S15-16) dan BUILD-PLAN (Fase 6), tetapi belum diimplementasikan.

Akibatnya, pekerjaan pembangunan mesin internal perusahaan (sistem, SDM, SOP, teknologi, infrastruktur, brand, governance) tetap berjalan di luar EMS, bertentangan dengan tujuan produk S2.3.

### Gap spesifik yang ditutup Fase 6

1. **Data layer mobile kosong.** Tidak ada `development-areas.ts` atau `problem-statements.ts` di `mobile/src/lib/`.
2. **UI routes tidak ada.** Tidak ada route `(app)/development-area/` atau `(app)/problem-statement/`.
3. **MBR enforcement di-defer.** Migrasi 0011 sudah seed rule development dengan mode `hanya_peringatan`, tetapi RPC `check_minimum_breakdown_compliance()` melakukan early-return untuk card type development (baris 182-184). Enforcement harus diaktifkan.
4. **Tabel database BELUM ada.** Migrasi 0005-0011 TIDAK membuat tabel `development_areas` atau `problem_statements` -- hanya MBR rules yang men-seed string card type. Tabel harus dibuat di Fase 6.
5. **Permission `create_development_area` sudah di-seed** di Fase 0 (migrasi 0001 baris 201), tetapi belum diterapkan di RLS manapun.

### Sumber

| Klaim | Sumber |
|---|---|
| Development Workspace jalur kedua EMS | PRD S1, S3, S7; prd/01 S6; wiki/entities/workspace.md |
| Hierarki: Dev Area - Problem Statement - Initiative - AP | PRD S7; prd/01 S6; wiki/entities/workspace.md |
| MBR default Development 1/1 | migrasi 0011 L65-66; BUILD-PLAN Fase 5 "angka longgar" |
| Enforcement di-defer Fase 5, aktif Fase 6 | migrasi 0011 L182-184; BUILD-PLAN Fase 6 |
| Permission sudah di-seed Fase 0 | migrasi 0001 L201 |

---

## 2. Tujuan

### T1. Workspace Development berfungsi end-to-end
User dapat membuat, mengaktifkan, dan mengelola hierarki Development Area - Problem Statement - Initiative - Action Plan, dengan loop eksekusi lengkap (Bukti, Nilai Hasil, Review) yang sudah ada dari Fase 1-2.

### T2. Reuse penuh mekanisme Fase 1-5
Initiative dan Action Plan yang dibuat dari Problem Statement menggunakan tabel, RPC, RLS, dan UI yang sama persis. Tidak ada duplikasi entity atau logic baru untuk card level Initiative ke bawah.

### T3. MBR enforcement aktif untuk Development
RPC `check_minimum_breakdown_compliance()` tidak lagi early-return. Default development (1/1, shared initiative->action_plan=1) ditegakkan sesuai mode organisasi.

### T4. Permission Development Area terkustomisasi
Permission `create_development_area` diterapkan di RLS. Default: CEO/Super Admin otomatis dapat (hardcode has_permission); C-Level/Management/Head/Staff harus diberi grant eksplisit via user_permissions.

### T5. Governance invarian dipertahankan
RLS, anti-self-approval, evidence locking, append-only audit, MBR enforcement -- semua tetap berlaku tanpa pengecualian.

---

## 3. Non-Goals

- **NG1.** Score Formula dan People ranking (Fase 7).
- **NG2.** Development Area Template Library (PRD tidak mendefinisikan).
- **NG3.** Cross-workspace linking (satu Initiative tidak boleh terhubung ke Strategy DAN Problem Statement).
- **NG4.** Bobot pada planning card (PRD S44, S88).
- **NG5.** Routine, Checklist, Watcher (PRD S88).
- **NG6.** AI-assisted review/suggestion (PRD S88).
- **NG7.** Feed, Company News, Announcement (PRD S88).
- **NG8.** Migrasi tabel selain development_areas, problem_statements, dan ALTER initiatives.
- **NG9.** Perubahan hierarki Development (tidak ada level baru).

---

## 4. User Stories

### A. CEO / Super Admin

**US-6.01 -- Membuat Development Area baru**
Buka Workspace > tab Development > "+ Development Area" > isi Nama, Periode, PIC > simpan Draft. Keterangan Card "Area pengembangan apa yang sedang dibangun?" wajib tampil. PIC default: diri sendiri.
*Sumber: PRD S7, S15, S59.1.*

**US-6.02 -- Melihat Development Workspace lengkap**
CEO dengan `view_all_workspace` melihat semua Development Area + turunan.
*Sumber: PRD S57, S59.1.*

**US-6.03 -- Mengelola permission create_development_area**
Settings > User & Permission > toggle permission per user.
*Sumber: PRD S58.3, S59.1.*

**US-6.04 -- Mengaktifkan Development Area**
PIC memeriksa Kelengkapan Card + Kelengkapan Perencanaan > "Aktifkan Card". MBR gate berlaku sesuai mode.
*Sumber: PRD S19, S39-40.*

### B. C-Level

**US-6.06 -- Melihat Development Area relevan**
C-Level melihat Development Area yang dia PIC + turunannya. Untuk membuat Development Area, perlu grant eksplisit `create_development_area`.
*Sumber: PRD S55-57, S59.2.*

**US-6.07 -- Membuat Problem Statement**
PIC Development Area membuat Problem Statement dari dalam Development Area. PIC default ikut PIC Development Area.
*Sumber: PRD S16, S18, S52.*

### C. Manager / Head

**US-6.09 -- Membuat Development Area (jika diberi izin)**
Manager/Head yang diberi grant `create_development_area` via user_permissions bisa membuat. Tanpa grant, tombol hidden.
*Sumber: PRD S58.3, S59.3.*

**US-6.10 -- Membuat Initiative dari Problem Statement**
PIC Problem Statement membuat Initiative dari dalam Problem Statement. Initiative masuk tabel initiatives yang sama (reuse), dengan `problem_statement_id` terisi.
*Sumber: PRD S18, S23.*

**US-6.11 -- Membuat Action Plan dari Initiative Development**
Reuse alur Fase 1-2. PIC eksekutor wajib eksplisit. Anti-self-approval berlaku.
*Sumber: PRD S24-29, S52, S54.*

### D. Staff

**US-6.13 -- Melihat Action Plan Development di Home**
Action Plan Development muncul di Home bersamaan dengan Performance (query berdasarkan PIC, bukan workspace).
*Sumber: PRD S55, S61.*

**US-6.14 -- Submit Bukti & Nilai Hasil**
Reuse Fase 1-2. Evidence locking, submission versioning berlaku.
*Sumber: PRD S30-35.*

### E. Alur End-to-End (Happy Path)

1. CEO buat Development Area "System Development" > Draft.
2. CEO isi kelengkapan > aktifkan > Aktif.
3. CEO buat Problem Statement dari dalam DA > delegasi PIC ke Manager HR.
4. Manager HR aktifkan Problem Statement.
5. Manager HR buat Initiative dari PS > PIC: Manager HR, Reviewer: CEO > aktifkan. Chat room otomatis terbuka.
6. Manager HR buat Action Plan > PIC: Staff A, Reviewer: Manager HR > aktifkan > Assigned.
7. Staff A submit Bukti + Nilai Hasil > Menunggu Review.
8. Manager HR review > Approve > Selesai.
9. Activity Log mencatat seluruh lifecycle.

### F. Workspace Dual View

**US-6.19 -- Toggle Performance / Development**
Tab/segmented control di Workspace. Default: Performance. Kedua tab selalu visible (empty state jika kosong).
*Sumber: PRD S7; prd/01 S6.*

---

## 5. Functional Requirements

### FR-1 Development Area Card

**FR-1.1** Root card Development Workspace, setara Goal. Tidak punya induk.

**FR-1.2** Field: Nama (wajib), Periode Mulai (wajib), Periode Selesai (wajib), PIC (wajib), Deskripsi (opsional). Tidak ada Target, bobot, atau satuan.

**FR-1.3** Permission `create_development_area` (sudah di-seed Fase 0). Default via `has_permission()` hardcode: hanya CEO selalu true. C-Level/Management default TIDAK punya (hanya `create_initiative`, `create_action_plan`, `create_strategy` di hardcode). Harus diberi grant eksplisit via `user_permissions`.

### FR-2 Development Area Kelengkapan dan Aktivasi

**FR-2.1** Kelengkapan: Nama, PIC, Periode (Mulai + Selesai) wajib sebelum aktivasi.

**FR-2.2** RPC `activate_development_area` SECURITY DEFINER. Validasi kelengkapan + otorisasi (PIC/creator/manage_others_cards) + MBR gate.

### FR-3 Problem Statement Card

**FR-3.1** "Problem Statement" dan "Development Goal" adalah dua nama untuk SATU entity (tabel `problem_statements`). UI menggunakan label tunggal "Problem Statement". Istilah "Development Goal" muncul sebagai sinonim di Keterangan Card/guidance saja. **Tidak ada dropdown pemilih, tidak ada kolom type di tabel.**

**FR-3.2** Selalu dibuat dari dalam Development Area. Field: Nama (wajib), Periode (wajib), PIC (wajib, default ikut PIC DA), Deskripsi (opsional). Tidak ada Alasan/Risiko/Alternatif (berbeda dari Strategy).

**FR-3.3** Pembuatan tidak memerlukan permission terpisah -- PIC Development Area induk ATAU user dengan `create_development_area` bisa membuat.

### FR-4 Initiative dari Problem Statement (Reuse Fase 4)

**FR-4.1** Kolom `problem_statement_id` (uuid FK nullable ON DELETE SET NULL) ditambah ke `initiatives`. CHECK constraint: strategy_id dan problem_statement_id TIDAK boleh keduanya non-null (mutual exclusivity).

**FR-4.2** Field dan validasi Initiative Development IDENTIK dengan Performance. Action Plan reuse seluruh infrastruktur Fase 1-2.

### FR-5 Delegasi PIC dan Reviewer

**FR-5.1** Delegasi bertingkat: PIC DA > PIC PS > PIC Initiative > PIC AP. Default PIC turunan ikut induk kecuali diubah.

**FR-5.2** Anti-self-approval: PIC AP tidak boleh jadi Reviewer (trigger existing berlaku).

### FR-6 MBR Enforcement Development

**FR-6.1** Hapus early-return di `check_minimum_breakdown_compliance` untuk development_area dan problem_statement.

**FR-6.2** Default seed (sudah ada di 0011): development_area->problem_statement min 1 hanya_peringatan; problem_statement->initiative min 1 hanya_peringatan. Rule initiative->action_plan shared (min 1, hanya_peringatan). Tidak dibuat row terpisah per workspace.

**FR-6.3** Trigger `tg_enforce_mbr_block_child`: (a) pasang pada problem_statements; (b) ubah cabang initiatives baris 310 menjadi `if new.strategy_id is null AND new.problem_statement_id is null then return new`; (c) perluas CASE expression untuk handle problem_statement_id.

### FR-7 Hak Akses dan RLS

**FR-7.1** SELECT policies untuk development_areas dan problem_statements menggunakan **inline kolom** (org, pic_id, created_by) + helper yang query tabel LAIN (bukan self-requery) -- menghindari gotcha INSERT...RETURNING 42501 dari Fase 1.

**FR-7.2** `can_access_development_area` dan `can_access_problem_statement` dibuat untuk pemakaian **programatik** (RPC internal: check_minimum_breakdown_compliance, activate_*). BUKAN dipakai di SELECT policy.

**FR-7.3** `initiatives_select` policy (0006 L34-44) diperluas: tambah `OR is_problem_statement_pic(problem_statement_id)`. Ini memungkinkan PIC Problem Statement melihat Initiative Development di bawahnya.

**FR-7.4** `action_plans_select` policy (0006 L48-59) diperluas: tambah path untuk PIC Problem Statement via Development chain. Implementasi: tambah helper `i_am_problem_statement_pic_via_initiative(initiative_id)` yang memeriksa apakah Initiative punya problem_statement_id dan user adalah PIC Problem Statement tersebut.

**FR-7.5** `can_access_initiative` (0008 L43-52) diperluas: tambah cek `problem_statement_id` chain. Ini kritis agar Fase 3 collab (notifications, comments, inbox) berfungsi untuk Development Initiatives.

**FR-7.6** `activate_initiative` RPC (0005 L285-302) diperluas: tambah `is_problem_statement_pic(i.problem_statement_id)` sebagai jalur otorisasi. Tanpa ini, PIC Problem Statement yang mendelegasikan Initiative PIC tidak bisa mengaktifkan Initiative tersebut.

### FR-8 Workspace UI

**FR-8.1** Dual-tab: Performance (existing) dan Development (baru). Default: Performance.

**FR-8.2** Development tab: daftar Development Area expandable > Problem Statement > Initiative > Action Plan.

**FR-8.3** Empty state Development mengikuti pola Performance (EmptyState component).

### FR-9 Data Layer Mobile

**FR-9.1** `development-areas.ts` mirror `goals.ts`. `problem-statements.ts` mirror `strategies.ts`.

**FR-9.2** `cards.ts`: NewInitiative + listInitiatives diperluas untuk problemStatementId.

**FR-9.3** `workspace-copy.ts`: tambah WS_DEV_COPY constants.

### FR-10 Audit dan Governance

**FR-10.1** Activity Log: lifecycle Development Area dan Problem Statement dicatat via write_activity dan log_card_creation trigger.

**FR-10.2** Evidence Locking, Submission Versioning, Anti-self-approval reuse Fase 1 tanpa modifikasi.

### FR-11 Scope Guardrails

**FR-11.1** Tidak ada bobot. Tidak ada scope-creep (Feed, AI, Watcher, dll).

**FR-11.2** Bahasa Indonesia. Thick DB, Thin Client. MBR tidak retroaktif.

---

## 6. Data Contracts

### DC-1. Tabel: development_areas

```sql
create table if not exists public.development_areas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  description     text,
  pic_id          uuid references public.profiles (id) on delete set null,
  period_start    date,
  period_end      date,
  status          text not null default 'draft'
                  check (status in ('draft', 'active', 'done', 'archived')),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint development_areas_period_order
    check (period_start is null or period_end is null or period_end >= period_start)
);
```

Index: `idx_development_areas_org` on `(organization_id)`.
Trigger: `set_updated_at`, `log_card_creation('development_area')`.

### DC-2. Tabel: problem_statements

```sql
create table if not exists public.problem_statements (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  development_area_id uuid not null references public.development_areas (id) on delete restrict,
  name                text not null,
  description         text,
  pic_id              uuid references public.profiles (id) on delete set null,
  period_start        date,
  period_end          date,
  status              text not null default 'draft'
                      check (status in ('draft', 'active', 'done', 'archived')),
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint problem_statements_period_order
    check (period_start is null or period_end is null or period_end >= period_start)
);
```

FK `on delete restrict` (konsisten K5 Fase 4 -- tidak boleh cascade hapus parent saat child ada).
Index: `idx_problem_statements_dev_area` on `(development_area_id)`.
Trigger: `set_updated_at`, `log_card_creation('problem_statement')`.

### DC-3. ALTER initiatives

```sql
alter table public.initiatives
  add column if not exists problem_statement_id uuid
    references public.problem_statements (id) on delete set null;

create index if not exists idx_initiatives_problem_statement
  on public.initiatives (problem_statement_id);

alter table public.initiatives
  add constraint initiatives_single_parent
  check (not (strategy_id is not null and problem_statement_id is not null));
```

Semantik: strategy_id terisi = Performance; problem_statement_id terisi = Development; keduanya null = Initiative datar Fase 1 (backward-compat). Keduanya non-null = ditolak constraint.

### DC-4. Helper Functions Baru

| Fungsi | Tipe | Tujuan | Query tabel |
|---|---|---|---|
| `development_area_has_my_descendant(uuid)` | STABLE SECURITY DEFINER | SELECT policy development_areas | problem_statements, initiatives, action_plans (BUKAN development_areas) |
| `is_development_area_pic(uuid)` | STABLE SECURITY DEFINER | SELECT/INSERT policy problem_statements | development_areas |
| `development_area_in_my_org(uuid)` | STABLE SECURITY DEFINER | INSERT policy problem_statements | development_areas |
| `problem_statement_in_my_org(uuid)` | STABLE SECURITY DEFINER | INSERT/UPDATE policy initiatives | problem_statements. **Null-safe**: null returns true |
| `problem_statement_has_my_descendant(uuid)` | STABLE SECURITY DEFINER | SELECT policy problem_statements | initiatives, action_plans |
| `is_problem_statement_pic(uuid)` | STABLE SECURITY DEFINER | SELECT policy initiatives, otorisasi RPCs | problem_statements |
| `can_access_development_area(uuid)` | STABLE SECURITY DEFINER | RPC internal (check_mbr, activate) | development_areas + descendants |
| `can_access_problem_statement(uuid)` | STABLE SECURITY DEFINER | RPC internal | problem_statements + descendants |

Semua: `REVOKE EXECUTE FROM public, anon`.

### DC-5. RLS development_areas

```
SELECT: org match + (can_view_workspace OR pic_id=me OR created_by=me
        OR development_area_has_my_descendant(id))
INSERT: org match + created_by=me + has_permission('create_development_area')
UPDATE: org match + (created_by=me OR pic_id=me OR manage_others_cards)
        WITH CHECK (org match)
```

### DC-6. RLS problem_statements

```
SELECT: org match + (can_view_workspace OR pic_id=me OR created_by=me
        OR is_development_area_pic(development_area_id)
        OR problem_statement_has_my_descendant(id))
INSERT: org match + created_by=me
        + development_area_in_my_org(development_area_id)
        + (has_permission('create_development_area') OR is_development_area_pic(development_area_id))
UPDATE: org match + (created_by=me OR pic_id=me OR manage_others_cards)
        WITH CHECK (org match)
```

### DC-7. Perubahan RLS initiatives

```sql
-- INSERT: tambah problem_statement_in_my_org
drop policy if exists "initiatives_insert" on public.initiatives;
create policy "initiatives_insert" on public.initiatives
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('create_initiative')
              and public.strategy_in_my_org(strategy_id)
              and public.problem_statement_in_my_org(problem_statement_id));

-- UPDATE: tambah problem_statement_in_my_org di WITH CHECK
drop policy if exists "initiatives_update" on public.initiatives;
create policy "initiatives_update" on public.initiatives
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid()
              or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org()
              and public.strategy_in_my_org(strategy_id)
              and public.problem_statement_in_my_org(problem_statement_id));

-- SELECT: tambah is_problem_statement_pic
drop policy if exists "initiatives_select" on public.initiatives;
create policy "initiatives_select" on public.initiatives
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      public.can_view_workspace()
      or pic_id = auth.uid()
      or created_by = auth.uid()
      or public.initiative_has_my_action_plan(id)
      or public.is_problem_statement_pic(problem_statement_id)
    )
  );
```

### DC-8. Perubahan action_plans_select

Tambah path agar PIC Problem Statement melihat Action Plan:

```sql
drop policy if exists "action_plans_select" on public.action_plans;
create policy "action_plans_select" on public.action_plans
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      public.can_view_workspace()
      or pic_id = auth.uid()
      or reviewer_id = auth.uid()
      or created_by = auth.uid()
      or public.i_am_initiative_pic(initiative_id)
      or public.i_am_problem_statement_pic_via_initiative(initiative_id)
    )
  );
```

Helper baru `i_am_problem_statement_pic_via_initiative(uuid)`: cek apakah Initiative punya `problem_statement_id` dan user adalah PIC Problem Statement tersebut.

### DC-9. RPC: activate_development_area

```sql
create or replace function public.activate_development_area(p_development_area_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare da public.development_areas; v_ps int;
begin
  select * into da from public.development_areas where id = p_development_area_id;
  if not found then raise exception 'Development Area tidak ditemukan.'; end if;
  if not (da.created_by = auth.uid() or da.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Development Area ini.';
  end if;
  if da.status <> 'draft' then raise exception 'Development Area sudah diaktifkan.'; end if;
  if coalesce(trim(da.name), '') = '' or da.pic_id is null
     or da.period_start is null or da.period_end is null then
    raise exception 'Kelengkapan Development Area belum terpenuhi (nama, PIC, periode wajib).';
  end if;
  -- MBR gate (blokir_aktivasi): check_minimum_breakdown_compliance dipanggil
  -- (setelah early-return dihapus, compliance dievaluasi)
  -- Gate logic sesuai pola activate_goal (inline atau via helper)
  update public.development_areas set status = 'active' where id = p_development_area_id;
  perform public.write_activity('development_area', p_development_area_id, 'activate', '{}'::jsonb);
end;
$$;
```

### DC-10. RPC: activate_problem_statement

```sql
create or replace function public.activate_problem_statement(p_problem_statement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ps public.problem_statements;
begin
  select * into ps from public.problem_statements where id = p_problem_statement_id;
  if not found then raise exception 'Problem Statement tidak ditemukan.'; end if;
  if not (ps.created_by = auth.uid() or ps.pic_id = auth.uid()
          or public.is_development_area_pic(ps.development_area_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Problem Statement ini.';
  end if;
  if ps.status <> 'draft' then raise exception 'Problem Statement sudah diaktifkan.'; end if;
  if coalesce(trim(ps.name), '') = '' or ps.pic_id is null
     or ps.period_start is null or ps.period_end is null then
    raise exception 'Kelengkapan Problem Statement belum terpenuhi (nama, PIC, periode wajib).';
  end if;
  update public.problem_statements set status = 'active' where id = p_problem_statement_id;
  perform public.write_activity('problem_statement', p_problem_statement_id, 'activate', '{}'::jsonb);
end;
$$;
```

### DC-11. Perubahan check_minimum_breakdown_compliance

Hapus early-return baris 182-184. Tambah dua cabang:

```sql
elsif p_parent_card_type = 'development_area' then
  if not public.can_access_development_area(p_parent_card_id) then
    raise exception 'Anda tidak berwenang membaca Development Area ini.';
  end if;
  v_child := 'problem_statement';
  select count(*) into v_count from public.problem_statements
    where development_area_id = p_parent_card_id and status <> 'archived'
    and organization_id = v_org;

elsif p_parent_card_type = 'problem_statement' then
  if not public.can_access_problem_statement(p_parent_card_id) then
    raise exception 'Anda tidak berwenang membaca Problem Statement ini.';
  end if;
  v_child := 'initiative';
  select count(*) into v_count from public.initiatives
    where problem_statement_id = p_parent_card_id and status <> 'archived'
    and organization_id = v_org;
```

### DC-12. Perubahan tg_enforce_mbr_block_child

Tiga perubahan:

1. **Baris 310** (cabang initiatives): ubah dari `if new.strategy_id is null then return new` menjadi `if new.strategy_id is null and new.problem_statement_id is null then return new`. Jika `problem_statement_id` terisi, petakan ke `(problem_statement, initiative)`.

2. **Tambah cabang** problem_statements:
```sql
elsif tg_table_name = 'problem_statements' then
  v_parent_type := 'development_area';
  v_child_type := 'problem_statement';
  v_parent_id := new.development_area_id;
```

3. **Perluas CASE expression** sibling counting (baris 328-333):
```sql
case tg_table_name
  when 'kpi_areas' then 'goal_id'
  when 'strategies' then 'kpi_area_id'
  when 'initiatives' then
    case when new.problem_statement_id is not null then 'problem_statement_id'
    else 'strategy_id' end
  when 'action_plans' then 'initiative_id'
  when 'problem_statements' then 'development_area_id'
end
```

4. **Trigger baru**:
```sql
create trigger problem_statements_enforce_mbr
  before insert on public.problem_statements
  for each row execute function public.tg_enforce_mbr_block_child();
```

### DC-13. Perubahan can_access_initiative (0008)

```sql
create or replace function public.can_access_initiative(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i
    where i.id = p_initiative
      and i.organization_id = public.current_user_org()
      and (public.can_view_workspace() or i.pic_id = auth.uid()
           or i.created_by = auth.uid()
           or public.initiative_has_my_action_plan(i.id)
           or public.is_problem_statement_pic(i.problem_statement_id))
  );
$$;
```

### DC-14. Perubahan activate_initiative (0005)

Tambah jalur otorisasi PIC Problem Statement:

```sql
if not (i.created_by = auth.uid() or i.pic_id = auth.uid()
        or public.has_permission('manage_others_cards')
        or public.is_problem_statement_pic(i.problem_statement_id)) then
  raise exception 'Anda tidak berwenang mengaktifkan Initiative ini.';
end if;
```

### DC-15. Seed Data

Card guidance contents (idempoten, organization_id NULL = system):

```sql
insert into public.card_guidance_contents (organization_id, card_type, title, body)
select null, x.card_type, x.title, x.body
from (values
  ('development_area',
   'Development Area -- Area pengembangan apa yang sedang dibangun?',
   'Development Area adalah area pembangunan mesin perusahaan agar lebih kuat dan tidak bergantung pada owner. Contoh: Organization Development, People Development, System Development, Technology Development, Infrastructure Development, Brand Development, Governance Development.'),
  ('problem_statement',
   'Problem Statement / Development Goal -- Masalah atau perbaikan apa yang ingin diselesaikan?',
   'Tuliskan masalah atau target perbaikan yang menjadi alasan dibuatnya Initiative Development. Contoh: SOP finance belum konsisten, Training outlet belum standar, Perusahaan belum punya sistem follow up selain WhatsApp.')
) as x (card_type, title, body)
where not exists (
  select 1 from public.card_guidance_contents c
  where c.organization_id is null and c.card_type = x.card_type
);
```

**7 Development Area default TIDAK di-seed ke database.** Alasan: Development Area bukan template (berbeda dari Goal Template), tidak ada mekanisme PIC default, dan PRD tidak mendefinisikan auto-create trigger. Tujuh nama muncul sebagai contoh di card guidance body.

### DC-16. Data Layer Mobile: development-areas.ts

Mirror `goals.ts`. Types: `DevelopmentArea = Tables<'development_areas'>`, `DevelopmentAreaWithProblemCount`. Queries: `listDevelopmentAreas()`, `getDevelopmentArea(id)`. Mutations: `createDevelopmentArea(input)`, `activateDevelopmentArea(id)`.

### DC-17. Data Layer Mobile: problem-statements.ts

Mirror `strategies.ts`. Types: `ProblemStatement = Tables<'problem_statements'>`. Queries: `listProblemStatements(devAreaId)` (guard empty), `getProblemStatement(id)`. Mutations: `createProblemStatement(input)`, `activateProblemStatement(id)`.

### DC-18. Perubahan cards.ts

NewInitiative: tambah `problem_statement_id?: string | null`. listInitiatives: tambah filter `problemStatementId` (backward-compat: tanpa opts = semua).

### DC-19. workspace-copy.ts

```typescript
export const WS_DEV_COPY = {
  subtitle: 'Development -- Development Area, Problem Statement & Initiative.',
  sectionDevAreas: 'Development Areas',
  btnDevAreaBaru: '+ Development Area Baru',
  problemCount: (n: number) => `Problem Statement: ${n}`,
  problemCountUnknown: 'Problem Statement: --',
  emptyDevAreaTitle: 'Belum ada Development Area',
  emptyDevAreaDescCan: 'Buat Development Area pertama untuk memulai jalur pengembangan organisasi.',
  emptyDevAreaDescView: 'Anda akan melihat Development Area di sini begitu menjadi PIC atau Reviewer sebuah card.',
} as const;
```

### DC-20. Routing Mobile

| Path | Tujuan |
|---|---|
| `(app)/development-area/new.tsx` | Form buat Development Area |
| `(app)/development-area/[id].tsx` | Detail + daftar Problem Statement |
| `(app)/problem-statement/new.tsx` | Form buat Problem Statement |
| `(app)/problem-statement/[id].tsx` | Detail + daftar Initiative |

### DC-21. Regenerasi database.types.ts

Setelah migrasi: `supabase gen types typescript`.

---

## 7. Edge Cases, Error States, dan Jalur Izin Ditolak

### EE-1. Empty States

| Kondisi | User punya create_development_area | User TIDAK punya |
|---|---|---|
| DA list kosong | "Belum ada Development Area" + tombol "+ Development Area Baru" | "Belum ada Development Area" + desc viewer, tanpa tombol |
| PS list kosong (DA draft, user=PIC) | "Belum ada Problem Statement. Tambahkan minimal 1 sebelum bisa diaktifkan." + tombol | -- |
| PS list kosong (DA aktif, user=viewer) | "Belum ada Problem Statement." tanpa tombol | -- |
| Staff tanpa card Development | "Tidak ada card development yang relevan untuk Anda." tanpa tombol | -- |

### EE-2. Loading States

Semua list view: `SkeletonList`. MBR indicator: return null saat undefined. Fail-open di klien (server penegak akhir).

### EE-3. Network Error

Query error: `ErrorState` + retry. Mutation error: `Alert.alert` dengan pesan server.

### EE-4. Permission Denied

- **Create DA tanpa permission**: RLS 42501. Tombol hidden (pre-flight). Alert: "Anda tidak memiliki izin untuk membuat Development Area."
- **Create PS tanpa akses DA induk**: RLS 42501. Tombol hidden jika bukan PIC/creator DA.
- **Staff navigasi deep link ke card inaccessible**: query `.single()` returns PGRST116. ErrorState: "Development Area tidak ditemukan."
- **Anti-self-approval Development AP**: RPC tolak, Alert. Reuse Fase 1.

### EE-5. Validasi Kelengkapan

- **DA field tidak lengkap**: RPC RAISE pesan ramah.
- **PS field tidak lengkap**: RPC RAISE pesan ramah. PS TIDAK punya Target wajib atau Alasan/Risiko/Alternatif.
- **DA belum punya PS (MBR blokir_aktivasi)**: RPC RAISE + client pre-flight Alert "Tidak Dapat Melanjutkan".
- **Card sudah aktif, coba aktivasi ulang**: RAISE "sudah diaktifkan."

### EE-6. MBR Edge Cases

- **Mode hanya_peringatan (default)**: badge warn, aktivasi TIDAK diblokir.
- **Mode blokir_aktivasi**: badge danger, Alert popup pre-flight, server RAISE.
- **Mode blokir_akses_turunan**: trigger BEFORE INSERT tolak jika sibling < min.
- **Early-return dihapus**: useMbrCompliance mulai mengembalikan data compliance (bukan EMPTY_COMPLIANCE) untuk Development.

### EE-7. Workspace Toggle

- Error satu tab TIDAK memblokir tab lain (fetch independent).
- Default: Performance (backward-compat). State TIDAK persisted.
- RefreshControl refetch kedua workspace saat tab focus.

### EE-8. Data Integrity

- DA diarsipkan saat edit PS: PS INSERT tetap valid (arsip bukan delete, FK restrict).
- PIC DA diubah: RLS re-evaluate setiap query, user lama melihat EmptyState.
- Nama DA duplikat: diizinkan (konsisten Goal, tidak ada unique constraint).

### EE-9. Collab Infrastructure (Fase 3)

- **Chat room**: trigger `initiative_chat_room` (0008 L530) fires pada ALL initiatives INSERT/UPDATE status -- tidak filter strategy_id. Development Initiative otomatis mendapat chat room saat aktif.
- **Comments**: entity_type CHECK hanya support `action_plan|initiative|action_plan_instance`. Development Area dan Problem Statement BUKAN commentable entities (konsisten dengan Goal/KPI Area/Strategy yang juga tidak commentable). Tidak ada perubahan CHECK constraint.
- **Notifications**: entity_type pada notifications table adalah free text (tidak ada CHECK). emit_notification sudah mendukung entity_type apapun.

### EE-10. Problem Statement Label

Satu label tetap "Problem Statement". "Development Goal" hanya muncul sebagai sinonim di Keterangan Card. Tidak ada dropdown/toggle pemilih.

---

## 8. Open Questions

| # | Pertanyaan | Keputusan sementara | Perlu konfirmasi |
|---|---|---|---|
| OQ-1 | Problem Statement vs Development Goal -- satu label atau user memilih? | Satu label "Problem Statement"; "Development Goal" hanya di guidance. | Ya |
| OQ-2 | Seed 7 DA default -- auto-seed per org atau hanya contoh? | Tidak di-seed; muncul sebagai contoh di guidance. | Ya |
| OQ-3 | MBR default Initiative->AP = 3 (PRD) atau 1 (seed)? | Tetap shared rule min 1 (BUILD-PLAN "angka longgar"). | Ya |
| OQ-4 | Aktivasi DA -- wajib punya PS atau bisa tanpa? | Default mode hanya_peringatan, de facto tidak blocking. Bisa diubah via Settings. | Tidak |
| OQ-5 | Periode DA wajib? | Ya, wajib (konsisten semua planning card). | Tidak |
| OQ-6 | PS field wajib tambahan selain Nama/Periode/PIC? | Tidak ada. PS card ringan. | Ya |

---

## 9. Keputusan Mengikat (Resolusi Kontradiksi dari Grill)

| # | Kontradiksi | Resolusi | Alasan |
|---|---|---|---|
| K1 | FK problem_statements.development_area_id: draft AC mengatakan CASCADE, draft DC mengatakan RESTRICT | **ON DELETE RESTRICT** | Konsisten K5 Fase 4. CASCADE menghancurkan data eksekusi. |
| K2 | Draft problem-goals klaim "tabel sudah ada dari Fase 5" | **Tabel BELUM ada.** Hanya MBR seed string yang ada. Tabel harus dibuat Fase 6. | Verifikasi migrasi 0005-0011. |
| K3 | Draft DC-11 "TIDAK di-seed" vs draft AC-J1 "7 DA dibuat" | **TIDAK di-seed ke database.** AC-J dihapus. Card guidance berisi 7 nama sebagai contoh. | Tidak ada mekanisme PIC default; bukan template system. |
| K4 | Draft FR-4.1 "user memilih label" vs draft EE-13 "tidak ada dropdown" | **Satu label tetap "Problem Statement".** Tidak ada kolom type, tidak ada dropdown. | Database satu tabel, PRD menggunakan keduanya sebagai sinonim. |
| K5 | MBR default "3" (PRD/wiki) vs seed "1" (migrasi 0011) | **Tetap seed 1.** BUILD-PLAN Fase 5 mengkodifikasi "angka longgar". | Perubahan ke 3 memerlukan keputusan product owner + mungkin perubahan skema MBR. |
| K6 | initiatives_select policy tidak handle PIC PS/DA chain | **Diperluas.** Tambah `is_problem_statement_pic` di policy. | Tanpa ini, PIC DA/PS tidak bisa melihat Initiative Development. |
| K7 | activate_initiative tidak handle PIC PS | **Diperluas.** Tambah `is_problem_statement_pic` di otorisasi. | Tanpa ini, PIC PS yang mendelegasikan Initiative terkunci. |
| K8 | can_access_initiative (0008) tidak handle development chain | **Diperluas.** Tambah cek problem_statement_id chain. | Tanpa ini, Fase 3 collab gagal untuk Development Initiative. |
| K9 | tg_enforce_mbr_block_child baris 310: strategy_id null = return new | **Diubah**: if strategy_id null AND problem_statement_id null then return new. | Tanpa ini, Development Initiative melewati MBR enforcement. |

---

## 10. Handoff ke TDD

### Ringkasan Fitur
Fase 6 Development Workspace: tabel development_areas + problem_statements, initiatives.problem_statement_id FK + constraint mutual exclusivity, RLS policies + 8 helper functions untuk visibility chain Development, RPC activate_development_area + activate_problem_statement, MBR enforcement flip (hapus early-return, extend trigger tg_enforce_mbr_block_child), extend initiatives_select + action_plans_select + can_access_initiative + activate_initiative untuk Development path, seed card_guidance_contents, data layer mobile (development-areas.ts, problem-statements.ts, perubahan cards.ts), workspace dual-tab UI + 4 routes baru.

### File/Area yang Tersentuh
- `supabase/migrations/0012_fase6_development_workspace.sql`
- `mobile/src/lib/development-areas.ts` (baru)
- `mobile/src/lib/problem-statements.ts` (baru)
- `mobile/src/lib/cards.ts` (perubahan: NewInitiative, listInitiatives)
- `mobile/src/lib/workspace-copy.ts` (perubahan: WS_DEV_COPY)
- `mobile/src/lib/database.types.ts` (regenerasi)
- `mobile/src/app/(app)/development-area/new.tsx` (baru)
- `mobile/src/app/(app)/development-area/[id].tsx` (baru)
- `mobile/src/app/(app)/problem-statement/new.tsx` (baru)
- `mobile/src/app/(app)/problem-statement/[id].tsx` (baru)
- `mobile/src/app/(app)/(tabs)/workspace.tsx` (perubahan: dual-tab)
- `mobile/src/hooks/use-mbr.ts` (perubahan: handle Development compliance)
- `mobile/src/components/mbr-completion.tsx` (perubahan: handle Development card types)

### Prioritas Test (Red Phase)
1. DB contract tests: tabel, constraint, RLS policies, helper functions
2. RPC tests: activate_development_area, activate_problem_statement, check_minimum_breakdown_compliance (Development branch)
3. MBR trigger tests: tg_enforce_mbr_block_child untuk problem_statements dan initiatives Development
4. Visibility chain tests: PIC DA sees PS/Initiative/AP; PIC PS sees Initiative/AP
5. Backward-compat tests: Initiative datar Fase 1, Performance MBR, existing policies
6. Data layer unit tests: development-areas.ts, problem-statements.ts, cards.ts perubahan
7. UI component tests: workspace dual-tab, CRUD routes, MBR indicator