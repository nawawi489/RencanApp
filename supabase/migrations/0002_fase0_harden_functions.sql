-- Fase 0: pengetatan keamanan fungsi (hasil security advisors).

-- set_updated_at: kunci search_path.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- handle_new_user: trigger function, tidak untuk dipanggil via RPC.
revoke execute on function public.handle_new_user() from public;

-- current_user_org: helper RLS — hanya authenticated yang perlu (anon tidak menyentuh policy).
revoke execute on function public.current_user_org() from public;
grant execute on function public.current_user_org() to authenticated;
