# Spec Fase 8 — Governance & Admin Lengkap
**Rencanapp V1.8.1 — Exit Spec**
Versi: 1.0 | Tanggal: 2026-06-25 | Status: Final (post-grill, siap TDD)

---

## 0. Catatan Koreksi Penting (dari grill)

Spec ini sudah mengintegrasikan semua must-fix dari tiga putaran grill. Koreksi kritis yang dilakukan terhadap draft awal:

| # | Koreksi | Sumber Error | Resolusi |
|---|---|---|---|
| C1 | Permission key `view_governance_violation` (singular, BUKAN plural) | Spec draft pakai plural; DB migration 0001 + RLS 0005 line 564 pakai singular | Seluruh spec menggunakan singular sesuai DB |
| C2 | `write_activity_system` tetap 6-parameter `(p_org, p_actor, p_entity_type, p_entity_id, p_action, p_detail)` | Draft DC-8.3.11 mendefinisikan ulang dengan 5 param, akan membuat overload function | Migration 0014 TIDAK mendefinisikan ulang; trigger Fase 8 gunakan fungsi existing dengan `p_actor=null` |
| C3 | Status 'cancelled' harus ditambahkan via ALTER TABLE ke 7 tabel card | CHECK constraint existing hanya allow 'draft','active','done','archived'; 'dibatalkan' tidak ada | Migration 0014 menambah `ALTER TABLE ... ADD VALUE 'cancelled'` atau DROP+ADD constraint |
| C4 | Column name konsisten: `requestor_id` (bukan `requested_by`) | Draft campuran antara keduanya | Seluruh spec pakai `requestor_id` |
| C5 | Table count: 41 existing + 11 baru = 52 public; exit gate menggunakan `table_schema IN ('public','auth')` untuk mencapai 53 dengan `auth.users` | Draft klaim 53 public tables | Exit gate query dikoreksi |
| C6 | Permission seed menggunakan per-row WHERE NOT EXISTS guard | Draft menyebut guard tapi tidak mendefinisikan pattern yang benar | Seed pattern per-key dikunci |
| C7 | Smoke test AC menggunakan `action` bukan `action_type` | `activity_logs` kolom bernama `action` (0005 line 169), bukan `action_type` | AC dikoreksi |
| C8 | `manage_permissions` (draft) → `manage_users_permissions` (DB) | 0001 migration line 208 menggunakan `manage_users_permissions` | Seluruh spec pakai `manage_users_permissions` |
| C9 | Governance Violation logging untuk operasi yang ditolak: best-effort, tidak guaranteed karena PG rollback semantics | Fase 7 migration 0013 line 684-686 mendokumentasikan limitation ini | Semua AC yang mengandung "Governance Violation terekam" pada operasi yang ditolak ditandai (best-effort) |
| C10 | Trigger guard pada `action_plans.deadline` untuk mencegah bypass DCR workflow | Draft tidak menyebut ini; existing UPDATE RLS policy membolehkan PIC update semua kolom | AC-8.2.8 + trigger spec ditambahkan |
| C11 | RPC `approve_cancellation` hilang dari draft | DC-8.3 tidak memiliki RPC untuk approve pending cancellation meski tabel punya kolom approval_status | DC-8.3.8 (approve_cancellation) ditambahkan |
| C12 | Activity Log system events (actor_id=null) tidak visible ke acting user tanpa view_activity_log | RLS policy `actor_id = auth.uid()` tidak match null | DC-8.4.1 memperluas policy |

---

## 1. Problem Statement

Setelah Fase 0–7, Rencanapp memiliki loop eksekusi penuh tetapi lima gap mencegah go-live internal:

**Gap 1 — Struktur Organisasi**: Tabel `departments`, `positions`, `teams`, `team_members` belum ada. Assignment PIC menggunakan `profiles.position_title` (string bebas). Admin tidak bisa mengatur struktur org dari dalam app.

**Gap 2 — Lifecycle Card Tidak Lengkap**: Deadline Change Request, Cancellation, dan Evaluation belum ada. Perubahan deadline bisa dilakukan langsung tanpa audit trail, melanggar governance invariant.

**Gap 3 — Settings Tidak Dapat Dikonfigurasi**: Card Completion Rule, Keterangan Card, Status, Prioritas, dan Notifications Rule tidak dapat diubah dari UI tanpa akses langsung ke database.

**Gap 4 — Audit Pages Tidak Ada**: Tabel `activity_logs` dan `governance_violations` sudah terisi otomatis sejak Fase 1, tapi tidak ada halaman UI untuk melihat datanya.

**Gap 5 — Archive dan Search Belum Terintegrasi Permission**: Card usang tetap muncul di Workspace aktif. Search belum ada.

Tanpa Fase 8:
- Tidak semua 53 tabel PRD §83 terpakai — exit criteria belum terpenuhi.
- Admin tidak bisa mengatur struktur org dari dalam app.
- Perubahan deadline, pembatalan, dan evaluasi tidak meninggalkan jejak audit yang benar.
- Governance Violation dan Activity Log tidak bisa diawasi dari UI.
- Organisasi tidak bisa menyesuaikan rules tanpa akses langsung ke database.

---

## 2. Tujuan

| # | Goal | Metrik Sukses |
|---|---|---|
| G1 | Org structure penuh tersedia | CRUD dept/position/team/team_member via RLS + RPC; 4 tabel baru aktif |
| G2 | Lifecycle card lengkap | Tabel DCR, deadline_change_logs, cancellations, evaluations ada + RPC + UI; anti-self-approval enforced |
| G3 | Settings admin lengkap | 5 Settings subsection baru berfungsi; perubahan dicatat activity_logs |
| G4 | Activity Log page | ≥6 tipe event tampil; filter berfungsi; append-only (tidak ada tombol hapus/edit) |
| G5 | Governance Violation page | Severity badge 4-tier; filter berfungsi; data dari `governance_violations` |
| G6 | Archive + Search | Archive card berfungsi; search RLS-scoped; archived card tidak muncul di Workspace aktif |
| G7 | Confidential Access Rules | Tabel + RLS + UI; CEO set rule; two-layer access check |
| G8 | Video Brief + Brief Understanding (opsional UI) | DDL wajib ada; UI jika resource memungkinkan |
| G9 | 53 tabel PRD §83 | `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ('public','auth')` ≥ 53 |
| G10 | Semua UI Bahasa Indonesia | Tidak ada teks UI Bahasa Inggris selain istilah kerja baku |

---

## 3. Non-Goals

Lihat bagian header — 17 non-goals mengikat (NG1–NG17). Tidak ada bobot/weight di planning card. Tidak ada hard delete governance entities. Tidak ada Fase 9.

---

## 4. Peran & Permission

### 4.1 Peran
| Singkatan | Peran | Hak bawaan yang relevan |
|---|---|---|
| CEO | CEO / Super Admin | Semua permission; auto-approve cancellation |
| MGR | Management / Manager | Subset permission; bisa di-grant `create_department`, `manage_teams`, `review_deadline_changes` |
| PIC | Staff / eksekutor AP | Mengajukan DCR; submit bukti; tidak bisa self-approve |
| RVW | Reviewer Action Plan | Approve/reject DCR; tidak bisa approve DCR yang dia ajukan sendiri |

### 4.2 Permission Keys
**Permission yang sudah ada sejak Fase 0 (JANGAN di-seed ulang):**
- `view_activity_log` (migration 0001 line 213)
- `view_governance_violation` — **SINGULAR** (migration 0001 line 214)
- `manage_settings` (migration 0001 line 207)
- `manage_users_permissions` (migration 0001 line 208)
- `manage_card_completion_rule` (migration 0001 line 212)

**Permission baru yang di-seed migration 0014 (6 keys, per-row WHERE NOT EXISTS guard):**
```sql
INSERT INTO public.permissions (key, label)
SELECT key, label FROM (VALUES
  ('create_department',          'Membuat Department'),
  ('manage_positions',           'Kelola Posisi'),
  ('manage_teams',               'Kelola Tim'),
  ('manage_confidential_access', 'Kelola Akses Rahasia'),
  ('review_deadline_changes',    'Review Perubahan Deadline'),
  ('manage_video_briefs',        'Kelola Video Brief')
) AS v(key, label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE p.key = v.key
);
```

Default seeding: CEO/Super Admin mendapat semua; C-Level/Management mendapat `create_department`, `manage_teams`, `review_deadline_changes`; Staff tidak mendapat satupun dari daftar baru.

---

## 5. User Stories (ringkasan)

### US-8.A — Org Struktur
- **US-8.A.1** CEO/ADM membuat Department (permission: `create_department`)
- **US-8.A.2** CEO/ADM membuat Position (permission: `manage_positions`)
- **US-8.A.3** CEO/MGR membuat Team dan menambah anggota (permission: `manage_teams`)
- **US-8.A.4** CEO/ADM mengedit dan soft-deactivate Department/Position/Team
- **US-8.A.5** CEO mengelola Role Template (permission: `manage_users_permissions`)

### US-8.B — Activity Log Page
- **US-8.B.1** CEO/ADM melihat Activity Log seluruh org (permission: `view_activity_log`)
- **US-8.B.2** Staff melihat Activity Log card miliknya (via tab Riwayat di detail card; RLS dibatasi)

### US-8.C — Governance Violation Page
- **US-8.C.1** CEO/ADM melihat Governance Violations (permission: `view_governance_violation` — singular)

### US-8.D — Deadline Change Request
- **US-8.D.1** PIC mengajukan DCR dengan alasan dan dampak
- **US-8.D.2** Reviewer/ADM menyetujui atau menolak DCR (anti-self-approval)
- **US-8.D.3** PIC melihat riwayat DCR miliknya

### US-8.E — Cancellation
- **US-8.E.1** PIC/MGR membatalkan card (CEO: auto-approve; non-CEO: pending approval)
- **US-8.E.2** CEO/approver menyetujui pending cancellation request
- **US-8.E.3** User melihat riwayat cancellation

### US-8.F — Evaluation
- **US-8.F.1** PIC/Reviewer mencatat Evaluation setelah Initiative selesai (opsional; anti-self)
- **US-8.F.2** Reviewer melihat Evaluation Initiative

### US-8.G — Archive & Search
- **US-8.G.1** CEO/MGR mengarsipkan card (soft-delete ke 'archived')
- **US-8.G.2** User mencari card/entity (Search global; RLS-scoped)

### US-8.H — Confidential Access
- **US-8.H.1** CEO menetapkan Confidential Access Rule (permission: `manage_confidential_access`)
- **US-8.H.2** Sistem menolak akses tanpa rule dan mencatat Governance Violation (best-effort)

### US-8.I — Settings Lengkap
- **US-8.I.1** CEO/ADM mengedit Card Completion Rule (permission: `manage_card_completion_rule`)
- **US-8.I.2** CEO/ADM mengedit Keterangan Card (permission: `manage_card_completion_rule`)
- **US-8.I.3** CEO/ADM mengelola Status & Prioritas Card (permission: `manage_settings`)
- **US-8.I.4** CEO/ADM mengedit Notifications Rule (permission: `manage_settings`)
- **US-8.I.5** CEO melihat dan mengelola User & Permission (permission: `manage_users_permissions`)

### US-8.J — Video Brief (Opsional)
- **US-8.J.1** CEO/ADM menambahkan Video Brief ke Initiative (permission: `manage_video_briefs`)
- **US-8.J.2** Staff menandai telah menonton Video Brief

---

## 6. Functional Requirements

### FR-8.1 — Org Struktur

**FR-8.1.1** Tabel `departments`, `positions`, `teams`, `team_members` dibuat via migration 0014 dengan RLS aktif. Setiap tabel memiliki `organization_id` FK ke `organizations`. Tidak ada FK langsung dari `profiles` ke `departments` atau `positions`.

**FR-8.1.2** Settings → Departemen: CRUD dengan permission `create_department`. Soft-deactivate via flag (kolom `is_active boolean default true`). Tidak ada hard delete.

**FR-8.1.3** Settings → Jabatan: CRUD dengan permission `manage_positions`. Boleh terhubung ke department (FK opsional).

**FR-8.1.4** Settings → Tim: CRUD dengan permission `manage_teams`. `team_members` junction table (composite PK `team_id + profile_id`). Satu user boleh bergabung ke banyak tim.

**FR-8.1.5** Settings → Role Template: view dan edit default permission per template (permission: `manage_users_permissions`). Perubahan template tidak serta-merta mengubah `user_permissions` yang sudah ada; berlaku untuk assignment role baru.

### FR-8.2 — Deadline Change Request

**FR-8.2.1** Scope Fase 8: hanya `entity_type = 'action_plan'`. Card type lain (goal, kpi_area, strategy, initiative) dapat di-expand di iterasi berikutnya setelah approver resolution path untuk non-AP entities didefinisikan. *(Resolusi OQ-1)*

**FR-8.2.2** Saat Action Plan berstatus active, PIC tidak boleh mengubah `action_plans.deadline` langsung. Trigger BEFORE UPDATE pada `action_plans` memblokir perubahan kolom `deadline` jika `status = 'active'` kecuali melalui RPC `review_deadline_change` (SECURITY DEFINER yang di-set `skip_deadline_trigger = true` via session variable atau via UPDATE dilakukan di RPC SECURITY DEFINER).

**FR-8.2.3** Form DCR: deadline lama (pre-filled, read-only), deadline baru (date picker; wajib > old_deadline dan > org_today()), alasan (wajib), dampak jika ditolak (opsional), catatan bukti (opsional). Disimpan via RPC `create_deadline_change_request`.

**FR-8.2.4** Approver: Reviewer AP (action_plans.reviewer_id) atau user dengan permission `review_deadline_changes`. Anti-self-approval: `approver_id <> requestor_id` — enforced di RPC + CHECK constraint.

**FR-8.2.5** Partial UNIQUE INDEX: `CREATE UNIQUE INDEX ON deadline_change_requests (entity_type, entity_id) WHERE status = 'pending'` — mencegah race condition duplikasi pending request.

**FR-8.2.6** Setelah approved: `action_plans.deadline` diperbarui ke `new_deadline`; row masuk `deadline_change_logs` (action='approved'). Setelah rejected: deadline tidak berubah; row masuk `deadline_change_logs` (action='rejected'). Keduanya masuk `activity_logs`.

**FR-8.2.7** `deadline_change_logs` adalah append-only (trigger `tg_block_delete_append_only`).

### FR-8.3 — Cancellation

**FR-8.3.1** Semua card type dapat dibatalkan. Card dengan child card active tidak dapat dibatalkan — RPC mengembalikan error dengan jumlah child aktif.

**FR-8.3.2** Form: pilih alasan dari enum (prioritas berubah / solusi diganti / resource tidak tersedia / salah asumsi / risiko terlalu besar / lainnya) + keterangan bebas (wajib jika 'lainnya').

**FR-8.3.3** CEO: `approval_status = 'auto_approved'`, status card langsung berubah ke `'cancelled'`. Non-CEO: `approval_status = 'pending'`, status card belum berubah — butuh RPC `approve_cancellation`.

**FR-8.3.4** `cancellations` adalah append-only (trigger `tg_block_delete_append_only`).

**FR-8.3.5** Card cancelled tidak muncul di Workspace aktif (filter: `status NOT IN ('cancelled','archived')`). Dapat ditemukan via Search oleh user berwenang.

### FR-8.4 — Evaluation

**FR-8.4.1** Initiative berstatus 'done' → UI menampilkan prompt "Catat Evaluasi?" (tidak memblokir, opsional). Evaluasi ditulis oleh Reviewer Initiative — bukan PIC-nya (anti-self).

**FR-8.4.2** Field: target tercapai (ya/sebagian/tidak), hasil utama, faktor berhasil, faktor gagal, pelajaran, perlu jadi SOP, perlu rollout.

**FR-8.4.3** UPSERT via RPC `record_evaluation` (unique constraint pada initiative_id — satu baris per initiative; UPDATE diizinkan untuk revisi oleh evaluator yang sama; DELETE diblokir oleh trigger). *(Resolusi OQ-2: UPDATE allowed)*

**FR-8.4.4** CHECK constraint: `evaluations.pic_id IS NULL OR pic_id <> evaluated_by`. RPC mengisi `pic_id` dari `initiatives.pic_id` saat INSERT — tidak perlu dipass oleh caller.

### FR-8.5 — Archive & Search

**FR-8.5.1** Card berstatus 'done' atau 'cancelled' dapat diarsipkan via RPC `archive_card`. Status menjadi 'archived'; `archived_at` diisi timestamp (timezone org).

**FR-8.5.2** Card active tidak dapat langsung diarsipkan (harus done/cancelled terlebih dahulu).

**FR-8.5.3** Search RPC `search_cards(p_query text, p_entity_types text[], p_include_archived boolean)` — UNION dari SELECT per entity type dengan filter RLS inline (SECURITY DEFINER menggunakan helper `can_access_*()`, bukan bypass). Fase 8 mengimplementasikan minimal 8 entity types: Goal, KPI Area, Strategy, Initiative, Action Plan, Development Area, Problem Statement, People.

**FR-8.5.4** Search mengikuti permission — hasil hanya untuk data yang boleh diakses user berdasarkan RLS (PIC/Reviewer/PIC-induk/view_all_workspace).

### FR-8.6 — Confidential Access

**FR-8.6.1** Tabel `confidential_access_rules` menyimpan whitelist per entity. Granularitas: per-card secara keseluruhan (seluruh field card tersembunyi bagi non-whitelist). *(Resolusi OQ-4: per-card)*

**FR-8.6.2** Implementasi: `can_access_initiative()` dan `can_access_action_plan()` di-CREATE OR REPLACE di migration 0014 untuk menambahkan subquery ke `confidential_access_rules`. PIC card selalu tetap bisa akses card miliknya.

**FR-8.6.3** Upaya akses tanpa izin: RLS mengembalikan 0 baris; UI menampilkan "Card tidak ditemukan atau tidak dapat diakses."; Governance Violation high dicatat (best-effort).

### FR-8.7 — Activity Log Page

**FR-8.7.1** Halaman Settings → Activity Log (permission: `view_activity_log`). Read-only, append-only, tidak ada tombol hapus/edit.

**FR-8.7.2** Menampilkan: waktu, action (minimal 6 tipe berbeda), entity terkait, actor (nama user, atau "Sistem" jika actor_id=null), keterangan. Filter: tipe action, aktor, rentang tanggal.

**FR-8.7.3** RLS fix: perluas policy SELECT activity_logs agar entri dengan `actor_id = NULL` (system events) tetap visible bagi user yang punya `view_activity_log`. Current policy sudah mengizinkan ini (`actor_id = auth.uid() OR has_permission('view_activity_log')`); entri actor=null visible ke view_activity_log holders, bukan ke user biasa.

### FR-8.8 — Governance Violation Page

**FR-8.8.1** Halaman Settings → Governance Violation (permission: `view_governance_violation` — singular sesuai DB). Read-only, append-only.

**FR-8.8.2** Severity 4-tier: low (abu), medium (kuning), high (oranye), critical (merah). Warna bukan satu-satunya sinyal — label teks wajib tampil. Filter: severity, tipe, aktor, tanggal.

**FR-8.8.3** Jenis pelanggaran Fase 8 yang ditambahkan: `self_approve_deadline_change` (critical), `deadline_change_overuse` (medium), `cancel_without_permission` (high), `evaluate_self` (high), `unauthorized_confidential_access` (high), `settings_invalid_key` (critical), `evaluation_missing` (low, jika org enforce evaluasi).

### FR-8.9 — Settings Lengkap

**FR-8.9.1** Settings screen di `settings.tsx` diperluas dengan SECTIONS baru yang semuanya memiliki `href` aktif (tidak placeholder). Permission-aware: section hanya tampil jika `can(permission_key)` true.

**FR-8.9.2** Card Completion Rule (permission: `manage_card_completion_rule`) — edit via `card_completion_rules` table yang sudah ada. Perubahan tidak retroaktif pada card yang sudah active.

**FR-8.9.3** Keterangan Card (permission: `manage_card_completion_rule`) — edit via `card_guidance_contents` table yang sudah ada.

**FR-8.9.4** Status & Prioritas (permission: `manage_settings`) — custom values disimpan via `upsert_settings`. Default sistem tidak dapat dihapus.

**FR-8.9.5** Notifications Rule (permission: `manage_settings`) — via `upsert_settings` whitelist.

**FR-8.9.6** RPC `upsert_settings` whitelist keys Fase 8: `card_completion_rule_*` (per card type), `notification_rule_deadline_reminder`, `notification_rule_overdue_escalation`, `confidential_access_mode`, `deadline_change_max_per_card`. Key di luar whitelist → exception + Governance Violation 'critical' (best-effort).

### FR-8.10 — Video Brief (Opsional)

**FR-8.10.1** DDL `video_briefs` dan `brief_understanding_records` wajib ada di migration 0014 meski UI defer. Ini memenuhi exit gate tabel count.

**FR-8.10.2** Jika UI diimplementasi: permission `manage_video_briefs` untuk add/edit; `can_access_initiative()` untuk read.

---

## 7. Data Contracts

### 7.1 Migration 0014 — DDL Baru

#### 7.1.1 `departments`
```sql
CREATE TABLE IF NOT EXISTS public.departments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
-- Trigger: log_card_creation('department') AFTER INSERT
-- Trigger: set_updated_at BEFORE UPDATE
```

#### 7.1.2 `positions`
```sql
CREATE TABLE IF NOT EXISTS public.positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id   uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name            text NOT NULL,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
```

#### 7.1.3 `teams`
```sql
CREATE TABLE IF NOT EXISTS public.teams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id   uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name            text NOT NULL,
  description     text,
  lead_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
```

#### 7.1.4 `team_members`
```sql
CREATE TABLE IF NOT EXISTS public.team_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_in_team    text,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, profile_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
```

#### 7.1.5 `deadline_change_requests`
```sql
CREATE TABLE IF NOT EXISTS public.deadline_change_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type        text NOT NULL CHECK (entity_type = 'action_plan'),  -- Fase 8: hanya AP
  entity_id          uuid NOT NULL,  -- polymorphic; referential integrity via trigger
  old_deadline       date NOT NULL,
  new_deadline       date NOT NULL,
  reason             text NOT NULL,
  impact_if_rejected text,
  evidence_note      text,
  requestor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approver_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason   text,
  responded_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dcr_requestor_ne_approver
    CHECK (approver_id IS NULL OR requestor_id <> approver_id)
);
-- Partial unique index: hanya satu pending per entity
CREATE UNIQUE INDEX IF NOT EXISTS dcr_one_pending_per_entity
  ON public.deadline_change_requests (entity_type, entity_id)
  WHERE status = 'pending';
ALTER TABLE public.deadline_change_requests ENABLE ROW LEVEL SECURITY;
```

#### 7.1.6 `deadline_change_logs`
```sql
CREATE TABLE IF NOT EXISTS public.deadline_change_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id      uuid NOT NULL REFERENCES public.deadline_change_requests(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN ('submitted','approved','rejected','cancelled')),
  actor_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deadline_change_logs ENABLE ROW LEVEL SECURITY;
-- Trigger: tg_block_delete_append_only BEFORE DELETE
```

#### 7.1.7 `cancellations`
```sql
CREATE TABLE IF NOT EXISTS public.cancellations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type     text NOT NULL
    CHECK (entity_type IN ('action_plan','initiative','strategy','kpi_area','goal',
                           'development_area','problem_statement')),
  entity_id       uuid NOT NULL,
  cancelled_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason          text NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('auto_approved','pending','approved','rejected')),
  approved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;
-- Trigger: tg_block_delete_append_only BEFORE DELETE
```

#### 7.1.8 `evaluations`
```sql
CREATE TABLE IF NOT EXISTS public.evaluations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  initiative_id       uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  target_achieved     text CHECK (target_achieved IN ('ya','sebagian','tidak')),
  results             text,
  success_factors     text[],
  failure_factors     text[],
  lessons_learned     text,
  should_become_sop   boolean NOT NULL DEFAULT false,
  rollout_needed      boolean NOT NULL DEFAULT false,
  rollout_notes       text,
  evaluated_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  pic_id              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiative_id),
  CONSTRAINT evaluations_pic_ne_evaluator
    CHECK (pic_id IS NULL OR pic_id <> evaluated_by)
);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
-- Trigger: tg_block_delete_append_only BEFORE DELETE (UPDATE diizinkan untuk revisi)
```

#### 7.1.9 `confidential_access_rules`
```sql
CREATE TABLE IF NOT EXISTS public.confidential_access_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type     text NOT NULL
    CHECK (entity_type IN ('action_plan','initiative','strategy','kpi_area','goal')),
  entity_id       uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_level    text NOT NULL DEFAULT 'restricted'
    CHECK (access_level IN ('restricted','confidential')),
  granted_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approval_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, user_id)
);
ALTER TABLE public.confidential_access_rules ENABLE ROW LEVEL SECURITY;
```

#### 7.1.10 `video_briefs` (DDL wajib; UI opsional)
```sql
CREATE TABLE IF NOT EXISTS public.video_briefs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  initiative_id   uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  brief_url       text NOT NULL,
  duration_seconds int,
  description     text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiative_id)
);
ALTER TABLE public.video_briefs ENABLE ROW LEVEL SECURITY;
```

#### 7.1.11 `brief_understanding_records` (DDL wajib; UI opsional)
```sql
CREATE TABLE IF NOT EXISTS public.brief_understanding_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  video_brief_id  uuid NOT NULL REFERENCES public.video_briefs(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  watched_at      timestamptz NOT NULL DEFAULT now(),
  timestamp_seconds int,
  is_understood   boolean NOT NULL DEFAULT false,
  UNIQUE (video_brief_id, user_id)
);
ALTER TABLE public.brief_understanding_records ENABLE ROW LEVEL SECURITY;
```

### 7.2 Perubahan Tabel yang Sudah Ada

#### 7.2.1 Status 'cancelled' di 7 tabel card
Migration 0014 harus menambahkan nilai 'cancelled' ke CHECK constraint status pada semua tabel card yang sudah ada. Cara: DROP constraint lama + ADD constraint baru (atau gunakan `ALTER TABLE ... ADD CONSTRAINT ... CHECK` jika nama constraint berbeda):

```sql
-- Contoh untuk goals (lakukan hal sama untuk kpi_areas, strategies, initiatives,
-- action_plans, development_areas, problem_statements)
ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_status_check,
  ADD CONSTRAINT goals_status_check
    CHECK (status IN ('draft','active','done','archived','cancelled'));
```

Catatan: `action_plans` memiliki status set yang berbeda: `('draft','assigned','in_progress','submitted','done','revision','archived')` — tambahkan 'cancelled' ke set ini juga.

#### 7.2.2 Trigger guard deadline langsung pada action_plans
```sql
CREATE OR REPLACE FUNCTION public.tg_guard_ap_deadline_direct_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Blokir UPDATE langsung ke kolom deadline jika AP masih active.
  -- RPC review_deadline_change (SECURITY DEFINER) bypass via current_setting check.
  IF OLD.status = 'active'
     AND NEW.deadline IS DISTINCT FROM OLD.deadline
     AND current_setting('app.allow_deadline_update', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'Perubahan deadline Action Plan aktif harus melalui proses Deadline Change Request.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER action_plans_guard_deadline_update
  BEFORE UPDATE ON public.action_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_ap_deadline_direct_update();
```

RPC `review_deadline_change` harus SET `app.allow_deadline_update = 'true'` (session variable) sebelum UPDATE, lalu RESET sesudahnya.

#### 7.2.3 `can_access_initiative` — tambah confidential check
```sql
CREATE OR REPLACE FUNCTION public.can_access_initiative(p_initiative uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.initiatives i
    WHERE i.id = p_initiative
      AND i.organization_id = public.current_user_org()
      -- Jika ada confidential rule untuk initiative ini, user harus ada di whitelist
      -- (kecuali dia adalah PIC initiative atau CEO)
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.confidential_access_rules cr
          WHERE cr.entity_type = 'initiative' AND cr.entity_id = p_initiative
        )
        OR public.user_role_level() = 'ceo'
        OR i.pic_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.confidential_access_rules cr
          WHERE cr.entity_type = 'initiative' AND cr.entity_id = p_initiative
            AND cr.user_id = auth.uid()
        )
      )
      -- Access check biasa
      AND (
        public.can_view_workspace()
        OR i.pic_id = auth.uid()
        OR i.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.action_plans a
          WHERE a.initiative_id = i.id
            AND (a.pic_id = auth.uid() OR a.reviewer_id = auth.uid())
        )
      )
  );
$$;
```

Lakukan hal serupa untuk `can_access_action_plan`.

#### 7.2.4 `permissions` seed (per-row guard — 6 keys baru)
Lihat section 4.2 di atas untuk SQL lengkap.

### 7.3 RPC Baru

Semua RPC: `SECURITY DEFINER`, `SET search_path = ''`. Revoke dari `public, anon` (user-callable via authenticated token). RPC yang bersifat sistem-only juga revoke dari `authenticated`.

#### 7.3.1 `create_department(p_name text, p_description text) → uuid`
Validasi: has_permission('create_department'); trim(p_name) non-kosong; unique per org. Insert + write_activity_system(org, auth.uid(), 'department', id, 'create', {name}).

#### 7.3.2 `create_team(p_name text, p_department_id uuid, p_description text, p_lead_id uuid) → uuid`
Permission: has_permission('manage_teams').

#### 7.3.3 `assign_team_member(p_team_id uuid, p_profile_id uuid, p_role_in_team text) → uuid`
Permission: has_permission('manage_teams'). Validasi: team dan profile di org yang sama; profile is_active=true. Exception jika sudah ada (unique conflict).

#### 7.3.4 `create_deadline_change_request(p_entity_id uuid, p_old_deadline date, p_new_deadline date, p_reason text, p_impact text, p_evidence_note text) → uuid`
entity_type dikunci ke 'action_plan'. Validasi: PIC AP = auth.uid() atau manage_others_cards; new_deadline > old_deadline; new_deadline >= org_today(); cek batas dari settings key 'deadline_change_max_per_card'. Insert DCR + deadline_change_logs (action='submitted') + write_activity + emit_notification ke reviewer_id.

#### 7.3.5 `review_deadline_change(p_request_id uuid, p_decision text, p_reason text) → void`
Validasi: has_permission('review_deadline_changes'); requestor_id <> auth.uid() (anti-self; Governance Violation critical best-effort jika melanggar); status='pending'; rejected perlu reason non-kosong. Jika approved: SET LOCAL app.allow_deadline_update = 'true'; UPDATE action_plans.deadline; RESET app.allow_deadline_update. Insert deadline_change_logs + write_activity.

#### 7.3.6 `cancel_card(p_entity_type text, p_entity_id uuid, p_reason text) → uuid`
Validasi: PIC atau manage_others_cards; trim(reason) non-kosong; cek child aktif (raise exception dengan count). CEO: approval_status='auto_approved', langsung UPDATE entity status='cancelled'. Non-CEO: approval_status='pending', tidak ubah status entity, emit_notification ke reviewer/CEO.

#### 7.3.7 `approve_cancellation(p_cancellation_id uuid) → void`
Validasi: user_role_level()='ceo' atau has_permission('manage_others_cards'). UPDATE cancellations.approval_status='approved', approved_by, approved_at. UPDATE entity status='cancelled'. write_activity 'card_cancelled'.

#### 7.3.8 `record_evaluation(p_initiative_id uuid, p_target_achieved text, p_results text, p_success_factors text[], p_failure_factors text[], p_lessons_learned text, p_should_become_sop boolean, p_rollout_needed boolean, p_rollout_notes text) → uuid`
Validasi: can_access_initiative(p_initiative_id); load initiatives.pic_id; pic_id <> auth.uid() (anti-self; exception + Governance Violation high best-effort); initiative.status IN ('done','active'). RPC mengisi evaluations.pic_id dari initiatives.pic_id secara otomatis. UPSERT (INSERT ... ON CONFLICT(initiative_id) DO UPDATE). write_activity 'evaluation_recorded'.

#### 7.3.9 `archive_card(p_entity_type text, p_entity_id uuid) → void`
Validasi: PIC atau manage_others_cards; entity.status IN ('done','cancelled'); cek child aktif. UPDATE entity: status='archived', archived_at=now(). write_activity 'card_archived'.

#### 7.3.10 `grant_confidential_access(p_entity_type text, p_entity_id uuid, p_user_id uuid, p_access_level text, p_reason text) → uuid`
Permission: manage_confidential_access. UPSERT confidential_access_rules. write_activity 'confidential_access_granted'.

#### 7.3.11 `upsert_settings(p_key text, p_value jsonb) → void`
Permission: manage_settings atau manage_card_completion_rule (untuk key card_completion_rule_*). Whitelist key hardcoded (lihat FR-8.9.6). Key di luar whitelist: INSERT governance_violations (best-effort) + raise exception.

#### 7.3.12 `search_cards(p_query text, p_entity_types text[], p_include_archived boolean) → SETOF jsonb`
UNION SELECT dari 8 entity tables. Setiap branch menggunakan `can_access_*()` helper + org scoping. `p_include_archived=false` default. Revoke dari public, anon.

### 7.4 Trigger Baru

| Trigger | Tabel | Fungsi | Event |
|---|---|---|---|
| `departments_log_create` | departments | `log_card_creation('department')` | AFTER INSERT |
| `teams_log_create` | teams | `log_card_creation('team')` | AFTER INSERT |
| `action_plans_guard_deadline_update` | action_plans | `tg_guard_ap_deadline_direct_update` | BEFORE UPDATE |
| `dcr_no_delete` | deadline_change_requests | `tg_block_delete_append_only` | BEFORE DELETE |
| `dcl_no_delete` | deadline_change_logs | `tg_block_delete_append_only` | BEFORE DELETE |
| `cancellations_no_delete` | cancellations | `tg_block_delete_append_only` | BEFORE DELETE |
| `evaluations_no_delete` | evaluations | `tg_block_delete_append_only` | BEFORE DELETE |

### 7.5 TypeScript Data Layer (mobile)

File baru yang harus dibuat:

| File | Export utama |
|---|---|
| `mobile/src/lib/org-structure.ts` | `Department`, `Position`, `Team`, `TeamMember` + CRUD RPCs |
| `mobile/src/lib/governance-admin.ts` | `DeadlineChangeRequest`, `DeadlineChangeLog`, `Cancellation`, `Evaluation` + RPCs |
| `mobile/src/lib/confidential-access.ts` | `ConfidentialAccessRule` + grant/list RPCs |
| `mobile/src/lib/activity-governance.ts` | `ActivityLog`, `GovernanceViolation` + list/filter RPCs |
| `mobile/src/lib/video-briefs.ts` | `VideoBrief`, `BriefUnderstandingRecord` (opsional UI) |

Pattern: gunakan tipe manual inline sampai `database.types.ts` di-regenerate setelah migration 0014 diterapkan (`supabase gen types typescript --local`).

### 7.6 Ringkasan RLS Per Tabel Baru

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| departments | org-scoped semua anggota | create_department | creator atau manage_settings | tidak ada |
| positions | org-scoped | manage_positions | creator atau manage_settings | tidak ada |
| teams | org-scoped | manage_teams | creator atau manage_teams | tidak ada |
| team_members | org-scoped | manage_teams | tidak ada (delete+insert) | manage_teams |
| deadline_change_requests | requestor/approver/review_deadline_changes/view_activity_log | via RPC | via RPC | tidak ada |
| deadline_change_logs | via FK ke request (requestor/approver) | via RPC/trigger | tidak ada | tidak ada (append-only) |
| cancellations | cancelled_by/approved_by/view_activity_log | via RPC | via RPC | tidak ada (append-only) |
| evaluations | can_access_initiative() | via RPC | via RPC | tidak ada (append-only) |
| confidential_access_rules | user_id diri/granted_by/manage_confidential_access | via RPC | via RPC | via RPC |
| video_briefs | can_access_initiative() | manage_video_briefs | manage_video_briefs | tidak ada |
| brief_understanding_records | diri sendiri / manage_video_briefs | user_id = auth.uid() | user_id = auth.uid() | tidak ada |

---

## 8. Acceptance Criteria

(Lihat bagian acceptance_criteria di output terstruktur untuk daftar lengkap 39 AC.)

Catatan penting:
- Governance Violation logging pada operasi yang **ditolak** (self-approval attempt, unauthorized access) bersifat **best-effort** di V1 karena PG rollback semantics. Semua AC yang menyebut "(best-effort)" tidak boleh dijadikan hard-blocking test pada Fase 8; ditandai sebagai known V1 limitation.
- AC yang mengandung query DB (exit gate) menggunakan kolom `action` (bukan `action_type`) pada `activity_logs`.
- Exit gate table count menggunakan `table_schema IN ('public','auth')` untuk mencakup `auth.users`.

---

## 9. Edge Cases & Error States

### 9.1 Governance Errors
| Kondisi | Pesan UI | DB Effect |
|---|---|---|
| Self-approval DCR | "Anda tidak dapat menyetujui permintaan yang Anda ajukan sendiri." | RPC exception; status tidak berubah; Governance Violation critical (best-effort) |
| DCR: new_deadline < today | "Tanggal baru tidak boleh di masa lalu." | RPC exception |
| DCR: new_deadline < old_deadline | "Tanggal baru tidak boleh lebih awal dari deadline saat ini." | RPC exception |
| Cancel dengan child aktif | "Terdapat X card turunan yang masih aktif." | RPC exception |
| Self-evaluate | "PIC tidak dapat mengevaluasi initiativenya sendiri." | CHECK constraint + RPC exception; Governance Violation high (best-effort) |
| Settings key tidak valid | "Kunci pengaturan tidak valid." | RPC exception; Governance Violation critical (best-effort) |
| Akses card confidential | (tidak ada error; konten tersembunyi) | RLS 0 rows; Governance Violation high (best-effort) |
| Direct deadline update pada active AP | "Perubahan deadline Action Plan aktif harus melalui proses Deadline Change Request." | Trigger exception |

### 9.2 Empty & Loading States
Semua halaman baru menggunakan komponen `SkeletonList` (loading), `EmptyState` (data kosong), dan `ErrorState` (network/permission error) yang sudah ada dari Fase 1–7.

### 9.3 Race Condition (DCR Double-Approval)
Partial UNIQUE INDEX `WHERE status='pending'` pada `deadline_change_requests` mencegah race condition INSERT. Untuk double-approval (dua approver bersamaan): RPC menggunakan `SELECT ... FOR UPDATE` pada request row sebelum UPDATE untuk advisory locking.

---

## 10. Inv Governance yang Mengikat

| # | Invariant | Implementasi Fase 8 |
|---|---|---|
| GOV-1 | RLS org-scoped | Semua tabel baru: organization_id = current_user_org() |
| GOV-2 | Anti-self-approval | DCR: requestor_id <> approver_id (CHECK + RPC); Evaluation: pic_id <> evaluated_by (CHECK + RPC) |
| GOV-3 | Evidence locking | Tabel audit (deadline_change_logs, cancellations, evaluations): DELETE diblokir trigger |
| GOV-4 | Activity Log append-only | write_activity dipanggil di semua RPC lifecycle baru |
| GOV-7 | Permission guard | Semua Settings subsection baru punya permission key; RPC check sebelum aksi |
| GOV-8 | Search ikut permission | search_cards RPC menggunakan can_access_*() helpers, bukan client-side filter |
| GOV-9 | No hard delete | Cancelled/archived card: status change. Audit rows: immutable. |
| GOV-10 | Confidential Access | can_access_initiative/can_access_action_plan diperbarui dengan confidential_access_rules subquery |
| GOV-11 | Tidak ada bobot/weight di planning card | Tidak ada kolom bobot di 7 tabel card |

---

## 11. Open Questions

Lihat bagian `open_questions` di output terstruktur untuk daftar 9 pertanyaan yang memerlukan keputusan product owner.

OQ yang paling kritis untuk diselesaikan sebelum sprint Fase 8 dimulai:
1. **OQ-1**: Scope DCR — hanya action_plan atau semua card type?
2. **OQ-3**: Autonomous transaction gap — defer ke pasca-V1 atau implementasi Edge Function?
3. **OQ-6**: Video Brief — DDL saja atau DDL + UI minimal?

---

## 12. Handoff ke TDD

**Feature summary untuk tdd-plan:**
Fase 8 Governance & Admin Lengkap. 11 tabel baru (departments, positions, teams, team_members, deadline_change_requests, deadline_change_logs, cancellations, evaluations, confidential_access_rules, video_briefs, brief_understanding_records). ALTER TABLE 7 tabel card untuk status='cancelled'. Trigger guard deadline langsung di action_plans. 12 RPC baru (SECURITY DEFINER). 6 permission keys baru (per-row seed). can_access_initiative diperluas dengan confidential check. Settings screen diperluas. 24 layar baru di mobile/. Exit criteria: 53 tabel (public+auth), ≥6 action types di activity_logs, tidak ada bobot field di planning cards.

**Files yang akan tersentuh:** lihat tdd_handoff.paths di output terstruktur.
