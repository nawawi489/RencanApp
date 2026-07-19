---
type: concept
tags: [spec, sdd, settings, card-completion-rule, card-guidance, activation, governance]
updated: 2026-07-19
sources: 5
---

# Settings-consumers — Bundled spec §34.5 + §34.6 (v2 post-grill)

Menutup dua config black-hole di V1.83: UI admin untuk **Card Completion Rule (§34.5)** dan **Keterangan Card (§34.6)** menulis ke storage yang salah tabel + salah schema, dan **tidak ada consumer runtime** yang membacanya. Fix mengangkat storage layer yang sudah dirancang sejak Fase 1 (`card_completion_rules`, `card_guidance_contents` — [supabase/migrations/0005_fase1_card_engine.sql:145,154](supabase/migrations/0005_fase1_card_engine.sql)) menjadi hidup end-to-end.

Owner decisions D-1..D-7 di [[settings-consumers-owner-decisions]] adalah eksekusi authority.

Draft ini sudah lewat 3 kritik adversarial (produk, engineering, governance) — 19 temuan diadjudikasi dan diintegrasikan; catatan adjudikasi di §13.

---

## 1. Konteks & bukti black-hole

Verifikasi 2026-07-19 di branch `fix/permission-key-href-sweep`:

### §34.5 Card Completion Rule
- **PRD §34.5** (PRD.md:1386–1390): "Mengatur field wajib per jenis Card. Tidak perlu tampil sebagai panel utama user. Dipakai saat Aktifkan Card."
- **PRD §7.4** (1387-line-block): popup Aktifkan Card **umum** — copy: "Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan." **Tanpa** auto-scroll, **tanpa** nama field spesifik.
- **UI writer** [mobile/src/app/(app)/settings-card-completion-rule.tsx:28]: `upsertSettings(\`card_completion_rule_${cardType}\`, { min_comments, require_evidence })` — nembak `public.settings` key store + schema `{min_comments, require_evidence}` yang tidak relevan dengan §34.5.
- **Storage kanonik**: `public.card_completion_rules` (0005:145–152) dengan `required_fields jsonb DEFAULT '[]'`, unique `(organization_id, card_type)`. Zero writer, zero reader.
- **Consumer semestinya**: [mobile/src/lib/activation-check.ts] — grep `card_completion_rule|settings\.|from\('card_completion` → NOL MATCH. Hardcoded switch case per cardType (line 58–79).
- **6 RPC** `activate_goal/strategy/initiative/action_plan/development_area/problem_statement` (origin/staging `0067_cross_org_isolation_security_definer.sql`) hardcode required-field RAISE.

### §34.6 Keterangan Card
- **PRD §34.6** (PRD.md:1392–1400): "Mengatur isi bantuan pada icon `?`. Isi harus: Pendek. Praktis. Tidak seperti tutorial panjang. Membantu user memahami makna Card."
- **UI writer** [mobile/src/app/(app)/settings-card-guidance.tsx:27]: `upsertSettings(\`card_guidance_${cardType}\`, { body })` — nembak `public.settings`, hanya field `body`.
- **Storage kanonik**: `public.card_guidance_contents` (0005:154–161) dengan kolom `organization_id (nullable=system default), card_type, title, body`. Seeded 8 baris default V1.83 di [0047_reseed_card_guidance_v183.sql](supabase/migrations/0047_reseed_card_guidance_v183.sql) — org-NULL rows.
- **Consumer semestinya**: [mobile/src/components/card-help-trigger.tsx:7,21] — import `glossaryFor` dari [mobile/src/lib/glossary.ts] hardcoded, tidak pernah query `card_guidance_contents`.

### Trigger 0077 (origin/staging, belum sampai di worktree lokal)
- [supabase/migrations/0077_activation_bypass_and_confidential_holes.sql](supabase/migrations/0077_activation_bypass_and_confidential_holes.sql) pasang BEFORE UPDATE trigger `tg_guard_activation_direct_update` di 5 tabel (goals/strategies/initiatives/action_plans/tasks) yang menolak transisi `draft → non-archived` oleh role `authenticated`/`anon` (42501).

### `upsert_settings` legacy whitelist ([0014:835-865](supabase/migrations/0014_fase8_governance_admin.sql))
Whitelist prefix saat ini (7 total):
1. `card_completion_rule_%` ← **hapus** (target migrasi 0078)
2. `card_guidance_%` ← **hapus**
3. `status_%` ← **retain**
4. `priority_%` ← **retain**
5. `notification_rule_%` ← **retain**
6. `confidential_access_mode` (exact) ← **retain**
7. `deadline_change_max_per_card` (exact) ← **retain**

Sudah punya pola `governance_violations` INSERT untuk key invalid, dan `write_activity(...)` untuk audit log. Migrasi 0078 reuse pola ini.

---

## 2. Goals & non-goals

### Goals
1. Setting §34.5 yang di-input admin di UI **berlaku runtime**: activation-check.ts + 6 RPC activate_* konsultasi `card_completion_rules` per (org, cardType).
2. Setting §34.6 yang di-input admin di UI **tampil di user**: card-help-trigger.tsx menampilkan `title` + `body` dari `card_guidance_contents` (org-specific > org-NULL default > glossary.ts fallback).
3. **Governance emit**: pelanggaran client-bypass required-field ter-emit ke `governance_violations` (PRD §36 #3) via helper server-side (bukan hanya raise 42501).
4. **Audit trail**: perubahan setting `card_completion_rule` / `card_guidance` tercatat di `activity_logs` dengan diff `{before, after, reason?}` (PRD §35 #12/#13, mengikuti disiplin §34.1).
5. Zero regresi terhadap trigger 0077, RLS 6 RPC activate_*, dan RLS 2 tabel dedicated.

### Non-goals
- **Tidak** mengubah trigger 0077 (defense-in-depth utuh).
- **Tidak** memperbaiki gap trigger 0077 vs `activate_task` (pre-existing bug — task punya status='draft' tapi tak ada `activate_task` RPC; trigger 0077 blok draft→assigned dari role authenticated. Consumer mobile untuk aktivasi task belum di-audit; kalau ternyata broken pasca 0077, itu ticket terpisah).
- **Tidak** menambah `min_comments` / `require_evidence` ke `card_completion_rules` (drop dari UI).
- **Tidak** menambah realtime subscription untuk perubahan setting (invalidate via React Query manual on write).
- **Tidak** menambah realtime versioning schema untuk 2 tabel dedicated (`activity_logs` entry cukup).
- **Tidak** memindahkan/menghapus tabel `public.settings` (masih dipakai key store lain).

---

## 3. Data model

### 3.1 `public.card_completion_rules` (0005 — dipakai apa adanya + seed baru)
```
id uuid pk, organization_id uuid fk NOT NULL,
card_type text NOT NULL,
required_fields jsonb NOT NULL DEFAULT '[]',
updated_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(organization_id, card_type)
```

**Two layers of required fields:**
- **Locked base (hardcoded core)** — tidak configurable admin. Wajib selalu enforced di 6 RPC activate_*:
  - Universal: `name`, `pic_id`, `period_start`, `period_end`
  - `goal`: + `target_value`, + ≥1 KPI Area (relational, tetap hardcoded)
  - `strategy`: + `target`, `expected_outcome`, + MBR gate
  - `initiative`: + `reason`, `main_risk`, `alternative`, + contribution_pct=100%
  - `action_plan`: + `target_result`, `team_id`
  - `development_area`: + MBR gate
  - `problem_statement`: + `impact`
- **Admin-configurable layer (`required_fields` di tabel)** — subset dari whitelist field-name yang admin bisa aktifkan/nonaktifkan:
  - Whitelist configurable per cardType (superset kandidat, admin bebas pilih):
    - `goal`: `target_value` (opsional untuk goal kualitatif, kalau org mau enforce untuk semua goal).
    - `strategy`: `target`, `expected_outcome`.
    - `initiative`: `reason`, `main_risk`, `alternative`.
    - `action_plan`: `target_result`, `team_id`.
    - `problem_statement`: `impact`.
    - `development_area`: — (locked-only untuk sekarang).
  - **CATATAN:** Overlap dengan locked base — kalau admin uncheck `target_value` untuk goal, locked base tetap enforced karena PRD-wired. Ini disurface di UI writer sebagai section terpisah "Wajib bawaan sistem — tak bisa dinonaktifkan" (§5.4).

**Card type whitelist §34.5 (activate-gated)**: `goal | strategy | initiative | action_plan | development_area | problem_statement`. **Bukan** task/subtask.

**Seed default (org-NULL row)** di migration 0078: 6 baris `(NULL, cardType, required_fields=[...])` yang berisi field-name kanonik untuk masing-masing tipe (yang admin-configurable). Fallback saat org tidak override.

### 3.2 `public.card_guidance_contents` (0005, seed 0047 — dipakai apa adanya)
```
id uuid pk, organization_id uuid NULL, card_type text NOT NULL,
title text NOT NULL, body text NOT NULL,
updated_at timestamptz NOT NULL DEFAULT now()
```

**UNIQUE constraint belum ada** — migrasi 0078 tambah **dua partial unique index** (bebas versi Postgres, lebih portabel dari `NULLS NOT DISTINCT`):
```sql
create unique index if not exists card_guidance_org_ct_uq
  on public.card_guidance_contents (organization_id, card_type)
  where organization_id is not null;
create unique index if not exists card_guidance_null_ct_uq
  on public.card_guidance_contents (card_type)
  where organization_id is null;
```
Idempoten (IF NOT EXISTS). Pastikan seed 0047 tak duplikat — verifikasi via `SELECT (org, ct), count(*) HAVING count > 1` sebagai preflight guard di migrasi.

**Card type whitelist §34.6**: 7 tipe (termasuk `task`) — sesuai seed 0047. Guidance universal, tak terikat activate flow.

**Fallback tier** (dari runtime consumer perspective):
1. Row `(organization_id = current_user_org, card_type = X)` → menang.
2. Row `(organization_id IS NULL, card_type = X)` → default sistem (0047).
3. Konstanta client [glossary.ts](mobile/src/lib/glossary.ts) → last-line safety net (query error atau tabel kosong).

### 3.3 Legacy path `public.settings` key `card_completion_rule_*` + `card_guidance_*` — DEPRECATE
- Data lama = noise, tidak pernah dikonsumsi.
- Migrasi 0078:
  - **Sebelum DELETE**: `INSERT INTO public.activity_logs` per org yang terkena, `action='settings_legacy_purged'`, `detail={keys_purged_count, keys_sample, migration='0078'}`. Menjaga retention PRD §35.
  - **DELETE**: `DELETE FROM public.settings WHERE key LIKE 'card_completion_rule_%' OR key LIKE 'card_guidance_%';`.
  - **Rewrite `upsert_settings`**: whitelist final = 5 prefix yang RETAIN (§1). Kalau caller lempar `card_completion_rule_*` atau `card_guidance_*`, RPC RAISE + insert `governance_violations` (mengikuti pola existing).

---

## 4. Server-side design

### 4.1 Migration slot & prasyarat
- **Slot: `0078_settings_consumers_activation_rules.sql`** (setelah rebase worktree ke origin/staging tip = 0077).
- **Prasyarat sebelum apply**: 0005 (schema), 0014 (`upsert_settings` + `write_activity` + `governance_violations`), 0047 (guidance seed), 0067 (`activate_*` SECURITY DEFINER), 0077 (trigger anti-bypass).
- **Preflight developer** (memori [[migration-preflight-checks]]):
  - Rebase ke origin/staging tip.
  - `git ls-tree origin/staging supabase/migrations/` → confirm slot 0078 tersedia.
  - Grep 0014 untuk `upsert_settings` prefix final (harus 5 retain).
  - Verify seed 0047 tak duplikat.

### 4.2 Helper `enforce_card_completion_rule` (SECURITY DEFINER)
```sql
create or replace function public.enforce_card_completion_rule(
  p_card_type text,
  p_required text[],
  p_row jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_missing text[] := array[]::text[]; v_field text; v_org uuid;
begin
  -- Iterasi tiap field-name di `p_required`. Kalau `p_row->>field` NULL/'' → tambah ke missing.
  foreach v_field in array coalesce(p_required, array[]::text[]) loop
    -- Whitelist field-name (tolak arbitrary/typo).
    if v_field not in (
      'target_value','target','target_result','expected_outcome',
      'reason','main_risk','alternative','impact','team_id'
    ) then
      raise exception 'Field %s tidak dikenal untuk Card Completion Rule.', v_field
        using errcode = '22023';
    end if;
    if (p_row ->> v_field) is null or (p_row ->> v_field) = '' then
      v_missing := array_append(v_missing, v_field);
    end if;
  end loop;

  if array_length(v_missing, 1) is null then return; end if;

  -- CATATAN AMANDEMEN 2026-07-19 (post-map TDD): INSERT ke governance_violations
  -- di path RAISE **tidak persist** karena PG single-transaction — exception di helper
  -- SECURITY DEFINER bubble up ke activate_*, rollback outer transaction, kehilangan
  -- semua INSERT. Fase 7 sudah dokumentasikan pola sama (fase7_..._contract.sql:186)
  -- dan defer ke "Fase 8 dblink/pg_background". Sampai autonomous-tx infra hadir,
  -- emit di sini adalah dead-code. Deferred to V2 (follow-up spec bersamaan Fase 7
  -- backlog). Amendment memo: settings-consumers-owner-decisions.md D-8.

  -- Copy generic — sesuai PRD §7.4 popup umum (tanpa nama field di user-facing).
  -- detail.missing hanya untuk telemetry/log; client TIDAK menampilkan label spesifik.
  raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.'
    using errcode = 'P0001',
          detail  = jsonb_build_object('missing', v_missing)::text;
end;
$$;

revoke execute on function public.enforce_card_completion_rule(text, text[], jsonb) from public, anon;
-- Tidak grant ke authenticated — hanya dipanggil oleh 6 RPC (SECURITY DEFINER caller lolos).
```

### 4.3 Rewrite 6 RPC `activate_*`
Pola tiap RPC (contoh `activate_goal`; 5 lainnya analog):

```sql
create or replace function public.activate_goal(p_goal_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_row public.goals; v_required text[];
begin
  select * into v_row from public.goals where id = p_goal_id;
  if v_row is null then raise exception 'Goal tidak ditemukan.' using errcode='P0002'; end if;
  v_org := v_row.organization_id;
  if v_org <> public.current_user_org() then
    raise exception 'Lintas organisasi tidak diizinkan.' using errcode='42501';
  end if;

  -- Existing hardcoded core wajib (tetap; DIPRESERVE dari 0067):
  --   name, pic_id, period_start, period_end, target_value, ≥1 KPI area.
  -- (blok RAISE per field tak berubah dari 0067 — copy-paste; helper baru hanya menambah layer.)
  if v_row.name is null or v_row.name = '' then raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001'; end if;
  if v_row.pic_id is null then raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001'; end if;
  -- ... (period_start, period_end, target_value, KPI area — verbatim 0067)

  -- BARU: baca admin-configurable layer + fallback org-NULL default.
  select coalesce(
    (select required_fields from public.card_completion_rules
      where organization_id = v_org and card_type = 'goal'),
    (select required_fields from public.card_completion_rules
      where organization_id is null and card_type = 'goal'),
    '[]'::jsonb
  )
  into strict v_required::jsonb;
  perform public.enforce_card_completion_rule('goal',
    (select array(select jsonb_array_elements_text(v_required::jsonb))),
    to_jsonb(v_row) || jsonb_build_object('organization_id', v_org::text)
  );

  update public.goals set status = 'active', updated_at = now() where id = p_goal_id;
  perform public.write_activity('goal', p_goal_id, 'card_activated', '{}'::jsonb);
end;
$$;
```
- **Kritis untuk 6 RPC**: hardcoded core RAISE **preserved verbatim** dari 0067 → helper hanya menambah lapisan. Zero regresi.
- **`to_jsonb(v_row) || jsonb_build_object('organization_id', v_org)`** ensures helper punya org untuk `governance_violations`.

### 4.4 Writer RPC baru
```sql
create or replace function public.upsert_card_completion_rule(
  p_card_type text,
  p_required_fields text[],
  p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_before text[]; v_field text;
begin
  if not (public.has_permission('manage_card_completion_rule')
       or public.has_permission('manage_settings')) then
    raise exception 'Anda tidak berwenang mengubah Card Completion Rule.' using errcode='42501';
  end if;
  if p_card_type not in ('goal','strategy','initiative','action_plan','development_area','problem_statement') then
    raise exception 'Card type % tidak valid.', p_card_type using errcode='22023';
  end if;
  foreach v_field in array coalesce(p_required_fields, array[]::text[]) loop
    if v_field not in (
      'target_value','target','target_result','expected_outcome',
      'reason','main_risk','alternative','impact','team_id'
    ) then
      raise exception 'Field %s tidak dikenal.', v_field using errcode='22023';
    end if;
  end loop;

  v_org := public.current_user_org();

  select coalesce(
    (select array(select jsonb_array_elements_text(required_fields))
       from public.card_completion_rules
      where organization_id = v_org and card_type = p_card_type),
    array[]::text[]
  ) into v_before;

  insert into public.card_completion_rules (organization_id, card_type, required_fields, updated_at)
  values (v_org, p_card_type, to_jsonb(p_required_fields), now())
  on conflict (organization_id, card_type)
    do update set required_fields = excluded.required_fields, updated_at = now();

  perform public.write_activity('card_completion_rule', null, 'card_completion_rule_updated',
    jsonb_build_object(
      'card_type', p_card_type,
      'before', to_jsonb(v_before),
      'after',  to_jsonb(p_required_fields),
      'reason', p_reason
    ));
end;
$$;
revoke execute on function public.upsert_card_completion_rule(text, text[], text) from public, anon;
grant execute on function public.upsert_card_completion_rule(text, text[], text) to authenticated;
```

```sql
create or replace function public.upsert_card_guidance(
  p_card_type text, p_title text, p_body text, p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_before_title text; v_before_body text;
begin
  -- D-7: reuse manage_card_completion_rule (owner decision 2026-07-19).
  if not (public.has_permission('manage_card_completion_rule')
       or public.has_permission('manage_settings')) then
    raise exception 'Anda tidak berwenang mengubah Keterangan Card.' using errcode='42501';
  end if;
  if p_card_type not in ('goal','strategy','initiative','action_plan','task','development_area','problem_statement') then
    raise exception 'Card type % tidak valid.', p_card_type using errcode='22023';
  end if;
  if p_title is null or length(trim(p_title)) = 0 or length(p_title) > 120 then
    raise exception 'Judul wajib dan maksimal 120 karakter.' using errcode='22023';
  end if;
  if p_body is null or length(trim(p_body)) = 0 or length(p_body) > 800 then
    raise exception 'Isi wajib dan maksimal 800 karakter.' using errcode='22023';
  end if;

  v_org := public.current_user_org();

  select title, body into v_before_title, v_before_body
    from public.card_guidance_contents
    where organization_id = v_org and card_type = p_card_type;

  insert into public.card_guidance_contents (organization_id, card_type, title, body, updated_at)
  values (v_org, p_card_type, p_title, p_body, now())
  on conflict (organization_id, card_type)
    where organization_id is not null
    do update set title = excluded.title, body = excluded.body, updated_at = now();

  perform public.write_activity('card_guidance', null, 'card_guidance_updated',
    jsonb_build_object(
      'card_type', p_card_type,
      'before', jsonb_build_object('title', v_before_title, 'body', v_before_body),
      'after',  jsonb_build_object('title', p_title, 'body', p_body),
      'reason', p_reason
    ));
end;
$$;
revoke execute on function public.upsert_card_guidance(text, text, text, text) from public, anon;
grant execute on function public.upsert_card_guidance(text, text, text, text) to authenticated;
```

### 4.5 RLS 2 tabel
- **`card_completion_rules`** — verify apakah 0005 sudah `enable row level security` (grep 0005:495-496 mengonfirmasi RLS enabled). Migrasi 0078 tambah/replace policy:
  - SELECT policy `card_completion_rules_select_own_org`: `USING (organization_id = public.current_user_org() OR organization_id IS NULL)` — biar reader dapat lihat fallback.
  - INSERT/UPDATE/DELETE policy: **NONE** direct (writer wajib lewat RPC).
- **`card_guidance_contents`** — sama pola.
- GRANT SELECT `to authenticated`; REVOKE public/anon.

### 4.6 Cleanup legacy per-org seed di [0005:598]
`0005:598-608` men-seed 2 baris `card_completion_rules` per org pertama (`initiative`, `action_plan`) dengan field-name lawas (`reviewer_id, expected_output, definition_of_done, priority, start_date, deadline`) yang **tidak** di whitelist §5.4. Kalau tak dibersihkan, helper akan RAISE `22023` untuk field tak dikenal → user org founder tidak bisa aktifkan Initiative/Action Plan.

**Fix di migrasi 0078**: `DELETE FROM public.card_completion_rules WHERE ctid IN (baris legacy dgn field-name unknown)`. Alternatif: `UPDATE required_fields = '[]'::jsonb` untuk baris tsb (biarkan admin re-config). Migrasi pilih DELETE — lebih bersih; admin masih dapat fallback org-NULL default.

### 4.7 Legacy `settings` key cleanup + rewrite `upsert_settings`
```sql
-- Audit trail sebelum DELETE.
insert into public.activity_logs (organization_id, actor_id, entity_type, action, detail)
select organization_id, null, 'settings', 'settings_legacy_purged',
       jsonb_build_object(
         'keys_purged_count', count(*),
         'keys_sample', array_agg(key order by key)[1:5],
         'migration', '0078'
       )
  from public.settings
  where key like 'card_completion_rule_%' or key like 'card_guidance_%'
  group by organization_id;

delete from public.settings
  where key like 'card_completion_rule_%' or key like 'card_guidance_%';

-- Rewrite whitelist upsert_settings — HANYA 5 prefix retain.
create or replace function public.upsert_settings(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_allowed boolean;
begin
  v_org := public.current_user_org();
  v_allowed := p_key like 'status_%'
            or p_key like 'priority_%'
            or p_key like 'notification_rule_%'
            or p_key = 'confidential_access_mode'
            or p_key = 'deadline_change_max_per_card';
  if not v_allowed then
    insert into public.governance_violations
      (organization_id, user_id, violation_type, severity, detail)
    values (v_org, auth.uid(), 'settings_invalid_key', 'critical',
            jsonb_build_object('key', p_key));
    raise exception 'Kunci pengaturan tidak valid.';
  end if;
  if not public.has_permission('manage_settings') then
    raise exception 'Anda tidak berwenang mengubah Pengaturan.';
  end if;
  insert into public.settings (organization_id, key, value, updated_at)
  values (v_org, p_key, p_value, now())
  on conflict (organization_id, key)
    do update set value = excluded.value, updated_at = now();
  perform public.write_activity('settings', null, 'setting_updated',
    jsonb_build_object('key', p_key));
end;
$$;
```

### 4.8 ACL sanity fail-fast (RAISE EXCEPTION, bukan NOTICE)
```sql
do $$
declare v_bad text; v_all text[] := array[
  'public.enforce_card_completion_rule(text,text[],jsonb)',
  'public.upsert_card_completion_rule(text,text[],text)',
  'public.upsert_card_guidance(text,text,text,text)',
  'public.activate_goal(uuid)',
  'public.activate_strategy(uuid)',
  'public.activate_initiative(uuid)',
  'public.activate_action_plan(uuid)',
  'public.activate_development_area(uuid)',
  'public.activate_problem_statement(uuid)'
];
begin
  foreach v_bad in array v_all loop
    if has_function_privilege('anon', v_bad, 'EXECUTE') then
      raise exception 'ACL leak: anon has EXECUTE on %', v_bad;
    end if;
    if has_function_privilege('public', v_bad, 'EXECUTE') then
      raise exception 'ACL leak: PUBLIC has EXECUTE on %', v_bad;
    end if;
  end loop;
end $$;
```

---

## 5. Client-side design

### 5.1 Reader helper baru — `mobile/src/lib/card-rules.ts`
```ts
export type CardTypeGated = 'goal'|'strategy'|'initiative'|'action_plan'|'development_area'|'problem_statement';
export type CardTypeGuided = CardTypeGated | 'task';

export async function getCompletionRule(orgId: string, cardType: CardTypeGated): Promise<{ requiredFields: string[] }>;
export async function getGuidance(orgId: string, cardType: CardTypeGuided): Promise<{ title: string; body: string }>;
```
- **React Query key includes orgId** (mencegah cross-org contamination bila user sign-out+sign-in ke org lain):
  - `queryKey: ['card-rules', 'completion', orgId, cardType]`
  - `queryKey: ['card-rules', 'guidance', orgId, cardType]`
- **Cache lifecycle**: `staleTime: 5 min`, `gcTime: 10 min`.
- **On sign-out** (di auth hook): `qc.removeQueries({ queryKey: ['card-rules'] })`.
- **On write (writer screens)**: `qc.invalidateQueries({ queryKey: ['card-rules', ..., orgId] })`.
- **Query implementation**:
  - Completion: `.from('card_completion_rules').select('required_fields, organization_id').eq('card_type', ct).or(\`organization_id.eq.${orgId},organization_id.is.null\`)`. Client-side pick: org row menang, fallback org-NULL, fallback `[]`.
  - Guidance: sama pola; fallback terakhir ke `glossaryFor(cardType)` bila 0 row atau query error.

### 5.2 `activation-check.ts` rewrite (6 call sites)
- **Async signature**: `missingRequiredFor(cardType, card)` menjadi `Promise<string[]>`; `guardActivationFields(cardType, card, alertImpl?)` menjadi `Promise<boolean>`.
- **Implementasi baru**:
  ```ts
  const orgId = getCurrentOrgId(); // dari session context
  let extra: string[] = [];
  try {
    extra = (await getCompletionRule(orgId, cardType)).requiredFields;
  } catch (err) {
    logger.warn({ event: 'card_rule_offline_fallback', cardType, err });
  }
  const requiredKeys = new Set([...HARDCODED_CORE[cardType], ...extra]);
  return [...requiredKeys].filter(k => isEmpty(card[k])).map(labelFor);
  ```
- **HARDCODED_CORE**: `name, pic_id, period_start, period_end` universal — safety net saat tabel kosong atau offline.
- **Popup copy** (`guardActivationFields`): **generic**, satu string persis PRD §7.4: `'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.'`. **Tidak** menyebut nama field. `missingRequiredFor` result hanya untuk telemetry logger, tidak diteruskan ke Alert.
- **6 call sites** yang perlu di-await:
  - [mobile/src/app/(app)/goal/[id].tsx:35]
  - [strategy/[id].tsx:211]
  - [initiative/[id].tsx:55]
  - [action-plan/[id].tsx:234]
  - [development-area/[id].tsx:116]
  - [problem-statement/[id].tsx:70]
  (Bukan 7 — `workspace-screen.tsx:45` hanya panggil `mbrBreakdownGuardMessage`, out of scope.)
- **Test suite migration**: [mobile/src/lib/__tests__/activation-check.test.ts] wajib di-rewrite ke async + mock `getCompletionRule`. Tanpa ini, suite tetap green karena tak eksekusi jalur baru. Dokumentasikan sebagai test wave item eksplisit.

### 5.3 `card-help-trigger.tsx` rewrite
- Props tak berubah: `{ topic: GlossaryTopic; label?: string }`.
- Ganti hardcoded `glossaryFor(topic)` dengan hook `useCardGuidance(topic)`:
  ```ts
  function useCardGuidance(topic: GlossaryTopic) {
    const { orgId } = useSession();
    return useQuery({
      queryKey: ['card-rules', 'guidance', orgId, topic],
      queryFn: () => getGuidance(orgId, topic as CardTypeGuided),
      staleTime: 5 * 60_000,
    });
  }
  ```
- **UX policy loading**: kalau `isLoading` → tampilkan **skeleton pendek 150ms** (bukan glossary fallback), lalu render hasil server. Rasional: mencegah admin-yang-lagi-testing lihat flash old copy → mengira setting-nya rusak.
- **Prefetch (opsional, direkomendasikan)**: di app boot, prefetch 7 cardType guidance sekali per session (cheap, ≤7 KB). Kalau prefetched, no skeleton.
- **onError**: fallback ke `glossaryFor(topic)` (last-line safety).
- **[glossary.ts]** tetap ada sebagai fallback + reference for seed 0047.

### 5.4 Writer UI rewrite — `settings-card-completion-rule.tsx`
- **Form baru** (delete jalur `upsertSettings` lama):
  - `cardType`: segmented pick, 6 opsi (goal/strategy/initiative/action_plan/development_area/problem_statement — **task dihapus**). Helper text: "Task pakai flow selesai berbeda (submit Nilai Hasil), tidak melewati Aktifkan Card."
  - **Section "Wajib bawaan sistem"**: disabled chip list menampilkan `HARDCODED_CORE[cardType]` labels (mis. Nama, PIC, Periode Mulai, Periode Selesai). Tooltip: "Wajib sesuai PRD, tak bisa dinonaktifkan."
  - **Section "Wajib tambahan per organisasi"**: multi-select checklist dari whitelist configurable per cardType (§3.1). Label ID Bahasa Indonesia.
  - **Prefill on cardType change**: `getCompletionRule(orgId, cardType)`, populate checkbox.
  - **Dirty prompt**: kalau checklist dirty (state berbeda dari server), navigasi/tab-change trigger konfirmasi dialog "Simpan perubahan?".
  - `Simpan` → `useMutation(() => rpc('upsert_card_completion_rule', { p_card_type, p_required_fields, p_reason }))` → invalidate query.
- **Permission gate**: `useHasPermission('manage_card_completion_rule')`.

### 5.5 Writer UI rewrite — `settings-card-guidance.tsx`
- **Form baru**:
  - `cardType`: 7 opsi.
  - `title`: `LabeledInput`, max 120 char, counter.
  - `body`: `LabeledInput multiline`, max 800 char, counter.
  - **Prefill on cardType change**: `getGuidance(orgId, cardType)`.
  - **Dirty prompt** sama pola §5.4.
  - `Simpan` → `useMutation(() => rpc('upsert_card_guidance', { p_card_type, p_title, p_body, p_reason }))` → invalidate.
- **Permission gate**: `useHasPermission('manage_card_completion_rule')` (D-7 reuse).

---

## 6. Data contract summary

| Aspek | §34.5 Card Completion Rule | §34.6 Keterangan Card |
|---|---|---|
| Tabel storage | `public.card_completion_rules` | `public.card_guidance_contents` |
| Row shape | `{ organization_id, card_type, required_fields text[]→jsonb }` | `{ organization_id?, card_type, title, body }` |
| Writer RPC | `upsert_card_completion_rule(p_card_type, p_required_fields, p_reason?)` | `upsert_card_guidance(p_card_type, p_title, p_body, p_reason?)` |
| Permission | `manage_card_completion_rule` OR `manage_settings` | `manage_card_completion_rule` OR `manage_settings` (D-7 reuse) |
| Reader client | `getCompletionRule(orgId, cardType)` | `getGuidance(orgId, cardType)` |
| Enforcer server | 6 RPC `activate_*` + helper `enforce_card_completion_rule` + trigger 0077 | N/A (content-only) |
| Enforcer client | `activation-check.ts` async, merge HARDCODED_CORE + fallback | `card-help-trigger.tsx` async, skeleton, fallback glossary |
| Whitelist cardType | goal, strategy, initiative, action_plan, development_area, problem_statement | + task |
| Whitelist field-name configurable | target_value, target, target_result, expected_outcome, reason, main_risk, alternative, impact, team_id | — |
| Locked base | name, pic_id, period_start, period_end + PRD-wired per cardType | — |
| Fallback | Locked base client + org-NULL default server | org-specific → org-NULL → glossary.ts |
| Emit governance_violations | Ya (helper, PRD §36 #3) | — |
| Audit log | `write_activity` dgn `{before, after, reason?}` | Sama |
| Legacy cleanup | `settings` key `card_completion_rule_%` + seed 0005:598 | `settings` key `card_guidance_%` |

---

## 7. Acceptance criteria

### AC-1 §34.5 hard-block server-side, popup umum
Given admin org X set `required_fields = ['reason']` untuk `initiative`,
And user org X create draft initiative dgn `reason = NULL`,
When client memanggil `rpc('activate_initiative', ...)`,
Then RPC RAISE errcode='P0001' dengan message = 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.',
And detail JSON berisi `{ "missing": ["reason"] }` (untuk telemetry saja),
And row `initiatives.status` **tidak** berubah dari 'draft'.

**AMENDMEN D-8 (2026-07-19)**: klausul "satu row governance_violations muncul" **dihapus dari AC-1**. Alasan: single-tx rollback (lihat catatan §4.2). Deferred to V2 sampai autonomous-tx infra hadir bersamaan Fase 7 backlog. Test DB contract di Wave 1 assert `count(governance_violations) = 0` (bukan = 1) untuk mencegah false-positive coverage. Tetap dalam scope non-goal §2.

### AC-2 §34.5 client-side pre-block, popup generic (PRD §7.4 disiplin)
Given admin org X set `required_fields = ['target_value']` untuk `goal`,
And user org X buka detail goal dgn `target_value = NULL`,
When user tap tombol Aktifkan,
Then `Alert.alert` muncul dengan title 'Aktifkan Card' + message **generik** ('Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.'),
And Alert **tidak** menyebut nama field spesifik ('target_value' / 'Target'),
And RPC `activate_goal` **tidak** dipanggil.

### AC-3 §34.5 fallback ke org-NULL default
Given tak ada row `card_completion_rules` untuk (org X, 'strategy'),
And ada row `(NULL, 'strategy', required_fields=['expected_outcome'])`,
When user org X coba activate strategy dgn `expected_outcome = NULL`,
Then RPC RAISE (governance_violations tidak diassert; D-8 defer).

### AC-4 §34.5 locked base tak bisa di-bypass admin
Given admin org X set `required_fields = []` (kosong-kan tabel),
And user coba activate goal dgn `name = NULL`,
When RPC dipanggil,
Then RAISE (hardcoded core `name` tetap enforced, terlepas dari `card_completion_rules`).

### AC-5 §34.6 render org-specific
Given admin org X set guidance `initiative` = `{title:'Inisiatif X', body:'Custom body'}`,
When user org X buka card-help-trigger `topic='initiative'`,
Then Alert menampilkan title='Inisiatif X' + body='Custom body' (bukan dari glossary.ts).

### AC-6 §34.6 fallback tier
Given org X tak override guidance `goal`,
And row `(NULL, 'goal')` ada di 0047 seed,
When user buka trigger,
Then dialog menampilkan title/body dari row org-NULL.

Given tabel guidance kosong total,
Then dialog menampilkan `glossaryFor('goal')`.

### AC-7 §34.6 no glossary flash saat loading
Given cache kosong (first mount),
When user buka trigger `topic='goal'`,
Then TIDAK ada frame yang menampilkan `glossaryFor('goal')` (hardcoded lama) sebelum server response,
And skeleton loader tampil ≤150ms, lalu langsung swap ke server response.

### AC-8 Legacy `settings` cleanup + audit
Given migration 0078 apply,
Then `SELECT count(*) FROM public.settings WHERE key LIKE 'card_completion_rule_%' OR key LIKE 'card_guidance_%'` = 0,
And satu row `activity_logs (action='settings_legacy_purged')` per org yang punya key legacy.

### AC-9 Legacy per-org seed 0005:598 cleaned
Given migration 0078 apply,
Then `SELECT count(*) FROM public.card_completion_rules WHERE required_fields::text ~ 'reviewer_id|expected_output|definition_of_done|priority|start_date|deadline'` = 0.

### AC-10 Trigger 0077 tetap aktif
Given migration 0078 apply,
When user org X coba `.update({status:'active'}).eq('id', <draft goal id>)` langsung via PostgREST,
Then respons 42501.

### AC-11 Cross-org isolation preserved
Given user org X memanggil `activate_goal(<goal id org Y>)`,
Then RPC RAISE 42501.

### AC-12 ACL bersih (sanity fail-fast)
Given migration 0078 apply,
Then untuk 6 RPC `activate_*` + `enforce_card_completion_rule` + `upsert_card_completion_rule` + `upsert_card_guidance`:
- `has_function_privilege('authenticated', ..., 'EXECUTE')` = true (kecuali `enforce_card_completion_rule`, hanya definer-caller)
- `has_function_privilege('anon', ..., 'EXECUTE')` = false
- `has_function_privilege('public', ..., 'EXECUTE')` = false.
- Sanity `DO $$` di migrasi RAISE EXCEPTION bila leak.

### AC-13 Activity log diff `{before, after, reason?}`
Given admin upsert card completion rule dari `['reason']` ke `['reason','main_risk']` dgn reason='Q3 initiative discipline',
Then satu row `activity_logs (action='card_completion_rule_updated')` muncul dgn `detail = { card_type, before: ['reason'], after: ['reason','main_risk'], reason: 'Q3 initiative discipline' }`.

### AC-14 Cache scope per org
Given user sign-out dari org A dan sign-in ke org B,
When mount screen yang panggil `getCompletionRule(orgId=B, ct)`,
Then hasil **tidak** pakai cache org A (queryKey berbeda), dan `removeQueries(['card-rules'])` dipanggil di sign-out hook.

### AC-15 Dirty prompt di writer
Given admin edit checklist required_fields (dirty state),
When admin ganti cardType picker atau navigasi keluar screen,
Then konfirmasi dialog "Simpan perubahan?" muncul; batal navigasi kalau user tap "Batal".

### AC-16 Whitelist reject invalid field-name
Given admin (via UI atau langsung rpc) kirim `p_required_fields=['garbage_field']`,
Then `upsert_card_completion_rule` RAISE errcode='22023' 'Field garbage_field tidak dikenal.'.

---

## 8. Test plan

### 8.1 Unit — client
- `card-rules.test.ts`: `getCompletionRule` fallback chain (org row > NULL row > empty). `getGuidance` fallback chain (org row > NULL row > glossary).
- `activation-check.test.ts` **rewrite ke async** — mock `getCompletionRule`, verify: locked base tetap enforced saat `[]`, merge dgn admin extras, offline fetch failure → HARDCODED_CORE only + warn log, popup copy generic.
- `card-help-trigger.test.tsx`: skeleton saat loading (**no glossary flash**), server override on success, error → glossary fallback.
- `settings-card-completion-rule.test.tsx`: prefill server, dirty prompt on tab change, invalid field-name reject (client-side), submit invalidate.
- `settings-card-guidance.test.tsx`: sama.
- Sign-out hook test: `removeQueries(['card-rules'])` dipanggil.

### 8.2 DB contract (SQL)
- `card_completion_rule_contract.sql`: seed 6 rows (goal/strategy/initiative/action_plan/development_area/problem_statement dgn required overlap + hardcoded core), test AC-1..AC-4 + AC-11 (cross-org) + AC-13 (activity log diff) + AC-16 (invalid field-name).
- `card_completion_rule_governance.sql`: assert governance_violations row per pelanggaran (AC-1).
- `card_guidance_contract.sql`: seed org row + NULL row, test SELECT via RLS as authenticated (AC-5, AC-6), reject via RPC saat title/body kosong atau overlength.
- `settings_legacy_cleanup.sql`: 
  - Assert `SELECT count() WHERE key LIKE ...` = 0 (AC-8).
  - Assert activity_logs row `action='settings_legacy_purged'` ada per org.
  - Assert `upsert_settings('card_completion_rule_x', ...)` post-migration RAISE (whitelist ditolak).
  - Assert `upsert_settings('status_x', ...)` masih diterima (5 retain prefix tak regresi).
- `card_completion_rule_seed_hygiene.sql`: assert 0005:598 legacy rows dgn field-name unknown = 0 (AC-9).
- `activation_bypass_still_blocked.sql`: rerun 0077 sanity — direct UPDATE 'draft'→'active' RAISE 42501 (AC-10).
- `rpc_acl_after_0078.sql`: `has_function_privilege` fail-fast pattern (AC-12), no pgTAP dependency (memori [[p2-db-contract-ci]]).

### 8.3 Integration
- Full flow: admin edit rule → simpan (server-side round-trip) → user (mock second session) tap Aktifkan → popup atau sukses per rule.
- Full flow: admin edit guidance → user buka trigger → server response tampil.
- Full flow: rewrite writer via UI menggantikan `settings` key store — 0 leftover key.

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Regresi 6 RPC activate_* (0067 SECURITY DEFINER + cross-org guard) | Critical | Hardcoded core RAISE **preserved verbatim** dari 0067. Helper hanya menambah lapisan. Contract test per RPC replay cross-org + missing-required. |
| ACL reset karena DROP+CREATE ([[anon-public-rpc-grant-gotcha]]) | Anon exposure | Sanity `DO $$ RAISE EXCEPTION` (bukan NOTICE) di akhir migration check `has_function_privilege` untuk 9 fungsi, fail-fast. |
| `activation-check.ts` async breaking 6 call sites | Compile + test failure | Grep call sites; edit satu-per-satu; **rewrite existing test file** ke async (dokumentasi eksplisit di wave 3). |
| Fetch fail offline → user tak bisa activate | UX regresi | Fallback ke HARDCODED_CORE saat error; logger.warn (non-blocking). Server tetap enforce kalau reachable. |
| React Query cache cross-org contamination | Data leak between orgs | queryKey include `orgId`; sign-out hook `removeQueries(['card-rules'])`. |
| Seed 0005:598 legacy field-name → helper RAISE (org founder lock) | Critical | Migrasi 0078 DELETE 2 baris legacy. Fallback ke seed org-NULL default. |
| Partial unique index conflict dgn seed 0047 duplikat | Migration fail | Preflight guard: `SELECT (org, ct), count(*) FROM card_guidance_contents HAVING count > 1` → RAISE EXCEPTION di migrasi kalau ada. |
| `upsert_settings` whitelist rewrite tak sengaja drop 5 retain prefix | Fitur lain rusak | Enumerate 5 retain eksplisit di §4.7; contract test both directions. |
| Guidance flash glossary → confusing admin | UX confusion | Skeleton 150ms atau prefetch — no fallback saat loading. Fallback glossary hanya on-error. |
| Popup detail spesifik = melanggar PRD §7.4 | Governance drift | Client render string generik saja; `detail.missing` hanya telemetry. AC-2 negatif menguji. |
| Dirty form silent-loss | Admin frustrasi | Dirty prompt on tab/nav change (§5.4 + §5.5). |
| Rollback config-ghost trap | Admin config aktif di UI tapi mati di runtime | Release note eksplisit + banner di kedua screen selama feature flag rollback. Owner harus tahu. |
| Task/trigger 0077 pre-existing issue | Task activation broken | **Non-goal untuk spec ini**. Verifikasi terpisah + ticket kalau ternyata broken pasca 0077. Spec eksplisit menyebut. |
| Worktree lokal tertinggal (duplikat 0058/0059/0061) | Migrasi nomor kacau | PR wajib rebase ke origin/staging tip = 0077 dulu; jangan tulis SQL sampai rebase clean. |

---

## 10. Migration & rollout

### Slot & ordering
```
0078_settings_consumers_activation_rules.sql
  ├── 0005 (schema 2 tabel + RLS enabled + seed org-NULL 0047 karena guidance)
  ├── 0014 (upsert_settings + write_activity + governance_violations)
  ├── 0047 (guidance seed default)
  ├── 0067 (activate_* SECURITY DEFINER 6 RPC)
  └── 0077 (activation-bypass trigger; defense-in-depth utuh)
```

### Migration body outline (0078)
```
begin;
  -- 0. Preflight guard: no duplicate rows di card_guidance_contents.
  do $$ ... $$;

  -- 1. Partial unique index di card_guidance_contents (2 index).
  -- 2. Enable RLS + policies (SELECT own_org OR NULL, no write) — verify + add missing.
  -- 3. Cleanup legacy per-org seed di card_completion_rules (0005:598) — DELETE rows dgn field-name unknown.
  -- 4. Seed default org-NULL row di card_completion_rules (6 baris).
  -- 5. Helper enforce_card_completion_rule(text, text[], jsonb).
  -- 6. Rewrite 6 activate_* RPC — hardcoded core preserved, tambah helper call.
  -- 7. Writer RPC baru: upsert_card_completion_rule + upsert_card_guidance.
  -- 8. GRANT/REVOKE bersih (authenticated only + fail-fast sanity di step 12).
  -- 9. Legacy settings audit + DELETE (activity_logs 'settings_legacy_purged' per org).
  -- 10. Rewrite upsert_settings whitelist (5 retain prefix only).
  -- 11. REVOKE upsert_settings dari public/anon (recheck ACL).
  -- 12. Sanity DO $$ RAISE EXCEPTION check has_function_privilege untuk 9 fungsi.
commit;
```

### Rollback
- **Server-only rollback**: revert 0078 → 6 RPC ke bentuk 0067 hardcoded (helper drop, tabel tetap). Data admin `card_completion_rules` yang sudah di-set akan tetap ada tapi tak dikonsumsi runtime (**config-ghost trap** — release note eksplisit).
- **Client-only rollback**: reader helper tetap hidup dgn enforcer server lama (backward-compatible).
- **Full rollback**: revert 0078 + 2 client PR + banner di 2 writer screen.

### Preflight checklist (developer sebelum PR)
- [ ] Rebase worktree ke origin/staging tip (0077 present).
- [ ] `git ls-tree origin/staging supabase/migrations/` → slot 0078.
- [ ] Grep 0014 `upsert_settings` whitelist prefix (harus 5 retain di final).
- [ ] Verify `card_guidance_contents` seed 0047 tak duplikat.
- [ ] Verify 0077 sanity: 5 trigger `%_guard_activation_bypass` + 3 can_access_* dgn confidential clause.
- [ ] Verify `write_activity(...)` dan `governance_violations` schema (0014).
- [ ] Client sign-out hook path: import `qc` + `removeQueries` (grep app-provider).

---

## 11. Handoff ke /tdd-plan

Test-first waves (siap sambung ke /tdd-plan):

**Wave 1 — DB contract (red-first):**
- `card_completion_rule_contract.sql` (AC-1..AC-4, AC-11, AC-13, AC-16)
- `card_completion_rule_governance.sql` (AC-1 emit)
- `card_guidance_contract.sql` (AC-5, AC-6)
- `settings_legacy_cleanup.sql` (AC-8, whitelist regresi)
- `card_completion_rule_seed_hygiene.sql` (AC-9)
- `activation_bypass_still_blocked.sql` (AC-10)
- `rpc_acl_after_0078.sql` (AC-12)

**Wave 2 — Server (green):**
- Migration `0078_settings_consumers_activation_rules.sql`.

**Wave 3 — Client unit (red):**
- `card-rules.test.ts`.
- `activation-check.test.ts` — **REWRITE existing** ke async + mock `getCompletionRule`.
- `card-help-trigger.test.tsx` — no glossary flash (AC-7).
- 2 writer screen tests.
- Sign-out hook `removeQueries` test.

**Wave 4 — Client implementation + UI writer + integration (green):**
- Reader helper `mobile/src/lib/card-rules.ts`.
- 6 call site update (await + orgId).
- Card-help-trigger rewrite (hook + skeleton).
- 2 writer screen rewrite (form + prefill + dirty prompt + locked base disclosure).
- App-provider sign-out hook wiring.

**Handoff artifact untuk /tdd-plan**: spec ini + memori [[settings-consumers-owner-decisions]] + PRD §7.4, §34.5, §34.6, §35, §36 excerpt (di §1 spec ini) + adjudikasi kritik (di §13).

---

## 12. Related

- PRD.md §7.4 (activation popup UX generic), §34.1 (activity log diff discipline), §34.5, §34.6, §35 #12/#13, §36 #3 (governance violation card_activation_incomplete)
- [[card-model]] — hierarchy authoritative
- [[audit-governance]] — activity log convention
- [[permission-model]] — `manage_card_completion_rule` (reuse D-7 untuk §34.6)
- [[settings-consumers-owner-decisions]] — D-1..D-7 binding
- [[migration-preflight-checks]] — nomor + CI runner
- [[anon-public-rpc-grant-gotcha]] — ACL reset pola + fail-fast sanity
- [[p2-db-contract-ci]] — DB contract test as CI gate (no pgTAP)
- [supabase/migrations/0005_fase1_card_engine.sql:145,154,598](supabase/migrations/0005_fase1_card_engine.sql)
- [supabase/migrations/0014_fase8_governance_admin.sql:835-865](supabase/migrations/0014_fase8_governance_admin.sql)
- [supabase/migrations/0047_reseed_card_guidance_v183.sql](supabase/migrations/0047_reseed_card_guidance_v183.sql)
- [supabase/migrations/0067_cross_org_isolation_security_definer.sql](supabase/migrations/0067_cross_org_isolation_security_definer.sql)
- [supabase/migrations/0077_activation_bypass_and_confidential_holes.sql](supabase/migrations/0077_activation_bypass_and_confidential_holes.sql)

---

## 13. Adjudikasi kritik (post-grill)

19 temuan dari 3 kritik adversarial. Semua sudah diintegrasikan ke spec kecuali yang di-flagged sebagai non-goal.

**Diintegrasikan (17):**

| # | Sudut | Severity | Temuan | Resolusi di spec |
|---|---|---|---|---|
| 1 | Produk | must-fix | Governance §36 #3 tak ter-emit | §2 Goal #3 explicit, §4.2 helper INSERT governance_violations, AC-1 |
| 2 | Produk | must-fix | Checkbox lies (HARDCODED_CORE superset) | §3.1 two-layer, §5.4 disabled chip disclosure, AC-4 |
| 3 | Produk | must-fix | Popup detail contradict §7.4 | §5.2 generic copy, AC-2 explicit no-field-name |
| 4 | Produk | must-fix | Guidance flash old glossary | §5.3 skeleton 150ms, AC-7 |
| 5 | Produk | nice | Task asymmetric reasoning | §5.4 helper text |
| 6 | Produk | nice | Dirty form silent loss | §5.4/§5.5 dirty prompt, AC-15 |
| 7 | Eng | block | Helper RECORD signature won't compile | §4.2 signature `p_row jsonb` + `to_jsonb(v_row)` |
| 8 | Eng | block | UNIQUE NULLS NOT DISTINCT PG version | §3.2 dua partial unique index |
| 9 | Eng | must-fix | Cache cross-org | §5.1 queryKey +orgId, sign-out removeQueries, AC-14 |
| 10 | Eng | must-fix | upsert_settings whitelist retain 5 | §1 enum + §4.7 rewrite eksplisit |
| 11 | Eng | must-fix | 7 vs 6 call sites | §5.2 corrected + wave 3 test rewrite explicit |
| 12 | Eng | must-fix | Seed 0005:598 legacy field-name | §4.6 DELETE, AC-9 |
| 13 | Eng | nice | Sanity RAISE EXCEPTION | §4.8 fail-fast pattern |
| 14 | Eng | nice | Legacy DELETE audit | §4.7 activity_logs pre-DELETE, AC-8 |
| 15 | Gov | must-fix | Activity log diff missing | §4.4 write_activity dgn before/after/reason, AC-13 |
| 16 | Gov | nice | Rollback config-ghost trap | §9 risk + §10 release note explicit |
| 17 | Gov | nice | Fallback semantic transparency | §3.1 + §5.4 disabled chip section |

**Owner decision (2):**
- 18 (Gov, block) Permission key `manage_card_guidance` → **D-7: reuse `manage_card_completion_rule`** (locked 2026-07-19).
- 19 (Eng, must-fix) Task/0077 trigger interaction → **non-goal**: pre-existing bug (task punya `draft` state tapi tak ada `activate_task`), spec eksplisit di §2 non-goals + risk register.

#stub: **False** — spec siap /tdd-plan.
