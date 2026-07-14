-- Migration 0045: Reaction pill — chat_message_reactions (PRD §30.6, spec inbox-chat-reactions.md)
--
-- §7.1 Tabel referensi whitelist (sumber kebenaran tunggal)
-- §7.2 Tabel reaksi (PK komposit, FK CASCADE, RLS, revoke I/U/D)
-- §7.3 RPC toggle_chat_reaction (SECURITY DEFINER, concurrency-safe)

-- ============================================================ §7.1 reaction_emojis
create table if not exists public.reaction_emojis (
  emoji      text primary key,
  sort_order int not null default 0,
  active     boolean not null default true
);
insert into public.reaction_emojis (emoji, sort_order) values
  ('👍',1),('✅',2),('👀',3),('🙏',4)
on conflict (emoji) do nothing;
alter table public.reaction_emojis enable row level security;
drop policy if exists reaction_emojis_select on public.reaction_emojis;
create policy reaction_emojis_select on public.reaction_emojis
  for select to authenticated using (true);
revoke insert, update, delete on public.reaction_emojis from authenticated, anon;

-- ============================================================ §7.2 chat_message_reactions
create table if not exists public.chat_message_reactions (
  chat_message_id uuid not null references public.chat_messages (id)   on delete cascade,
  reactor_id      uuid not null references public.profiles (id)        on delete cascade,
  emoji           text not null references public.reaction_emojis (emoji),
  organization_id uuid not null references public.organizations (id)   on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (chat_message_id, reactor_id, emoji)
);
alter table public.chat_message_reactions enable row level security;

drop policy if exists chat_message_reactions_select on public.chat_message_reactions;
create policy chat_message_reactions_select on public.chat_message_reactions
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and exists (
      select 1 from public.chat_messages cm
      where cm.id = chat_message_id
        and (public.is_chat_member(cm.chat_room_id) or public.can_view_workspace())
    )
  );
revoke insert, update, delete on public.chat_message_reactions from authenticated, anon;

-- ============================================================ §7.3 toggle_chat_reaction RPC
create or replace function public.toggle_chat_reaction(p_message uuid, p_emoji text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_room uuid;
  v_org  uuid;
  v_uid  uuid := auth.uid();
  v_del  int;
begin
  select chat_room_id, organization_id into v_room, v_org
    from public.chat_messages where id = p_message;
  if not found then raise exception 'Pesan tidak ditemukan.'; end if;
  if not public.is_chat_member(v_room) then
    raise exception 'Hanya anggota room yang dapat memberi reaksi.';
  end if;

  delete from public.chat_message_reactions
   where chat_message_id = p_message and reactor_id = v_uid and emoji = p_emoji;
  get diagnostics v_del = row_count;
  if v_del > 0 then
    return false;
  end if;

  if not exists (select 1 from public.reaction_emojis where emoji = p_emoji and active) then
    raise exception 'Emoji tidak didukung.';
  end if;
  insert into public.chat_message_reactions (chat_message_id, reactor_id, emoji, organization_id)
  values (p_message, v_uid, p_emoji, v_org)
  on conflict (chat_message_id, reactor_id, emoji) do nothing;
  return true;
end;
$$;
revoke execute on function public.toggle_chat_reaction(uuid, text) from public, anon;
grant  execute on function public.toggle_chat_reaction(uuid, text) to authenticated;
