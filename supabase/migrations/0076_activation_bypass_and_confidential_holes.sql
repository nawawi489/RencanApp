-- 0076_activation_bypass_and_confidential_holes.sql
--
-- Dua P0 keamanan yang terlewat dari P0 handoff sebelumnya. Keduanya
-- silent-exploitable (tidak melempar error, hanya menghilangkan proteksi
-- yang seharusnya berlaku). Bundel satu migrasi karena keduanya cabut
-- proteksi yang sama pola: gate yang seharusnya di RPC bocor lewat
-- jalur alternatif (RLS-langsung / can_access_* yang tak lengkap).
--
-- ==========================================================================
-- BUG 1: Activation-status bypass via direct .update()
-- ==========================================================================
-- Policy UPDATE pada goals/strategies/initiatives/action_plans/tasks
-- hanya validasi organization_id (dan has_permission utk sebagian). Klien
-- bisa panggil PostgREST langsung:
--   supabase.from('goals').update({ status: 'active' }).eq('id', ...)
-- → lolos RLS, lolos activate_goal() gate (nama/PIC/periode/target_value/
--   ≥1 KPI Area wajib), lolos MBR enforcement `blokir_aktivasi`, tanpa
-- ninggalin governance_violations row. False sense of governance.
--
-- Fix: BEFORE UPDATE trigger — tolak transisi draft → non-archived bila
-- current_user adalah role API (authenticated/anon). SECURITY DEFINER RPC
-- (activate_*) berjalan sebagai owner fungsi (postgres) sehingga lolos
-- trigger — tidak perlu ubah satu pun RPC. Pola mirror
-- `tg_guard_ap_deadline_direct_update` (0014:406) tapi role-check bukan
-- session GUC. Archive tetap boleh langsung (essentially delete).
--
-- ==========================================================================
-- BUG 2: Confidential Access enforcement hole
-- ==========================================================================
-- `grant_confidential_access` (0016) menerima entity_type ∈ {goal, strategy,
-- initiative, action_plan, task}. 0014 memasang klausa confidential di
-- can_access_initiative + can_access_action_plan. Rewrite 0046 me-repro
-- fungsi tanpa klausa; 0051 hanya memulihkan can_access_action_plan.
-- Hasil sekarang:
--   can_access_task         : ADA klausa confidential (0046:587)
--   can_access_action_plan  : ADA klausa (0051)
--   can_access_initiative   : HILANG klausa (regresi 0046:632)
--   can_access_strategy     : TAK PERNAH ada (0010→0046)
--   can_access_goal         : TAK PERNAH ada (0010:191)
-- → Grant confidential di goal/strategy/initiative tersimpan tapi tidak
-- menutup akses. Owner mengira rahasia, faktanya bocor.
--
-- Fix: rewrite 3 fungsi yang kurang (goal/strategy/initiative) dengan
-- klausa confidential mirror pola can_access_action_plan (0051): CEO
-- selalu lolos, PIC entity selalu lolos, whitelisted user lolos.
--
-- Body dasar tiap fungsi di-preserve verbatim dari sumber terbarunya
-- (goal=0010:191, strategy=0046:616, initiative=0046:632) — perubahan
-- eksklusif: append AND-clause confidential.

begin;

-- ==========================================================================
-- BUG 1: Activation-status bypass trigger
-- ==========================================================================

-- SECURITY INVOKER (default) — critical: SECURITY DEFINER akan flip
-- current_user ke owner fungsi (postgres) sehingga role-check di bawah
-- selalu false → trigger tak pernah blok apa pun. Invoker preserve
-- caller role, jadi current_user di trigger = role saat UPDATE dijalankan:
--   - PostgREST direct: 'authenticated'/'anon'
--   - Inside SECURITY DEFINER RPC (activate_*): 'postgres' (owner RPC)
create or replace function public.tg_guard_activation_direct_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Blokir transisi draft → status aktif via role API. Draft → archived
  -- tetap boleh (setara delete card yang belum pernah aktif).
  if old.status = 'draft'
     and new.status is distinct from old.status
     and new.status <> 'archived'
     and current_user in ('authenticated', 'anon') then
    raise exception
      'Aktivasi % harus melalui RPC activate_% (Kelengkapan Card + MBR gate). Bypass langsung ditolak.',
      TG_TABLE_NAME, TG_TABLE_NAME
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- Trigger function harus bisa dieksekusi oleh authenticated (via UPDATE)
-- karena SECURITY INVOKER; no revoke.

do $$
declare
  t text;
begin
  foreach t in array array['goals','strategies','initiatives','action_plans','tasks']
  loop
    execute format('drop trigger if exists %I on public.%I',
      t || '_guard_activation_bypass', t);
    execute format(
      'create trigger %I before update on public.%I ' ||
      'for each row execute function public.tg_guard_activation_direct_update()',
      t || '_guard_activation_bypass', t
    );
  end loop;
end $$;

-- ==========================================================================
-- BUG 2: Confidential clause di 3 can_access_* yang kurang
-- ==========================================================================

-- can_access_goal — belum pernah punya klausa confidential (0010:191).
create or replace function public.can_access_goal(p_goal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.goals g
    where g.id = p_goal
      and g.organization_id = public.current_user_org()
      and (public.can_view_workspace() or g.pic_id = auth.uid() or g.created_by = auth.uid()
           or public.goal_has_my_descendant(g.id))
      and (
        not exists (select 1 from public.confidential_access_rules cr
                    where cr.entity_type = 'goal' and cr.entity_id = g.id)
        or public.user_role_level() = 'ceo'
        or g.pic_id = auth.uid()
        or exists (select 1 from public.confidential_access_rules cr
                   where cr.entity_type = 'goal' and cr.entity_id = g.id
                     and cr.user_id = auth.uid())
      )
  );
$$;

-- can_access_strategy — 0046:616 tak pernah append klausa confidential.
create or replace function public.can_access_strategy(p_strategy uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.strategies k
    where k.id = p_strategy
      and k.organization_id = public.current_user_org()
      and (public.can_view_workspace() or k.pic_id = auth.uid() or k.created_by = auth.uid()
           or public.is_goal_pic(k.goal_id) or public.strategy_has_my_descendant(k.id))
      and (
        not exists (select 1 from public.confidential_access_rules cr
                    where cr.entity_type = 'strategy' and cr.entity_id = k.id)
        or public.user_role_level() = 'ceo'
        or k.pic_id = auth.uid()
        or exists (select 1 from public.confidential_access_rules cr
                   where cr.entity_type = 'strategy' and cr.entity_id = k.id
                     and cr.user_id = auth.uid())
      )
  );
$$;

-- can_access_initiative — regresi 0046:632 dropped klausa yang ada di 0014:428.
create or replace function public.can_access_initiative(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives s
    where s.id = p_initiative
      and s.organization_id = public.current_user_org()
      and (public.can_view_workspace() or s.pic_id = auth.uid() or s.created_by = auth.uid()
           or public.is_strategy_pic(s.strategy_id) or public.initiative_has_my_descendant(s.id))
      and (
        not exists (select 1 from public.confidential_access_rules cr
                    where cr.entity_type = 'initiative' and cr.entity_id = s.id)
        or public.user_role_level() = 'ceo'
        or s.pic_id = auth.uid()
        or exists (select 1 from public.confidential_access_rules cr
                   where cr.entity_type = 'initiative' and cr.entity_id = s.id
                     and cr.user_id = auth.uid())
      )
  );
$$;

grant execute on function public.can_access_goal(uuid)       to authenticated;
grant execute on function public.can_access_strategy(uuid)   to authenticated;
grant execute on function public.can_access_initiative(uuid) to authenticated;
revoke execute on function public.can_access_goal(uuid)       from public, anon;
revoke execute on function public.can_access_strategy(uuid)   from public, anon;
revoke execute on function public.can_access_initiative(uuid) from public, anon;

-- ==========================================================================
-- sanity check
-- ==========================================================================

do $$
declare
  n_triggers int;
  n_fns int;
begin
  select count(*) into n_triggers
    from pg_trigger
   where tgname like '%_guard_activation_bypass'
     and not tgisinternal;
  raise notice '0076: activation-bypass triggers = % (expect 5: goals + strategies + initiatives + action_plans + tasks)', n_triggers;

  select count(*) into n_fns
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('can_access_goal','can_access_strategy','can_access_initiative')
     and pg_get_functiondef(p.oid) like '%confidential_access_rules%';
  raise notice '0076: can_access_* dengan klausa confidential = % (expect 3)', n_fns;
end $$;

commit;
