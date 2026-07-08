# Spec Final — Fase 2: Action Plan Repeat (Rencanapp EMS)

> Status: siap-eksekusi. Meresolusi seluruh must-fix dari grill produk/engineering/governance secara deterministik. Grounded pada PRD §26–29/§36/§38/§73–74, BUILD-PLAN Fase 2, dan migrasi aktual `0001_fase0_foundation.sql` / `0005_fase1_card_engine.sql` / `0006_fase1_fix_returning_rls.sql` (diverifikasi langsung pada commit ini).

## 1. Problem & Goals

### Problem
Fase 1 menutup loop eksekusi **satu-kali**: owner menugaskan Action Plan One Time, PIC submit bukti + nilai hasil, reviewer approve/reject. Namun mayoritas kerja operasional **berulang harian** (tutup buku harian, laporan marketing harian). Untuk ini EMS belum punya: (1) penjadwalan otomatis — `action_plans.repeat_setting` sudah ada (`0005:75`) tapi belum difungsikan; form mobile hard-code `one_time`; (2) penegakan deadline otomatis; (3) ukuran kedisiplinan (Repeat Compliance, PRD §38). Akibatnya loop harian masih menuntut intervensi manual tiap hari.

### Goals
1. **Repeat sebagai setting, bukan entity baru** — konfigurasi pada `action_plans` via tabel `action_plan_repeat_rules` (1/Action Plan).
2. **Auto-generate Instance terjadwal** — Daily/Weekly/Monthly/Custom dengan periode + jam deadline.
3. **Penegakan Aturan Terlewat otomatis** — Strict / Grace Period / Overdue Allowed; status `missed` ditetapkan job sistem.
4. **Repeat Compliance terukur** — metrik read-only (instance selesai tepat waktu ÷ total seharusnya), prasyarat data People & Score Fase 7.
5. **Bedakan Progress / Capaian / Compliance** secara tajam (PRD §36–38).
6. **Pertahankan invarian Fase 1 per instance** — anti-self-approval, evidence locking, submission versioning, RLS+RPC sebagai satu-satunya jalur tulis.

### Deliverable konkret
"Daily Finance Closing", Repeat Daily, 1–30 Juni 2026, deadline 23:00, missed_rule=Strict → **30 instance** auto-generate. PIC submit closing harian + selisih kas per instance; reviewer approve; instance lewat 23:00 tanpa submit → **Terlewat** otomatis; Compliance **28/30**.

### Gerbang Validasi
Daily closing + daily marketing report **2 minggu** kerja nyata; compliance harian **masuk akal** (penilaian kualitatif manual — lihat AC-30).

## 2. Keputusan Terkunci (resolusi grill — TIDAK lagi open question)

| # | Isu | Keputusan FINAL | Dampak |
|---|---|---|---|
| K1 | Generasi instance eager vs lazy | **EAGER**: `activate_action_plan` memanggil `generate_action_plan_instances` dalam transaksi aktivasi → seluruh periode dibuat sekaligus (30 instance terlihat langsung). Cron hanya untuk **mark-missed** + **backfill** bila aktivasi pernah gagal/diperpanjang. | AC-7, FR-B |
| K2 | Compliance untuk `overdue_allowed` | **Submit > deadline = TIDAK on-time** (konsisten PRD §38 "selesai tepat waktu"). Keterlambatan dicatat `submitted_late`/`late_minutes` untuk discipline Score Fase 7. | AC-18, AC-21, FR-F |
| K3 | Search instance | **NON-GOAL Fase 2**. FR/AC search dicabut. Query instance tetap lewat `can_access_action_plan` sehingga Search Fase 8 otomatis aman. | Non-goal |
| K4 | PIC/Reviewer per instance | **SNAPSHOT kolom** `pic_id`/`reviewer_id` immutable pada `action_plan_instances` + **CHECK `pic_id <> reviewer_id` level instance**. Sumber kebenaran anti-self-approval = kolom instance. | AC-9, AC-10, FR-C |
| K5 | Sumber timezone | **Tambah `organizations.timezone text default 'Asia/Jakarta'`** di migrasi 0007 (kolom TIDAK ada di `0001`). | AC-31, FR-E |
| K6 | Infra job | **Tambah `create extension pg_cron` + `cron.schedule`** di 0007 (tidak ada di repo) + Edge Function pemicu. | FR-B/E |
| K7 | Submission versioning | **Drop `unique(action_plan_id,version_number)`** + 2 partial unique index (per-instance & per-one-time) **DAN ubah where-clause `submit_action_plan` Fase 1** agar filter `action_plan_instance_id is null`. | AC-13, AC-40 |
| K8 | severity governance | **Tambah kolom `severity`** ke `governance_violations` di 0007 (tidak ada di `0005:174-183`). | AC-28 |

## 3. User Stories (ringkas, per peran)

Peran (per [[permission-model]]): CEO/Super Admin (akses penuh), Manager/Head (pemilik Initiative, pembuat Action Plan), PIC (eksekutor), Reviewer (≠ PIC). Instance **mewarisi** PIC & Reviewer via snapshot.

- **US-R1 Aktifkan Repeat** — Manager mengubah One Time → Repeat; muncul field frequency/periode/jam/aturan-terlewat/grace.
- **US-R2 Validasi kelengkapan** — RPC menolak aktivasi repeat tidak lengkap; card tetap draft.
- **US-R3 Auto-generate eager** — aktivasi → seluruh instance periode dibuat sinkron.
- **US-R4 Pilih Aturan Terlewat** — Strict (default) / Grace Period / Overdue Allowed.
- **US-R5 Pantau Progress & Compliance** — N/total vs tepat-waktu/total, dibedakan dari Capaian.
- **US-P1 Lihat instance** — PIC melihat daftar instance + deadline.
- **US-P2 Submit per instance** — bukti + nilai hasil; versioning per instance; evidence locking.
- **US-P3 Revisi** — submit ulang instance ditolak tanpa kehilangan versi.
- **US-P4 Sadari Terlewat** — status `missed` ditetapkan job sistem, tak bisa di-backdate.
- **US-V1 Review instance** — approve→done, reject→revision; anti-self-approval.
- **US-V2 Compliance hanya tepat-waktu & disetujui**.
- **US-C1 Visibilitas turunan penuh** — CEO/PIC Initiative lihat semua instance (lihat ≠ edit).
- **US-C2 Validasi 2 minggu** — gerbang Fase 2.

## 4. Functional Requirements

### A. Konfigurasi Repeat
- **FR-A1** Repeat = toggle pada `action_plans.repeat_setting` (sudah ada `0005:75`); TIDAK ada tabel `repeat_action_plans`. Saat `repeat`, config di `action_plan_repeat_rules`.
- **FR-A2** Repeat Rule wajib lengkap saat aktivasi: `frequency`, `repeat_start_date`, `repeat_end_date`, `time_of_day`, `missed_rule`; `grace_period_minutes>0` bila grace; `custom_dates` non-kosong bila custom.
- **FR-A3** `activate_action_plan` diperluas cabang repeat (server-side, bukan hanya form).
- **FR-A4** Deadline: one-time pakai `action_plans.deadline`; repeat pakai `repeat_end_date` + `time_of_day`.
- **FR-A5** Repeat Rule immutable untuk periode berjalan setelah instance lahir (frequency/time_of_day/missed_rule/grace/tanggal lampau). Memperpanjang `repeat_end_date` ke depan diizinkan.

### B. Generasi Instance
- **FR-B1** **EAGER** generate saat aktivasi (K1): seluruh tanggal valid dalam `[repeat_start_date, repeat_end_date]`. Cron: mark-missed + backfill bila perlu.
- **FR-B2** Generasi & mark-missed via job/RPC `SECURITY DEFINER`; client tidak pernah INSERT/backfill/manipulasi status.
- **FR-B3** Anti-duplikat `unique(action_plan_id, instance_date)` + `on conflict do nothing` (idempoten).
- **FR-B4** Wajib `repeat_end_date` (batas generasi). Cap jumlah instance/grace — lihat open question.
- **FR-B5** Custom = satu instance per tanggal `custom_dates`. Monthly = `month_days[]` (skip tanggal tak-ada di bulan). Weekly = `weekdays[]`.

### C. PIC, Reviewer, Inheritance
- **FR-C1** Instance menyimpan **snapshot** `pic_id`/`reviewer_id` immutable dari parent saat generate (K4). Anti-self-approval dicek terhadap KOLOM INSTANCE.
- **FR-C2** **CHECK `pic_id <> reviewer_id` di level `action_plan_instances`** (constraint parent `0005:86-87` tidak melindungi baris instance).
- **FR-C3** Visibilitas instance & rule via `can_access_action_plan(action_plan_id)` (`0005:226-241`), tidak diubah.

### D. Loop Eksekusi per Instance
- **FR-D1** `submit_action_plan_instance` baru (bukan overload Fase 1). Mengisi `action_plan_instance_id` **DAN** `action_plan_id` parent (wajib non-null, agar RLS submission/evidence Fase 1 tetap berlaku — `0005:531-542`). Version per-instance. `review_required=false` → instance langsung `done`.
- **FR-D2** Validasi `evidence_required`/`result_value_required` diambil dari parent (`0005:364-371`).
- **FR-D3** Review per instance via `review_action_plan_instance_submission`: approve→done, reject(alasan)→revision; anti-self-approval; `reviewer_override` dicatat governance.
- **FR-D4** Evidence locking per instance (tidak ada policy UPDATE/DELETE); revisi = versi baru; instance missed tak boleh di-backdate.
- **FR-D5** Parent `action_plans` repeat **tidak naik** ke `submitted`/`done`; tetap `in_progress` sepanjang periode (AC-42).

### E. Aturan & Status Terlewat
- **FR-E1** Tiga mode: Strict (>`deadline_at`→missed), Grace (>`deadline_at + grace`→missed), Overdue Allowed (tidak auto-missed, submit terlambat di-flag).
- **FR-E2** Status `missed` hanya job/RPC sistem; enum instance: `assigned/in_progress/submitted/done/revision/missed/archived` (terpisah dari enum `action_plans` Fase 1 yang tidak punya `missed`).
- **FR-E3** `deadline_at` timestamptz dihitung `instance_date + time_of_day @ organizations.timezone` (K5). Job timezone-aware.
- **FR-E4** Overdue Allowed menyimpan `submitted_late`/`late_minutes` di instance.
- **FR-E5** **Race-safety**: `mark_overdue_instances` HANYA men-target instance status `in ('assigned','in_progress')` TANPA `current_submission_id` valid dan tanpa `submitted_at <= deadline_at(+grace)` — penentu = `submitted_at` vs `deadline_at`, bukan urutan eksekusi (AC-38).
- **FR-E6** Backfill cron downtime: instance dibuat lalu langsung dievaluasi missed; `submitted_at` PIC selalu `now()` server (anti-backdate, AC-39).

### F. Progress, Capaian, Compliance
- **FR-F1** Bedakan tegas: Progress (selesai/total), Capaian (hasil tercapai?), Compliance (tepat waktu).
- **FR-F2** Compliance = metrik read-only via `get_repeat_compliance` (RPC). Numerator = `done` & submission disetujui & `submitted_at <= deadline_at` (Strict) / `<= deadline_at+grace` (Grace) / **overdue submit>deadline TIDAK on-time** (K2). Untuk revisi: dipakai submitted_at submission **yang disetujui** (AC-41). Denominator = total expected (exclude archived); `missed` masuk denominator, tidak numerator.
- **FR-F3** Compliance NULL untuk one_time.
- **FR-F4** Repeat Setting/Rule/Compliance bukan bobot planning (PRD §44).

### G. Audit & Governance
- **FR-G1** Activity Log append-only: `instance_created` (batch, detail JSONB daftar id), `instance_status_changed`, submit/review per instance, `instance_marked_overdue`. **Event yang ditulis JOB dicatat dengan actor sistem** (`actor_id NULL` + `detail.source='system_cron'`) karena `write_activity` (`0005:248-255`) memakai `auth.uid()`/`current_user_org()` yang NULL di konteks cron (AC-27).
- **FR-G2** Governance Violation dengan **kolom `severity`** (K8): `instance_missed`=medium, `self_approval_attempt`=high, `reviewer_override`=medium.

### H. Surfaces
- **FR-H1** Detail Action Plan Repeat menampilkan daftar/list instance + status + aksi submit/review. Mobile `repeat.ts` (tipe+pemanggil tipis).
- **FR-H2** Form New/Edit: toggle Repeat (default one_time, conditional render), frequency picker, date range, time picker, selector Aturan Terlewat, grace input (hanya Grace).
- **FR-H3** (Search instance = NON-GOAL, K3.)

### I. Invarian Tetap
- **FR-I1** RLS satu-satunya enforcement; tidak ada write client; RPC cron-wide di-revoke dari `authenticated`, grant hanya `service_role`/pg_cron (AC-33, anti privilege escalation lintas-tenant).
- **FR-I2** MBR tetap berlaku ke parent Initiative (engine MBR belum ada di Fase 1; Fase 2 tidak menambah enforcement baru — AC-32).
- **FR-I3** Isolasi multi-tenant: setiap RPC/policy memfilter via `can_access_action_plan` (cek org); snapshot pic/reviewer dari org yang sama (AC-25b).

## 5. Data Contracts

Migrasi baru: **`supabase/migrations/0007_fase2_repeat.sql`**.

### 5.1 Tabel baru `action_plan_repeat_rules`
```sql
create table public.action_plan_repeat_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  action_plan_id uuid not null references public.action_plans (id) on delete cascade,
  frequency text not null check (frequency in ('daily','weekly','monthly','custom')),
  weekdays int[],            -- frequency='weekly' (0=Min..6=Sab)
  month_days int[],          -- frequency='monthly' (1..31)
  custom_dates date[],       -- frequency='custom'
  repeat_start_date date not null,
  repeat_end_date date not null,
  time_of_day time not null,
  missed_rule text not null default 'strict'
    check (missed_rule in ('strict','grace_period','overdue_allowed')),
  grace_period_minutes int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_plan_id),
  constraint repeat_rules_period_order check (repeat_start_date <= repeat_end_date),
  constraint repeat_rules_grace_consistency check (
    (missed_rule='grace_period' and grace_period_minutes is not null and grace_period_minutes>0)
    or (missed_rule<>'grace_period' and grace_period_minutes is null)),
  constraint repeat_rules_custom_dates check (
    frequency<>'custom' or (custom_dates is not null and array_length(custom_dates,1)>0))
);
```

### 5.2 Tabel baru `action_plan_instances`
```sql
create table public.action_plan_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  action_plan_id uuid not null references public.action_plans (id) on delete cascade,
  repeat_rule_id uuid not null references public.action_plan_repeat_rules (id) on delete cascade,
  instance_date date not null,
  instance_time time not null,                 -- snapshot rule.time_of_day
  deadline_at timestamptz not null,            -- instance_date+instance_time @ org tz
  pic_id uuid references public.profiles (id) on delete set null,        -- snapshot immutable
  reviewer_id uuid references public.profiles (id) on delete set null,   -- snapshot immutable
  status text not null default 'assigned'
    check (status in ('assigned','in_progress','submitted','done','revision','missed','archived')),
  current_submission_id uuid references public.action_plan_submissions (id) on delete set null,
  missed_reason text,
  submitted_at timestamptz,
  submitted_late boolean not null default false,
  late_minutes int,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_plan_id, instance_date),
  constraint instances_pic_ne_reviewer check (pic_id is null or reviewer_id is null or pic_id <> reviewer_id)
);
```

### 5.3 Perubahan tabel existing
```sql
-- timezone organisasi (K5) — tidak ada di 0001
alter table public.organizations add column timezone text not null default 'Asia/Jakarta';

-- severity governance (K8) — tidak ada di 0005:174-183
alter table public.governance_violations
  add column severity text check (severity in ('low','medium','high','critical'));

-- submission ↔ instance + versioning per-instance (K7)
alter table public.action_plan_submissions
  add column action_plan_instance_id uuid references public.action_plan_instances (id) on delete cascade;
alter table public.action_plan_submissions
  drop constraint action_plan_submissions_action_plan_id_version_number_key;
create unique index uq_submission_version_onetime
  on public.action_plan_submissions (action_plan_id, version_number)
  where action_plan_instance_id is null;
create unique index uq_submission_version_instance
  on public.action_plan_submissions (action_plan_instance_id, version_number)
  where action_plan_instance_id is not null;
```
**WAJIB** (AC-40): ubah where-clause penghitung versi di `submit_action_plan` Fase 1 (`0005:373-374`) menjadi `where action_plan_id = p_action_plan_id and action_plan_instance_id is null`. Migrasi memverifikasi tidak ada data one-time existing yang melanggar.

### 5.4 Index
```sql
create index idx_repeat_rules_action_plan on public.action_plan_repeat_rules (action_plan_id);
create index idx_instances_action_plan on public.action_plan_instances (action_plan_id);
create index idx_instances_pic on public.action_plan_instances (pic_id);
create index idx_instances_reviewer on public.action_plan_instances (reviewer_id);
create index idx_instances_deadline on public.action_plan_instances (deadline_at)
  where status in ('assigned','in_progress');
create index idx_submissions_instance on public.action_plan_submissions (action_plan_instance_id);
```

### 5.5 RPC (baru & berubah)
- `set_action_plan_repeat_rule(p_action_plan_id, p_frequency, p_weekdays, p_month_days, p_custom_dates, p_repeat_start_date, p_repeat_end_date, p_time_of_day, p_missed_rule, p_grace_period_minutes) returns uuid` — upsert; otorisasi `created_by`/PIC Initiative/`manage_others_cards`; set `repeat_setting='repeat'`; **immutability guard** (`exists instance` → raise); `write_activity('action_plan',...,'set_repeat_rule',...)`.
- `activate_action_plan(...)` **berubah** — cabang repeat memvalidasi rule lengkap (bukan deadline one-time), lalu memanggil `generate_action_plan_instances` **eager** (K1).
- `generate_action_plan_instances(p_action_plan_id uuid, p_through_date date) returns int` — `p_action_plan_id` NULL = mode cron-wide (revoke dari authenticated). Eager: `p_through_date = repeat_end_date`. Idempoten `on conflict (action_plan_id,instance_date) do nothing`. Snapshot pic/reviewer/time dari parent; hitung `deadline_at` @ org tz.
- `mark_overdue_instances(p_now timestamptz default now()) returns int` — job; race-safe (FR-E5); per missed_rule; actor sistem; `write_activity` + `governance_violations(severity='medium')`.
- `submit_action_plan_instance(p_instance_id, p_note, p_evidence jsonb, p_result_values jsonb) returns uuid` — hanya `instance.pic_id=auth.uid()`; isi `action_plan_id` parent + `action_plan_instance_id`; version per-instance; `submitted_late`/`late_minutes`; `review_required=false`→done; parent tak berubah status.
- `review_action_plan_instance_submission(p_submission_id, p_decision, p_reason) returns void` — anti-self-approval vs `instance.pic_id`; reviewer_override→governance.
- `get_repeat_compliance(p_action_plan_id uuid) returns table(expected_count int, on_time_count int, missed_count int, done_count int, compliance numeric)` — read-only; definisi on-time per K2; NULL utk one_time.

### 5.6 Job infra (K6) — di 0007
```sql
create extension if not exists pg_cron;
-- contoh; interval final disepakati saat implementasi
select cron.schedule('mark-overdue', '*/15 * * * *', $$select public.mark_overdue_instances()$$);
select cron.schedule('backfill-instances', '5 0 * * *', $$select public.generate_action_plan_instances(null, current_date)$$);
revoke execute on function public.generate_action_plan_instances(uuid, date) from public, anon, authenticated;
revoke execute on function public.mark_overdue_instances(timestamptz) from public, anon, authenticated;
```
Edge Function pemicu opsional: `supabase/functions/cron-repeat/index.ts` (service_role).

### 5.7 RLS
```sql
alter table public.action_plan_repeat_rules enable row level security;
alter table public.action_plan_instances    enable row level security;
create policy "repeat_rules_select" on public.action_plan_repeat_rules
  for select to authenticated using (public.can_access_action_plan(action_plan_id));
create policy "instances_select" on public.action_plan_instances
  for select to authenticated using (public.can_access_action_plan(action_plan_id));
```
Tidak ada policy INSERT/UPDATE/DELETE (semua via RPC). Submission instance mengisi `action_plan_id` parent → policy `submissions_select`/`evidence_select`/`result_values_select` Fase 1 otomatis berlaku.

### 5.8 Tipe TypeScript (`mobile/src/lib/repeat.ts`)
```ts
export type RepeatRule = Tables<'action_plan_repeat_rules'>;
export type Instance = Tables<'action_plan_instances'>;
export type InstanceWithSubmissions = Instance & {
  pic: PersonRef; reviewer: PersonRef; action_plan_submissions: SubmissionDetail[];
};
export const INSTANCE_STATUS_LABEL = { assigned:'Ditugaskan', in_progress:'Dikerjakan',
  submitted:'Menunggu Review', done:'Selesai', revision:'Revisi Diperlukan',
  missed:'Terlewat', archived:'Diarsipkan' };
// STATUS_TONE: missed -> 'danger'. Label instance TERPISAH dari label parent action_plans.
export async function setRepeatRule(actionPlanId: string, input: RepeatRuleInput): Promise<string>;
export async function listInstances(actionPlanId: string): Promise<InstanceWithSubmissions[]>;
export async function getInstance(id: string): Promise<InstanceWithSubmissions>;
export async function submitInstance(args: {instanceId:string; note:string|null; evidence:EvidenceInput[]; resultValues:ResultValueInput[]}): Promise<string>;
export async function reviewInstanceSubmission(args: {submissionId:string; decision:'approve'|'reject'; reason:string|null}): Promise<void>;
export async function getRepeatCompliance(actionPlanId: string): Promise<{expected_count:number; on_time_count:number; missed_count:number; done_count:number; compliance:number|null}>;
```
`EvidenceInput`/`ResultValueInput`/`SubmissionDetail`/`PersonRef` reuse dari `cards.ts`. `database.types.ts` di-regenerate.

## 6. Acceptance Criteria

Lihat field `acceptance_criteria` (AC-1 … AC-42, format Given/When/Then). Semuanya dapat diuji kecuali AC-30 (gerbang validasi) yang ditandai eksplisit sebagai penilaian kualitatif manual go/no-go.

## 7. Edge Cases (ringkas)
- Aktivasi repeat tidak lengkap → tolak, card draft (AC-2).
- Job idempoten + backfill tanpa backdating (AC-8, AC-39).
- Race submit-vs-mark-missed → submitted_at penentu (AC-38).
- Deep-link instance tak-terakses → "Instance tidak ditemukan atau Anda tidak memiliki akses." (jangan bocorkan keberadaan).
- expected=0 → tampilkan "—" bukan 0% (anti div-by-zero).
- one_time → bagian instance & compliance disembunyikan.
- instance missed (Strict) → aksi submit disembunyikan; submit ditolak "sudah Terlewat".
- Archive parent mid-period → generasi berhenti, instance archived exclude dari denominator.

## 8. Open Questions
Lihat field `open_questions` (threshold governance, perpanjangan periode & compliance, cap grace/jumlah instance, perilaku archive mid-period, late-evidence pada Strict, batas akhir overdue, time_of_day per-tanggal custom).

## 9. Handoff ke TDD
- **Migrasi `0007_fase2_repeat.sql`** dulu (skema + RPC + RLS + cron + ALTER existing) — uji constraint & RLS sebagai unit pertama (red→green).
- **Urutan test**: (1) constraints repeat_rules/instances, (2) `set_action_plan_repeat_rule` (otorisasi+immutability), (3) `generate_action_plan_instances` (daily/weekly/monthly/custom + idempoten), (4) `mark_overdue_instances` (3 mode + race), (5) `submit_action_plan_instance` + versioning per-instance + review_required, (6) `review_action_plan_instance_submission` (anti-self-approval), (7) `get_repeat_compliance` (28/30, overdue, revisi, archived), (8) RLS visibilitas & multi-tenant, (9) regresi `submit_action_plan` one-time (AC-40), (10) mobile `repeat.ts` pemanggil tipis + label.
- **Deliverable verifikasi end-to-end**: Daily Finance Closing 1–30 Juni → 30 instance, 2 missed, compliance 28/30.
- **Paths**: lihat `tdd_handoff.paths`.