-- AC-FAN-4 contract — push fan-out DECOUPLED dari transaksi emit_notification.
-- Blocker utama spec FR-PN-08b: kegagalan push TIDAK PERNAH me-rollback INSERT notifications
-- maupun RPC governance pemanggil (~16 call-site emit_notification).
--
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0060_push_ac_fan4_isolation.sql
--
-- Invarian:
--   (a) STATIC: TIDAK ada trigger pada public.notifications yang menyentuh push_deliveries,
--       push_tokens, atau HTTP egress (pg_net.net.http_*).
--   (b) RUNTIME: setelah INSERT baris notifications via emit_notification, tabel push_deliveries
--       TETAP kosong untuk notification_id tersebut → proof decoupled (drainer poll terpisah).

-- ============================================================ (a) STATIC — no coupling trigger on notifications
do $$
declare
  v_bad_trigs text := '';
  v_trigger record;
  v_body text;
begin
  for v_trigger in
    select t.tgname, p.proname, pg_get_functiondef(p.oid) as body
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'notifications'
      and c.relnamespace = 'public'::regnamespace
      and not t.tgisinternal
  loop
    v_body := lower(v_trigger.body);
    if v_body ilike '%push_deliveries%'
       or v_body ilike '%push_tokens%'
       or v_body ilike '%net.http_%'
       or v_body ilike '%pg_net%' then
      v_bad_trigs := v_bad_trigs || v_trigger.tgname || '→' || v_trigger.proname || '; ';
    end if;
  end loop;

  if v_bad_trigs <> '' then
    raise exception 'FAIL AC-FAN-4a: trigger public.notifications menyentuh push transport: %', v_bad_trigs;
  end if;
  raise notice 'PASS AC-FAN-4a: zero trigger notifications yang menyentuh push_deliveries/push_tokens/pg_net';
end $$;

-- ============================================================ (b) RUNTIME — emit_notification TIDAK insert push_deliveries
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000010';
  v_recipient uuid := '99999999-2222-0000-0000-aaaa00000011';
  v_notif_id uuid;
  v_delivery_count int;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_actor), (v_recipient) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_actor,     v_org, 'Actor',     true),
    (v_recipient, v_org, 'Recipient', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  -- Register push token utk recipient supaya drainer NANTI (kalau ada trigger) punya target.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recipient::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[ac-fan-4]', 'ios', 'device-ac4');

  -- emit_notification SECURITY DEFINER; actor via param. Emit sebagai postgres (bypass RLS check).
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  -- Emit — INSERT ke notifications terjadi di sini. Return type void → fetch id lewat query.
  perform public.emit_notification(
    v_org, v_recipient, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000001'::uuid,
    'Test AC-FAN-4', 'body', current_date
  );
  select id into v_notif_id
  from public.notifications
  where organization_id = v_org and recipient_id = v_recipient
    and entity_id = '99999999-2222-0000-0000-cccc00000001'::uuid
  order by created_at desc limit 1;

  if v_notif_id is null then
    raise exception 'FAIL AC-FAN-4b: emit_notification tidak insert baris (setup bermasalah)';
  end if;

  -- INVARIAN: TIDAK ada baris push_deliveries untuk notif ini — drainer belum jalan.
  select count(*) into v_delivery_count
  from public.push_deliveries where notification_id = v_notif_id;
  if v_delivery_count <> 0 then
    raise exception 'FAIL AC-FAN-4b: push_deliveries terisi % baris — trigger menyuntik push dalam transaksi emit', v_delivery_count;
  end if;

  raise notice 'PASS AC-FAN-4b: emit_notification INSERT notifications TANPA menyentuh push_deliveries (decoupled)';
end $$;
rollback;
