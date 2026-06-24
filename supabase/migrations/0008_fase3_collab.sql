-- EMS V1.8.1 — Fase 3: Home (Today Command Center) + Notifications + Inbox (Initiative Chat)
-- Lapisan kolaborasi & alert ADITIF di atas loop eksekusi Fase 1–2. Tidak ada jalur tulis baru
-- yang melonggarkan invarian governance (RLS, anti-self-approval, evidence locking, append-only, audit).
-- Spec: specs/fase-3-home-notifications-inbox.md + addendum mengikat specs/fase-3-resolusi-blocker.md.
--
-- Urutan DDL dependency-safe (addendum §6.1 / CF-3):
--   org_today()/get_org_today()  → notifications → chat_rooms → chat_room_members
--   → chat_messages → chat_message_reads → comments → mentions
--   → is_chat_member() → RLS → RPC tulis → trigger → REPLACE 5 RPC existing (emit notif) → pg_cron.
--
-- Prinsip terkunci:
--   * "Hari ini" SATU sumber = public.org_today() (server, org timezone). Klien tak pernah menghitung.
--   * Append-only 2-lapis: grant tulis langsung DICABUT + tulis sah hanya via RPC SECURITY DEFINER.
--   * Guard 5 RPC existing dipertahankan IDENTIK; emit notif hanya MENAMBAH baris setelah blok guard (AC-N9).
--   * governance_warning recipient bercabang per violation_type (CF-1): reviewer_override → JANGAN ke pelaku.

-- ============================================================ HELPER: tanggal org (sumber tunggal)

-- org_today(p_org): tanggal sekarang pada timezone organisasi. p_org null → current_user_org()
-- (konteks user/RLS). Konteks cron memanggil dengan p_org eksplisit (auth.uid() null saat cron).
create or replace function public.org_today(p_org uuid default null)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select o.timezone from public.organizations o
      where o.id = coalesce(p_org, public.current_user_org())),
    'Asia/Jakarta'))::date;
$$;

-- RPC pembungkus untuk koordinasi UI (dateLabel/orkestrasi). NILAINYA TIDAK PERNAH dikirim
-- balik sebagai parameter tanggal ke RPC section/cron (CF-3) — server selalu hitung sendiri.
create or replace function public.get_org_today()
returns date language sql stable security definer set search_path = '' as $$
  select public.org_today(null);
$$;

revoke execute on function public.org_today(uuid) from public, anon;
revoke execute on function public.get_org_today() from public, anon;

-- ============================================================ HELPER: can_access_initiative (rekonsiliasi drift)
-- DB dev tidak punya can_access_initiative (Fase 1 deployed memakai initiative_has_my_action_plan
-- inline di policy). Definisikan di sini agar policy/RPC comment Fase 3 punya satu helper akses
-- Initiative yang konsisten dgn semantik live (org + view_workspace/pic/creator/punya AP turunan).
create or replace function public.can_access_initiative(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i
    where i.id = p_initiative
      and i.organization_id = public.current_user_org()
      and (public.can_view_workspace() or i.pic_id = auth.uid()
           or i.created_by = auth.uid() or public.initiative_has_my_action_plan(i.id))
  );
$$;
revoke execute on function public.can_access_initiative(uuid) from public, anon;

-- ============================================================ RPC: Home section queries (per-section, org-tz server)
-- Per-section (BUKAN agregat) demi retry granular AC-H11. Tiap RPC menghitung org_today() di
-- server (CF-3: tanggal otoritatif server, klien tak pernah mengirim tanggal). Bentuk seragam
-- (kind, id, action_plan_id, name, due, status) agar klien menyatukan one-time + instance.

-- Repeat instance jatuh tempo HARI INI (status aktif).
create or replace function public.get_today_repeat_instances()
returns table (kind text, id uuid, action_plan_id uuid, name text, due date, status text)
language sql stable security definer set search_path = '' as $$
  select 'instance', i.id, i.action_plan_id, a.name,
         (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date, i.status
  from public.action_plan_instances i
  join public.action_plans a on a.id = i.action_plan_id
  join public.organizations o on o.id = i.organization_id
  where i.pic_id = auth.uid()
    and i.status in ('assigned', 'in_progress')
    and (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date = public.org_today()
  order by i.deadline_at asc;
$$;

-- Terlewat: Action Plan one-time deadline lewat + instance status 'missed'.
create or replace function public.get_overdue_items()
returns table (kind text, id uuid, action_plan_id uuid, name text, due date, status text)
language sql stable security definer set search_path = '' as $$
  select 'action_plan', a.id, a.id, a.name, a.deadline, a.status
  from public.action_plans a
  where a.pic_id = auth.uid() and a.repeat_setting <> 'repeat'
    and a.status in ('assigned', 'in_progress', 'revision')
    and a.deadline is not null and a.deadline < public.org_today()
  union all
  select 'instance', i.id, i.action_plan_id, a.name,
         (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date, i.status
  from public.action_plan_instances i
  join public.action_plans a on a.id = i.action_plan_id
  join public.organizations o on o.id = i.organization_id
  where i.pic_id = auth.uid() and i.status = 'missed';
$$;

-- Deadline mendekat: dalam (org_today, org_today + 3] untuk one-time + instance aktif.
create or replace function public.get_near_deadline_items()
returns table (kind text, id uuid, action_plan_id uuid, name text, due date, status text)
language sql stable security definer set search_path = '' as $$
  select 'action_plan', a.id, a.id, a.name, a.deadline, a.status
  from public.action_plans a
  where a.pic_id = auth.uid() and a.repeat_setting <> 'repeat'
    and a.status in ('assigned', 'in_progress', 'revision')
    and a.deadline is not null
    and a.deadline > public.org_today() and a.deadline <= public.org_today() + 3
  union all
  select 'instance', i.id, i.action_plan_id, a.name,
         (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date, i.status
  from public.action_plan_instances i
  join public.action_plans a on a.id = i.action_plan_id
  join public.organizations o on o.id = i.organization_id
  where i.pic_id = auth.uid() and i.status in ('assigned', 'in_progress')
    and (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date > public.org_today()
    and (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date <= public.org_today() + 3;
$$;

grant execute on function public.get_today_repeat_instances() to authenticated;
grant execute on function public.get_overdue_items() to authenticated;
grant execute on function public.get_near_deadline_items() to authenticated;
revoke execute on function public.get_today_repeat_instances() from public, anon;
revoke execute on function public.get_overdue_items() from public, anon;
revoke execute on function public.get_near_deadline_items() from public, anon;

-- ============================================================ TABEL: notifications (append-only)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (type in (
    'review_request', 'approved', 'rejected', 'deadline_reminder', 'repeat_due',
    'instance_missed', 'comment', 'mention', 'governance_warning')),
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  body text,
  is_read boolean not null default false,
  read_at timestamptz,
  -- dedupe_date NULL untuk notif event-driven (selalu insert); diisi org_today() untuk notif
  -- cron (deadline_reminder/repeat_due) agar idempoten per hari (AC-N10 / CF-3).
  dedupe_date date,
  created_at timestamptz not null default now()
);

-- Idempotensi cron: satu notif per (penerima, entity, tipe, tanggal-lokal-org). Partial → notif
-- event-driven (dedupe_date null) tak pernah ikut konflik.
create unique index if not exists uq_notifications_dedupe
  on public.notifications (recipient_id, entity_id, type, dedupe_date)
  where dedupe_date is not null;

create index if not exists idx_notifications_recipient
  on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (recipient_id) where is_read = false;

-- ============================================================ TABEL: chat_rooms (1 per Initiative)

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  initiative_id uuid not null unique references public.initiatives (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================ TABEL: chat_room_members (turunan akses)

create table if not exists public.chat_room_members (
  chat_room_id uuid not null references public.chat_rooms (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (chat_room_id, member_id)
);

create index if not exists idx_chat_members_member on public.chat_room_members (member_id);

-- ============================================================ TABEL: chat_messages (immutable)

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  chat_room_id uuid not null references public.chat_rooms (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_room on public.chat_messages (chat_room_id, created_at);

-- ============================================================ TABEL: chat_message_reads (unread per room)

create table if not exists public.chat_message_reads (
  chat_message_id uuid not null references public.chat_messages (id) on delete cascade,
  reader_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (chat_message_id, reader_id)
);

-- ============================================================ TABEL: comments (minimal Fase 3, UI thread → Fase 8)

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('action_plan', 'initiative', 'action_plan_instance')),
  entity_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_entity on public.comments (entity_type, entity_id, created_at);

-- ============================================================ TABEL: mentions (FK ke comments + chat_messages terakhir)

create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid references public.comments (id) on delete cascade,
  chat_message_id uuid references public.chat_messages (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Tepat satu sumber mention.
  constraint mentions_exactly_one_source check (num_nonnulls(comment_id, chat_message_id) = 1)
);

create index if not exists idx_mentions_user on public.mentions (mentioned_user_id);

-- ============================================================ HELPER: is_chat_member (SECURITY DEFINER → hindari rekursi RLS)

-- Dipakai di policy chat_room_members/chat_messages. SECURITY DEFINER membypass RLS tabel yang
-- dirujuk sehingga policy tidak memanggil dirinya sendiri (anti-rekursi).
create or replace function public.is_chat_member(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_room_members m
    where m.chat_room_id = p_room and m.member_id = auth.uid()
  );
$$;

revoke execute on function public.is_chat_member(uuid) from public, anon;

-- ============================================================ HELPER: emit_notification (internal)

-- Satu titik tulis notifikasi. Skip self-notify (actor = recipient). Dedupe via partial unique
-- hanya saat p_dedupe_date not null. Dipanggil dari RPC/trigger SECURITY DEFINER lain.
create or replace function public.emit_notification(
  p_org uuid, p_recipient uuid, p_actor uuid, p_type text,
  p_entity_type text, p_entity_id uuid, p_title text, p_body text,
  p_dedupe_date date default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null then return; end if;
  if p_actor is not null and p_actor = p_recipient then return; end if;
  insert into public.notifications
    (organization_id, recipient_id, actor_id, type, entity_type, entity_id, title, body, dedupe_date)
  values (p_org, p_recipient, p_actor, p_type, p_entity_type, p_entity_id, p_title, p_body, p_dedupe_date)
  on conflict (recipient_id, entity_id, type, dedupe_date) where dedupe_date is not null do nothing;
end;
$$;

revoke execute on function public.emit_notification(uuid, uuid, uuid, text, text, uuid, text, text, date)
  from public, anon, authenticated;

-- ============================================================ HELPER: chat membership recompute (add + revoke)

-- Keanggotaan room = PIC Initiative + PIC/Reviewer Action Plan turunan (TIDAK ada Reviewer
-- Initiative — kolom tak ada). "PIC card induk" (Strategy) = no-op s/d Fase 4. Sinkron penuh:
-- tambah anggota yang berhak, cabut yang tak lagi berhak (R2 / addendum).
create or replace function public.recompute_chat_room_members(p_room uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_initiative uuid;
begin
  select initiative_id into v_initiative from public.chat_rooms where id = p_room;
  if v_initiative is null then return; end if;

  with eligible as (
    select i.pic_id as member_id from public.initiatives i
      where i.id = v_initiative and i.pic_id is not null
    union
    select a.pic_id from public.action_plans a
      where a.initiative_id = v_initiative and a.pic_id is not null
    union
    select a.reviewer_id from public.action_plans a
      where a.initiative_id = v_initiative and a.reviewer_id is not null
  )
  insert into public.chat_room_members (chat_room_id, member_id)
  select p_room, e.member_id from eligible e
  on conflict (chat_room_id, member_id) do nothing;

  -- Cabut anggota yang tak lagi berhak.
  delete from public.chat_room_members m
  where m.chat_room_id = p_room
    and m.member_id not in (
      select i.pic_id from public.initiatives i where i.id = v_initiative and i.pic_id is not null
      union
      select a.pic_id from public.action_plans a where a.initiative_id = v_initiative and a.pic_id is not null
      union
      select a.reviewer_id from public.action_plans a where a.initiative_id = v_initiative and a.reviewer_id is not null
    );
end;
$$;

revoke execute on function public.recompute_chat_room_members(uuid) from public, anon, authenticated;

-- ============================================================ RLS

alter table public.notifications enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reads enable row level security;
alter table public.comments enable row level security;
alter table public.mentions enable row level security;

-- Semua tabel HANYA punya policy SELECT. Tulis dicabut total (lihat REVOKE di bawah) → hanya
-- RPC SECURITY DEFINER yang menulis = append-only ditegakkan 2-lapis.

-- notifications: hanya penerima.
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select to authenticated
  using (organization_id = public.current_user_org() and recipient_id = auth.uid());

-- chat_rooms: anggota room, atau view_all_workspace (read-only, R9).
drop policy if exists "chat_rooms_select" on public.chat_rooms;
create policy "chat_rooms_select" on public.chat_rooms
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.is_chat_member(id) or public.can_view_workspace()));

-- chat_room_members: anggota room boleh lihat daftar anggota (helper SECURITY DEFINER → no rekursi).
drop policy if exists "chat_room_members_select" on public.chat_room_members;
create policy "chat_room_members_select" on public.chat_room_members
  for select to authenticated
  using (public.is_chat_member(chat_room_id) or member_id = auth.uid());

-- chat_messages: anggota room, atau view_all_workspace (read-only).
drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.is_chat_member(chat_room_id) or public.can_view_workspace()));

-- chat_message_reads: hanya pembaca sendiri.
drop policy if exists "chat_message_reads_select" on public.chat_message_reads;
create policy "chat_message_reads_select" on public.chat_message_reads
  for select to authenticated using (reader_id = auth.uid());

-- comments: ikut akses entity (action_plan/initiative/instance).
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated
  using (organization_id = public.current_user_org() and (
    (entity_type = 'action_plan' and public.can_access_action_plan(entity_id))
    or (entity_type = 'initiative' and public.can_access_initiative(entity_id))
    or (entity_type = 'action_plan_instance' and exists (
         select 1 from public.action_plan_instances i
         where i.id = entity_id and public.can_access_action_plan(i.action_plan_id)))
  ));

-- mentions: yang disebut, atau yang bisa melihat sumber (comment/message).
drop policy if exists "mentions_select" on public.mentions;
create policy "mentions_select" on public.mentions
  for select to authenticated
  using (
    mentioned_user_id = auth.uid()
    or (chat_message_id is not null and exists (
         select 1 from public.chat_messages cm
         where cm.id = chat_message_id and public.is_chat_member(cm.chat_room_id)))
    or (comment_id is not null and exists (
         select 1 from public.comments c where c.id = comment_id and (
           (c.entity_type = 'action_plan' and public.can_access_action_plan(c.entity_id))
           or (c.entity_type = 'initiative' and public.can_access_initiative(c.entity_id)))))
  );

-- ============================================================ RPC: notifications mark-read

-- Idempoten: hanya set read_at sekali (immutable setelah dibaca). recipient guard.
create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
    set is_read = true, read_at = coalesce(read_at, now())
    where id = p_id and recipient_id = auth.uid() and is_read = false;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.notifications
    set is_read = true, read_at = now()
    where recipient_id = auth.uid() and is_read = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================ RPC: chat — kirim pesan + mention

-- Author wajib anggota room. Mention divalidasi server: hanya id yang juga anggota room yang
-- menghasilkan baris mentions + notif (non-member = silent no-op, AC-I6). Pesan immutable.
create or replace function public.send_chat_message(p_room uuid, p_body text, p_mentions uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_room public.chat_rooms;
  v_msg_id uuid;
  v_uid uuid := auth.uid();
  v_mention uuid;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Pesan tidak boleh kosong.'; end if;
  select * into v_room from public.chat_rooms where id = p_room;
  if not found then raise exception 'Chat room tidak ditemukan.'; end if;
  if not public.is_chat_member(p_room) then
    raise exception 'Hanya anggota room yang dapat mengirim pesan.';
  end if;

  insert into public.chat_messages (organization_id, chat_room_id, author_id, body)
  values (v_room.organization_id, p_room, v_uid, trim(p_body))
  returning id into v_msg_id;

  -- Mention akses-gated: hanya anggota room.
  if p_mentions is not null then
    for v_mention in
      select distinct unnest(p_mentions)
    loop
      if v_mention <> v_uid and exists (
        select 1 from public.chat_room_members m where m.chat_room_id = p_room and m.member_id = v_mention)
      then
        insert into public.mentions (chat_message_id, mentioned_user_id) values (v_msg_id, v_mention);
        perform public.emit_notification(v_room.organization_id, v_mention, v_uid, 'mention',
          'chat_message', v_msg_id, 'Anda disebut dalam diskusi', null);
      end if;
    end loop;
  end if;

  return v_msg_id;
end;
$$;

-- Tandai semua pesan di room sebagai terbaca (kecuali pesan sendiri). Idempoten.
create or replace function public.mark_chat_messages_read(p_room uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int; v_uid uuid := auth.uid();
begin
  if not public.is_chat_member(p_room) then return 0; end if;
  insert into public.chat_message_reads (chat_message_id, reader_id)
  select cm.id, v_uid from public.chat_messages cm
  where cm.chat_room_id = p_room and cm.author_id is distinct from v_uid
  on conflict (chat_message_id, reader_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Daftar room yang user ikuti + unread (pesan bukan dari dirinya yang belum dibaca). Read-only.
create or replace function public.get_chat_rooms()
returns table (
  id uuid, initiative_id uuid, name text, unread_count int, last_message_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select r.id, r.initiative_id, r.name,
    (select count(*) from public.chat_messages cm
       where cm.chat_room_id = r.id
         and cm.author_id is distinct from auth.uid()
         and not exists (select 1 from public.chat_message_reads cr
                         where cr.chat_message_id = cm.id and cr.reader_id = auth.uid()))::int as unread_count,
    (select max(cm.created_at) from public.chat_messages cm where cm.chat_room_id = r.id) as last_message_at
  from public.chat_rooms r
  where public.is_chat_member(r.id)
  order by last_message_at desc nulls last;
$$;

-- ============================================================ RPC: comment minimal + mention

create or replace function public.create_comment(
  p_entity_type text, p_entity_id uuid, p_body text, p_mentions uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.current_user_org();
  v_uid uuid := auth.uid();
  v_id uuid;
  v_access boolean;
  v_mention uuid;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Komentar tidak boleh kosong.'; end if;
  if p_entity_type not in ('action_plan', 'initiative', 'action_plan_instance') then
    raise exception 'entity_type komentar tidak valid.';
  end if;

  v_access := case
    when p_entity_type = 'action_plan' then public.can_access_action_plan(p_entity_id)
    when p_entity_type = 'initiative' then public.can_access_initiative(p_entity_id)
    when p_entity_type = 'action_plan_instance' then exists (
      select 1 from public.action_plan_instances i
      where i.id = p_entity_id and public.can_access_action_plan(i.action_plan_id))
    else false end;
  if not v_access then raise exception 'Anda tidak berhak mengomentari item ini.'; end if;

  insert into public.comments (organization_id, entity_type, entity_id, author_id, body)
  values (v_org, p_entity_type, p_entity_id, v_uid, trim(p_body))
  returning id into v_id;

  -- Mention akses-gated: hanya id yang juga punya akses entity.
  if p_mentions is not null then
    for v_mention in select distinct unnest(p_mentions) loop
      if v_mention <> v_uid and (
        case
          when p_entity_type = 'action_plan' then public.can_access_action_plan(p_entity_id)
          when p_entity_type = 'initiative' then public.can_access_initiative(p_entity_id)
          else exists (select 1 from public.action_plan_instances i
                       where i.id = p_entity_id and public.can_access_action_plan(i.action_plan_id))
        end)
      then
        insert into public.mentions (comment_id, mentioned_user_id) values (v_id, v_mention);
        perform public.emit_notification(v_org, v_mention, v_uid, 'mention',
          p_entity_type, p_entity_id, 'Anda disebut dalam komentar', null);
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

-- ============================================================ TRIGGER: auto-create chat room saat Initiative aktif

create or replace function public.tg_initiative_chat_room()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_room uuid;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.chat_rooms (organization_id, initiative_id, name)
    values (new.organization_id, new.id, new.name)
    on conflict (initiative_id) do nothing
    returning id into v_room;
    if v_room is null then
      select id into v_room from public.chat_rooms where initiative_id = new.id;
    end if;
    perform public.recompute_chat_room_members(v_room);
  end if;
  return new;
end;
$$;

drop trigger if exists initiative_chat_room on public.initiatives;
create trigger initiative_chat_room
  after insert or update of status on public.initiatives
  for each row execute function public.tg_initiative_chat_room();

-- ============================================================ TRIGGER: sync anggota room saat Action Plan berubah

create or replace function public.tg_action_plan_sync_chat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_room uuid;
begin
  select id into v_room from public.chat_rooms
    where initiative_id = coalesce(new.initiative_id, old.initiative_id);
  if v_room is not null then perform public.recompute_chat_room_members(v_room); end if;
  -- Bila Action Plan pindah Initiative, sinkron room lama juga.
  if tg_op = 'UPDATE' and new.initiative_id is distinct from old.initiative_id then
    select id into v_room from public.chat_rooms where initiative_id = old.initiative_id;
    if v_room is not null then perform public.recompute_chat_room_members(v_room); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists action_plan_sync_chat on public.action_plans;
create trigger action_plan_sync_chat
  after insert or update of pic_id, reviewer_id, initiative_id on public.action_plans
  for each row execute function public.tg_action_plan_sync_chat();

-- ============================================================ TRIGGER: governance_warning (CF-1 bercabang per type)

-- Recipient diturunkan dari entity_id (card terdampak), BUKAN blanket governance_violations.user_id:
--   * reviewer_override → user_id = PELAKU; recipient = PIC+Reviewer card + pemegang view_governance_violation;
--     pelaku DIKECUALIKAN (emit_notification skip actor; pemegang permission yg juga pelaku tak relevan).
--   * instance_missed   → user_id = PIC korban; PIC sudah dapat notif domain 'instance_missed' terpisah,
--     governance_warning di sini menyasar oversight: Reviewer card + pemegang view_governance_violation.
-- Hanya severity >= medium yang memicu (low diabaikan).
create or replace function public.tg_governance_warning()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pic uuid;
  v_reviewer uuid;
  v_holder uuid;
begin
  if new.severity is null or new.severity not in ('medium', 'high', 'critical') then
    return new;
  end if;

  -- Resolusi PIC/Reviewer card terdampak dari entity.
  if new.entity_type = 'action_plan' then
    select pic_id, reviewer_id into v_pic, v_reviewer from public.action_plans where id = new.entity_id;
  elsif new.entity_type = 'action_plan_instance' then
    select pic_id, reviewer_id into v_pic, v_reviewer from public.action_plan_instances where id = new.entity_id;
  end if;

  if new.violation_type = 'reviewer_override' then
    -- Pelaku (new.user_id) sebagai actor → emit_notification otomatis skip jika ia juga recipient.
    perform public.emit_notification(new.organization_id, v_pic, new.user_id, 'governance_warning',
      new.entity_type, new.entity_id, 'Peringatan governance pada card Anda', null);
    perform public.emit_notification(new.organization_id, v_reviewer, new.user_id, 'governance_warning',
      new.entity_type, new.entity_id, 'Peringatan governance pada card Anda', null);
  else
    -- instance_missed dll: oversight = Reviewer card.
    perform public.emit_notification(new.organization_id, v_reviewer, null, 'governance_warning',
      new.entity_type, new.entity_id, 'Peringatan governance pada card terkait', null);
  end if;

  -- Pemegang permission view_governance_violation (oversight org).
  for v_holder in
    select up.user_id from public.user_permissions up
    join public.permissions p on p.id = up.permission_id
    where up.granted and p.key = 'view_governance_violation'
      and exists (select 1 from public.profiles pr
                  where pr.id = up.user_id and pr.organization_id = new.organization_id)
  loop
    perform public.emit_notification(new.organization_id, v_holder, new.user_id, 'governance_warning',
      new.entity_type, new.entity_id, 'Governance violation tercatat', null);
  end loop;

  return new;
end;
$$;

drop trigger if exists governance_warning on public.governance_violations;
create trigger governance_warning
  after insert on public.governance_violations
  for each row execute function public.tg_governance_warning();

-- ============================================================ REPLACE RPC existing (emit notif; guard IDENTIK)
-- Guard byte-for-byte sama dengan 0005/0007. Perubahan HANYA: tambahan perform emit_notification
-- SETELAH blok update sukses. Tidak ada guard yang dilonggarkan (AC-N9; suite 29-case di test/).

-- submit_action_plan (one-time): emit review_request ke reviewer.
create or replace function public.submit_action_plan(
  p_action_plan_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
  v_version int;
  v_submission_id uuid;
  v_item jsonb;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if a.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat submit pekerjaan ini.'; end if;
  if a.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Action Plan tidak dalam status yang bisa disubmit.';
  end if;

  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  if a.result_value_required
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.action_plan_submissions
  where action_plan_id = p_action_plan_id and action_plan_instance_id is null;

  insert into public.action_plan_submissions (action_plan_id, version_number, submitted_by, note)
  values (p_action_plan_id, v_version, auth.uid(), nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (v_submission_id, v_item ->> 'kind', v_item ->> 'storage_path', v_item ->> 'url',
              v_item ->> 'text_content', v_item ->> 'file_name', v_item ->> 'mime_type', auth.uid());
    end loop;
  end if;

  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      insert into public.action_plan_result_values (submission_id, label, value_type, value_text)
      values (v_submission_id, v_item ->> 'label', coalesce(v_item ->> 'value_type', 'text'), v_item ->> 'value_text');
    end loop;
  end if;

  update public.action_plans
  set status = 'submitted', current_submission_id = v_submission_id
  where id = p_action_plan_id;

  perform public.write_activity('action_plan', p_action_plan_id, 'submit',
    jsonb_build_object('submission_id', v_submission_id, 'version', v_version));

  -- Fase 3: minta review ke reviewer.
  perform public.emit_notification(a.organization_id, a.reviewer_id, a.pic_id, 'review_request',
    'action_plan', p_action_plan_id, 'Permintaan review', a.name);

  return v_submission_id;
end;
$$;

-- review_action_plan_submission (one-time): emit approved/rejected ke PIC.
create or replace function public.review_action_plan_submission(
  p_submission_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.action_plan_submissions;
  a public.action_plans;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.action_plan_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  select * into a from public.action_plans where id = s.action_plan_id;

  -- Anti self-approval: blok keras (PIC tidak boleh me-review pekerjaannya sendiri).
  if a.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  -- Reviewer non-tunjuk: hanya boleh lewat permission manage_others_cards, dan dicatat sbg override governance.
  if a.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail)
      values (a.organization_id, auth.uid(), 'reviewer_override', 'action_plan', a.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', a.reviewer_id));
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review pekerjaan ini.';
    end if;
  end if;
  if s.review_status <> 'pending' or a.status <> 'submitted' then
    raise exception 'Submission ini sudah direview atau tidak menunggu review.';
  end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  update public.action_plan_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (action_plan_id, submission_id, reviewer_id, decision, reason)
  values (a.id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.action_plans
  set status = case when p_decision = 'approve' then 'done' else 'revision' end
  where id = a.id;

  perform public.write_activity('action_plan', a.id,
    case when p_decision = 'approve' then 'review_approve' else 'review_reject' end,
    jsonb_build_object('submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  -- Fase 3: kabari PIC hasil review.
  perform public.emit_notification(a.organization_id, a.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'action_plan', a.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end,
    a.name);
end;
$$;

-- submit_action_plan_instance: emit review_request ke reviewer instance (bila review_required).
create or replace function public.submit_action_plan_instance(
  p_instance_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ins public.action_plan_instances;
  a public.action_plans;
  v_version int;
  v_submission_id uuid;
  v_item jsonb;
  v_now timestamptz := now();
  v_effective_deadline timestamptz;
  v_late boolean := false;
  v_late_minutes int := null;
begin
  select * into ins from public.action_plan_instances where id = p_instance_id;
  if not found then raise exception 'Instance tidak ditemukan.'; end if;
  if ins.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat submit instance ini.'; end if;
  if ins.status = 'missed' then raise exception 'Instance sudah Terlewat dan tidak dapat disubmit.'; end if;
  if ins.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Instance tidak dalam status yang bisa disubmit.';
  end if;

  select * into a from public.action_plans where id = ins.action_plan_id;

  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  if a.result_value_required
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.action_plan_submissions where action_plan_instance_id = p_instance_id;

  insert into public.action_plan_submissions
    (action_plan_id, action_plan_instance_id, version_number, submitted_by, note)
  values (ins.action_plan_id, p_instance_id, v_version, auth.uid(), nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (v_submission_id, v_item ->> 'kind', v_item ->> 'storage_path', v_item ->> 'url',
              v_item ->> 'text_content', v_item ->> 'file_name', v_item ->> 'mime_type', auth.uid());
    end loop;
  end if;

  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      insert into public.action_plan_result_values (submission_id, label, value_type, value_text)
      values (v_submission_id, v_item ->> 'label', coalesce(v_item ->> 'value_type', 'text'), v_item ->> 'value_text');
    end loop;
  end if;

  v_effective_deadline := ins.deadline_at;
  if v_now > v_effective_deadline then
    v_late := true;
    v_late_minutes := ceil(extract(epoch from (v_now - v_effective_deadline)) / 60.0)::int;
  end if;

  update public.action_plan_instances
  set status = case when a.review_required then 'submitted' else 'done' end,
      current_submission_id = v_submission_id,
      submitted_at = v_now,
      submitted_late = v_late,
      late_minutes = v_late_minutes,
      reviewed_at = case when a.review_required then null else v_now end
  where id = p_instance_id;

  if not a.review_required then
    update public.action_plan_submissions set review_status = 'approved' where id = v_submission_id;
  end if;

  perform public.write_activity('action_plan', ins.action_plan_id, 'submit_instance',
    jsonb_build_object('instance_id', p_instance_id, 'submission_id', v_submission_id, 'version', v_version));

  -- Fase 3: minta review ke reviewer instance bila perlu review.
  if a.review_required then
    perform public.emit_notification(ins.organization_id, ins.reviewer_id, ins.pic_id, 'review_request',
      'action_plan_instance', p_instance_id, 'Permintaan review', a.name);
  end if;

  return v_submission_id;
end;
$$;

-- review_action_plan_instance_submission: emit approved/rejected ke PIC instance.
create or replace function public.review_action_plan_instance_submission(
  p_submission_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.action_plan_submissions;
  ins public.action_plan_instances;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.action_plan_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  if s.action_plan_instance_id is null then
    raise exception 'Submission ini bukan submission instance.';
  end if;
  select * into ins from public.action_plan_instances where id = s.action_plan_instance_id;

  -- Anti self-approval: terhadap KOLOM INSTANCE (K4).
  if ins.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if ins.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
      values (ins.organization_id, auth.uid(), 'reviewer_override', 'action_plan_instance', ins.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', ins.reviewer_id), 'medium');
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review instance ini.';
    end if;
  end if;

  if s.review_status <> 'pending' or ins.status <> 'submitted' then
    raise exception 'Submission ini sudah direview atau tidak menunggu review.';
  end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  update public.action_plan_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (action_plan_id, submission_id, reviewer_id, decision, reason)
  values (ins.action_plan_id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.action_plan_instances
  set status = case when p_decision = 'approve' then 'done' else 'revision' end,
      reviewed_at = now()
  where id = ins.id;

  perform public.write_activity('action_plan', ins.action_plan_id,
    case when p_decision = 'approve' then 'review_instance_approve' else 'review_instance_reject' end,
    jsonb_build_object('instance_id', ins.id, 'submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  -- Fase 3: kabari PIC instance hasil review.
  perform public.emit_notification(ins.organization_id, ins.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'action_plan_instance', ins.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end, null);
end;
$$;

-- mark_overdue_instances: emit instance_missed ke PIC (governance_warning ke oversight via trigger).
create or replace function public.mark_overdue_instances(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select i.id, i.organization_id, i.action_plan_id, i.pic_id, i.deadline_at,
           rr.missed_rule, rr.grace_period_minutes
    from public.action_plan_instances i
    join public.action_plan_repeat_rules rr on rr.id = i.repeat_rule_id
    where i.status in ('assigned', 'in_progress')
      and i.current_submission_id is null
      and i.submitted_at is null
      and rr.missed_rule <> 'overdue_allowed'
      and p_now > (case when rr.missed_rule = 'grace_period'
                        then i.deadline_at + make_interval(mins => coalesce(rr.grace_period_minutes, 0))
                        else i.deadline_at end)
  loop
    update public.action_plan_instances
      set status = 'missed', missed_reason = 'deadline_passed'
      where id = r.id;

    insert into public.governance_violations
      (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
    values (r.organization_id, r.pic_id, 'instance_missed', 'action_plan_instance', r.id,
            jsonb_build_object('action_plan_id', r.action_plan_id, 'deadline_at', r.deadline_at), 'medium');

    perform public.write_activity_system(r.organization_id, null, 'action_plan_instance', r.id,
      'instance_marked_overdue', jsonb_build_object('action_plan_id', r.action_plan_id));

    -- Fase 3: notif domain ke PIC (oversight di-handle trigger governance_warning).
    perform public.emit_notification(r.organization_id, r.pic_id, null, 'instance_missed',
      'action_plan_instance', r.id, 'Pekerjaan terlewat', null,
      public.org_today(r.organization_id));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================ JOB: notifikasi cron (idempoten via dedupe_date)

-- Reminder deadline mendekat (<= 3 hari) untuk Action Plan one-time aktif + instance aktif,
-- dan repeat due today. Idempoten per hari via dedupe_date = org_today(org).
create or replace function public.emit_deadline_notifications()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
begin
  -- Action Plan one-time: deadline dalam (org_today, org_today+3].
  for r in
    select a.id, a.organization_id, a.pic_id, a.name, a.deadline,
           public.org_today(a.organization_id) as today
    from public.action_plans a
    where a.repeat_setting <> 'repeat'
      and a.status in ('assigned', 'in_progress', 'revision')
      and a.pic_id is not null
      and a.deadline is not null
  loop
    if r.deadline > r.today and r.deadline <= r.today + 3 then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'deadline_reminder',
        'action_plan', r.id, 'Deadline mendekat', r.name, r.today);
      v_count := v_count + 1;
    end if;
  end loop;

  -- Instance: due today → repeat_due; mendekat (<=3 hari) → deadline_reminder.
  for r in
    select i.id, i.organization_id, i.pic_id, i.deadline_at,
           public.org_today(i.organization_id) as today,
           (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date as due_date
    from public.action_plan_instances i
    join public.organizations o on o.id = i.organization_id
    where i.status in ('assigned', 'in_progress') and i.pic_id is not null
  loop
    if r.due_date = r.today then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'repeat_due',
        'action_plan_instance', r.id, 'Tugas rutin hari ini', null, r.today);
      v_count := v_count + 1;
    elsif r.due_date > r.today and r.due_date <= r.today + 3 then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'deadline_reminder',
        'action_plan_instance', r.id, 'Deadline mendekat', null, r.today);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- ============================================================ GRANTS / REVOKES

-- RPC user-context: hanya authenticated.
revoke execute on function public.get_org_today() from public, anon;
grant execute on function public.get_org_today() to authenticated;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
revoke execute on function public.send_chat_message(uuid, text, uuid[]) from public, anon;
revoke execute on function public.mark_chat_messages_read(uuid) from public, anon;
revoke execute on function public.create_comment(text, uuid, text, uuid[]) from public, anon;
revoke execute on function public.get_chat_rooms() from public, anon;

-- Job cron: revoke dari authenticated (hanya internal definer + pg_cron/service_role).
revoke execute on function public.emit_deadline_notifications() from public, anon, authenticated;
-- Catatan: REVOKE execute pada fungsi trigger (tg_*) ada di migrasi terpisah 0009 (mengikuti
-- urutan apply nyata di DB: fase3_collab lalu fase3_harden_trigger_functions).

-- Tabel kolaborasi: cabut SEMUA tulis langsung dari klien (append-only 2-lapis). Hanya RPC menulis.
revoke insert, update, delete on public.notifications from authenticated, anon;
revoke insert, update, delete on public.chat_rooms from authenticated, anon;
revoke insert, update, delete on public.chat_room_members from authenticated, anon;
revoke insert, update, delete on public.chat_messages from authenticated, anon;
revoke insert, update, delete on public.chat_message_reads from authenticated, anon;
revoke insert, update, delete on public.comments from authenticated, anon;
revoke insert, update, delete on public.mentions from authenticated, anon;

-- ============================================================ JOB INFRA (pg_cron)

do $$
begin
  perform cron.unschedule('emit-deadline-notifications');
exception when others then null;
end $$;

-- Tiap pagi 06:00 (waktu server) — idempoten per hari via dedupe_date.
select cron.schedule('emit-deadline-notifications', '0 6 * * *',
  $$select public.emit_deadline_notifications()$$);
