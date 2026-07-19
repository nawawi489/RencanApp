-- ==========================================================================
-- 0060 — Fix #64: Chat Confidential Visibility (RLS + FTS + Preview + Turunan)
-- ==========================================================================
--
-- Bug: chat_messages_select (0008:336-341) hanya cek is_chat_member OR can_view_workspace.
-- Tidak ada gate confidential_access_rules. Workspace-viewer non-CEO/PIC/grantee bisa
-- membaca pesan teks chat pada action plan confidential.
--
-- Perbaikan: menerapkan predikat confidential identik di 7 permukaan:
--   (1) RLS chat_messages_select
--   (2) RPC search_chat_messages
--   (3) RPC get_chat_rooms (mask body)
--   (4) recompute_chat_room_members (skip confidential AP) + one-shot backfill
--   (5) RLS mentions_select
--   (6) RLS chat_message_reactions_select
--   (7) RLS chat_message_reads_select
--
-- Klausa (b) = salinan klausa-2 can_access_action_plan (0051:34-46), JANGAN panggil
-- fungsinya langsung (klausa-1 menolak Reviewer/PIC-Task → memutus member chat sah).
--
-- PENTING: klausa (b) dienkapsulasi dalam fungsi SECURITY DEFINER
-- can_access_confidential_chat(uuid) agar subquery confidential_access_rules
-- tidak terblokir oleh RLS car_select pada tabel tersebut.
--
-- Keputusan owner 2026-07-15:
--   OWNER-A: balik resolusi 2026-07-12 "chat tidak model confidential"
--   OWNER-B: auto-remove non-grantee dari chat_room_members saat AP confidential
--   OWNER-C: mask HANYA last_message_body (unread_count + last_message_at tetap)
--   OWNER-D: pesan kind='system' dikecualikan dari gate confidential
--   SCOPE-1: mentions + reactions + reads di-scope-in ke migrasi ini
--
-- Referensi: specs/chat-confidential-visibility-tdd-plan.md, issue #64.

-- ==========================================================================
-- 0. Helper SECURITY DEFINER — can_access_confidential_chat
-- ==========================================================================
-- Mengembalikan TRUE jika:
--   (a) AP tidak confidential (tidak ada CR), ATAU
--   (b) user = CEO, ATAU
--   (c) user = AP PIC, ATAU
--   (d) user = grantee dalam CR.
-- SECURITY DEFINER agar bypass RLS car_select pada confidential_access_rules.
create or replace function public.can_access_confidential_chat(p_ap_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    not exists (
      select 1 from public.confidential_access_rules cr
      where cr.entity_type = 'action_plan' and cr.entity_id = p_ap_id
    )
    or public.user_role_level() = 'ceo'
    or exists (
      select 1 from public.action_plans ap
      where ap.id = p_ap_id and ap.pic_id = auth.uid()
    )
    or exists (
      select 1 from public.confidential_access_rules cr
      where cr.entity_type = 'action_plan' and cr.entity_id = p_ap_id
        and cr.user_id = auth.uid()
    )
$$;

revoke execute on function public.can_access_confidential_chat(uuid) from public, anon;
grant execute on function public.can_access_confidential_chat(uuid) to authenticated;

-- ==========================================================================
-- 1. RLS chat_messages_select — tambah klausa (b) confidential
-- ==========================================================================
drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (public.is_chat_member(chat_room_id) or public.can_view_workspace())
    and (
      kind = 'system'
      or exists (
        select 1 from public.chat_rooms r
        where r.id = chat_messages.chat_room_id
          and public.can_access_confidential_chat(r.action_plan_id)
      )
    )
  );

-- ==========================================================================
-- 2. RPC search_chat_messages — tambah klausa (b) di WHERE
-- ==========================================================================
create or replace function public.search_chat_messages(
  p_query      text,
  p_room_id    uuid        default null,
  p_limit      int         default 20,
  p_before     timestamptz default null,
  p_before_id  uuid        default null
)
returns table (
  message_id       uuid,
  chat_room_id     uuid,
  room_name        text,
  initiative_id    uuid,
  author_id        uuid,
  author_name      text,
  snippet          text,
  created_at       timestamptz,
  body_similarity  real
)
language plpgsql stable security definer set search_path = '' as $$
declare
  pat text;
begin
  if p_query is null or trim(p_query) = '' then return; end if;
  pat := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    cm.id          as message_id,
    cm.chat_room_id,
    r.name         as room_name,
    ap.initiative_id,
    cm.author_id,
    p.full_name    as author_name,
    cm.body        as snippet,
    cm.created_at,
    0::real        as body_similarity
  from public.chat_messages cm
  join public.chat_rooms r   on r.id = cm.chat_room_id
  join public.action_plans ap on ap.id = r.action_plan_id
  left join public.profiles p on p.id = cm.author_id
  where cm.organization_id = public.current_user_org()
    and (p_room_id is null or cm.chat_room_id = p_room_id)
    and (
      public.is_chat_member(cm.chat_room_id)
      or (
        public.can_view_workspace()
        and (ap.initiative_id is null or public.can_access_initiative(ap.initiative_id))
      )
    )
    -- klausa (b) confidential
    and (
      cm.kind = 'system'
      or public.can_access_confidential_chat(ap.id)
    )
    and cm.body ilike pat escape '\'
    and (
      p_before is null
      or (p_before_id is null and cm.created_at < p_before)
      or (p_before_id is not null and (cm.created_at, cm.id) < (p_before, p_before_id))
    )
  order by cm.created_at desc, cm.id desc
  limit p_limit;
end;
$$;

revoke execute on function public.search_chat_messages(text, uuid, int, timestamptz, uuid) from public, anon;
grant execute on function public.search_chat_messages(text, uuid, int, timestamptz, uuid) to authenticated;

-- ==========================================================================
-- 3. RPC get_chat_rooms — mask last_message_body (OWNER-C)
-- ==========================================================================
create or replace function public.get_chat_rooms()
returns table (
  id uuid,
  action_plan_id uuid,
  name text,
  unread_count int,
  last_message_at timestamptz,
  last_message_body text,
  last_message_author_name text
) language sql stable security definer set search_path = '' as $$
  select r.id, r.action_plan_id, r.name,
    (select count(*) from public.chat_messages cm
       where cm.chat_room_id = r.id
         and cm.author_id is distinct from auth.uid()
         and (cm.actor_id is null or cm.actor_id is distinct from auth.uid())
         and not exists (select 1 from public.chat_message_reads cr
                         where cr.chat_message_id = cm.id and cr.reader_id = auth.uid()))::int as unread_count,
    latest.created_at as last_message_at,
    -- OWNER-C: mask body saat AP confidential dan user bukan CEO/PIC/grantee
    case when public.can_access_confidential_chat(r.action_plan_id)
      then latest.body else null end as last_message_body,
    latest.author_name as last_message_author_name
  from public.chat_rooms r
  left join lateral (
    select cm.created_at, cm.body, p.full_name as author_name
    from public.chat_messages cm
    left join public.profiles p on p.id = cm.author_id
    where cm.chat_room_id = r.id
    order by cm.created_at desc, cm.id desc
    limit 1
  ) latest on true
  where public.is_chat_member(r.id)
  order by latest.created_at desc nulls last;
$$;

revoke execute on function public.get_chat_rooms() from public, anon;
grant execute on function public.get_chat_rooms() to authenticated;

-- ==========================================================================
-- 4. recompute_chat_room_members — skip confidential AP (OWNER-B)
-- ==========================================================================
create or replace function public.recompute_chat_room_members(p_room uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_action_plan uuid;
  v_is_confidential boolean;
begin
  select action_plan_id into v_action_plan from public.chat_rooms where id = p_room;
  if v_action_plan is null then return; end if;

  select exists (
    select 1 from public.confidential_access_rules cr
    where cr.entity_type = 'action_plan' and cr.entity_id = v_action_plan
  ) into v_is_confidential;

  if v_is_confidential then
    with eligible as (
      select ap.pic_id as member_id from public.action_plans ap
        where ap.id = v_action_plan and ap.pic_id is not null
      union
      select p.id from public.profiles p
        join public.role_templates rt on rt.id = p.role_template_id
        join public.action_plans ap2 on ap2.id = v_action_plan
        where p.organization_id = ap2.organization_id
          and rt.level = 'ceo' and p.is_active = true
      union
      select cr.user_id from public.confidential_access_rules cr
        where cr.entity_type = 'action_plan' and cr.entity_id = v_action_plan
    )
    insert into public.chat_room_members (chat_room_id, member_id)
    select p_room, e.member_id from eligible e
    on conflict (chat_room_id, member_id) do nothing;

    delete from public.chat_room_members m
    where m.chat_room_id = p_room
      and m.member_id not in (
        select ap.pic_id from public.action_plans ap
          where ap.id = v_action_plan and ap.pic_id is not null
        union
        select p.id from public.profiles p
          join public.role_templates rt on rt.id = p.role_template_id
          join public.action_plans ap2 on ap2.id = v_action_plan
          where p.organization_id = ap2.organization_id
            and rt.level = 'ceo' and p.is_active = true
        union
        select cr.user_id from public.confidential_access_rules cr
          where cr.entity_type = 'action_plan' and cr.entity_id = v_action_plan
      );
  else
    with eligible as (
      select i.pic_id as member_id from public.action_plans i
        where i.id = v_action_plan and i.pic_id is not null
      union
      select a.pic_id from public.tasks a
        where a.action_plan_id = v_action_plan and a.pic_id is not null
      union
      select a.reviewer_id from public.tasks a
        where a.action_plan_id = v_action_plan and a.reviewer_id is not null
    )
    insert into public.chat_room_members (chat_room_id, member_id)
    select p_room, e.member_id from eligible e
    on conflict (chat_room_id, member_id) do nothing;

    delete from public.chat_room_members m
    where m.chat_room_id = p_room
      and m.member_id not in (
        select i.pic_id from public.action_plans i where i.id = v_action_plan and i.pic_id is not null
        union
        select a.pic_id from public.tasks a where a.action_plan_id = v_action_plan and a.pic_id is not null
        union
        select a.reviewer_id from public.tasks a where a.action_plan_id = v_action_plan and a.reviewer_id is not null
      );
  end if;
end;
$$;

-- ==========================================================================
-- 4b. One-shot backfill: remove non-grantee members from confidential AP rooms
-- ==========================================================================
do $$
declare
  v_deleted int;
begin
  delete from public.chat_room_members crm
  where exists (
    select 1 from public.chat_rooms r
    join public.action_plans ap on ap.id = r.action_plan_id
    where r.id = crm.chat_room_id
      and exists (
        select 1 from public.confidential_access_rules cr
        where cr.entity_type = 'action_plan' and cr.entity_id = ap.id
      )
      and crm.member_id <> ap.pic_id
      and not exists (
        select 1 from public.profiles p
        join public.role_templates rt on rt.id = p.role_template_id
        where p.id = crm.member_id and rt.level = 'ceo' and p.is_active = true
      )
      and not exists (
        select 1 from public.confidential_access_rules cr2
        where cr2.entity_type = 'action_plan' and cr2.entity_id = ap.id
          and cr2.user_id = crm.member_id
      )
  );
  get diagnostics v_deleted = row_count;
  raise notice '0059 backfill: removed % non-grantee member(s) from confidential AP rooms', v_deleted;
end $$;

-- ==========================================================================
-- 5. RLS mentions_select — tambah klausa (b) confidential pada branch chat
-- ==========================================================================
drop policy if exists "mentions_select" on public.mentions;
create policy "mentions_select" on public.mentions
  for select to authenticated
  using (
    -- Self-mention: gate chat mentions by confidential, pass comment mentions through
    (mentioned_user_id = auth.uid() and (
      chat_message_id is null
      or exists (
        select 1 from public.chat_messages cm
        join public.chat_rooms r on r.id = cm.chat_room_id
        where cm.id = mentions.chat_message_id
          and public.can_access_confidential_chat(r.action_plan_id)
      )
    ))
    or (chat_message_id is not null and exists (
      select 1 from public.chat_messages cm
      join public.chat_rooms r on r.id = cm.chat_room_id
      where cm.id = mentions.chat_message_id
        and (public.is_chat_member(cm.chat_room_id) or public.can_view_workspace())
        and public.can_access_confidential_chat(r.action_plan_id)
    ))
    or (comment_id is not null and exists (
      select 1 from public.comments c where c.id = mentions.comment_id and (
        (c.entity_type = 'action_plan' and public.can_access_action_plan(c.entity_id))
        or (c.entity_type = 'initiative' and public.can_access_initiative(c.entity_id)))))
  );

-- ==========================================================================
-- 6. RLS chat_message_reactions_select — tambah klausa (b)
-- ==========================================================================
drop policy if exists "chat_message_reactions_select" on public.chat_message_reactions;
create policy "chat_message_reactions_select" on public.chat_message_reactions
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and exists (
      select 1 from public.chat_messages cm
      join public.chat_rooms r on r.id = cm.chat_room_id
      where cm.id = chat_message_reactions.chat_message_id
        and (public.is_chat_member(cm.chat_room_id) or public.can_view_workspace())
        and public.can_access_confidential_chat(r.action_plan_id)
    )
  );

-- ==========================================================================
-- 7. RLS chat_message_reads_select — tambah klausa (b)
-- ==========================================================================
drop policy if exists "chat_message_reads_select" on public.chat_message_reads;
create policy "chat_message_reads_select" on public.chat_message_reads
  for select to authenticated
  using (
    -- Own reads: still gated by confidential
    (reader_id = auth.uid() and exists (
      select 1 from public.chat_messages cm
      join public.chat_rooms r on r.id = cm.chat_room_id
      where cm.id = chat_message_reads.chat_message_id
        and public.can_access_confidential_chat(r.action_plan_id)
    ))
    or exists (
      select 1 from public.chat_messages cm
      join public.chat_rooms r on r.id = cm.chat_room_id
      where cm.id = chat_message_reads.chat_message_id
        and (public.is_chat_member(cm.chat_room_id) or public.can_view_workspace())
        and public.can_access_confidential_chat(r.action_plan_id)
    )
  );

-- ==========================================================================
-- Sanity: verify policy count
-- ==========================================================================
do $$
declare n int;
begin
  select count(*) into n from pg_policies
    where tablename = 'chat_messages' and policyname = 'chat_messages_select';
  if n <> 1 then raise exception '0059 sanity: chat_messages_select policy count = % (expected 1)', n; end if;
  raise notice '0059: chat_messages_select policy OK (count=1)';
end $$;
