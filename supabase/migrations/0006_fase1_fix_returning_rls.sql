-- EMS V1.8.1 — Fase 1 fix: INSERT ... RETURNING gagal RLS pada initiatives & action_plans.
--
-- Sebab: policy SELECT memakai can_access_initiative()/can_access_action_plan() yang
-- meng-query ULANG tabel yang sama. Saat INSERT ... RETURNING (dipakai supabase-js .select()),
-- Postgres mengevaluasi policy SELECT atas baris baru, tapi baris itu belum terlihat oleh
-- snapshot fungsi SECURITY DEFINER di tengah statement → fungsi balas false → 42501.
--
-- Solusi: policy SELECT mengevaluasi kolom baris itu sendiri SECARA LANGSUNG (tersedia di NEW
-- tuple saat RETURNING) dan hanya memakai helper SECURITY DEFINER untuk cek LINTAS tabel
-- (yang tidak menyentuh baris yang sedang di-insert, jadi aman & tidak rekursif).

-- Helper lintas-tabel (boolean, SECURITY DEFINER, bebas RLS).
create or replace function public.initiative_has_my_action_plan(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.action_plans a
    where a.initiative_id = p_initiative
      and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())
  );
$$;

create or replace function public.i_am_initiative_pic(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i
    where i.id = p_initiative and i.pic_id = auth.uid()
  );
$$;

revoke execute on function public.initiative_has_my_action_plan(uuid) from public, anon;
revoke execute on function public.i_am_initiative_pic(uuid) from public, anon;

-- Initiatives: kolom sendiri langsung (org, pic, created_by) + helper untuk anak action plan.
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
    )
  );

-- Action Plans: kolom sendiri langsung (org, pic, reviewer, created_by) + helper untuk PIC induk.
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
    )
  );

-- can_access_initiative tidak lagi dipakai policy mana pun → buang.
-- (can_access_action_plan tetap dipakai policy SELECT submissions/evidence/result/reviews,
--  yang membaca baris ber-action_plan committed — tidak kena masalah RETURNING. Biarkan.)
drop function if exists public.can_access_initiative(uuid);
