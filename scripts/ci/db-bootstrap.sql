-- =============================================================================
-- db-bootstrap.sql — platform schema the CI Postgres container does NOT ship
-- =============================================================================
-- WHY THIS FILE EXISTS
--   The db-contract job runs a bare `supabase/postgres` container instead of a
--   full `supabase start` stack (see .github/workflows/ci.yml for the reason).
--   That image ships the roles, `auth.uid()`, and the extensions — but the parts
--   our migrations lean on are created at RUNTIME by services that the container
--   does not include:
--     • storage-api creates `storage.buckets` / `storage.objects`; the image has
--       an empty `storage` schema. Migrations 0005/0019/0046/0061/0070 insert
--       buckets and define RLS on `storage.objects`, so replay aborts at 0005
--       with `relation "storage.buckets" does not exist`.
--     • GoTrue migrates `auth.users`; the image ships the 2017 skeleton, missing
--       `email_confirmed_at`, `phone`, `is_anonymous`, … so `_fixtures.sql`
--       aborts on its first user INSERT.
--
-- SCOPE — deliberately partial
--   Only what the migrations and contracts actually reference: `auth.users`
--   (`auth.uid()` already exists; `auth.jwt()` is never used), `storage.buckets`,
--   `storage.objects`, `foldername()`, `filename()`, and `protect_delete()` —
--   the last one because 0019/0046 bypass it via the `storage.allow_delete_query`
--   GUC, and a bypass of a trigger that does not exist proves nothing. GoTrue's
--   sessions/identities/mfa tables and storage's multipart/iceberg/search surface
--   are NOT reproduced.
--
-- MAINTENANCE
--   Copied verbatim from the live dev stack (`pg_dump --schema-only -n auth
--   -t auth.users`, same for storage, plus `pg_get_functiondef`) at
--   gotrue v2.192.0 / storage-api v1.62.5 / postgres 17.6.1.143. If a migration
--   starts using a platform object not defined here, replay fails loudly in CI —
--   extend this file from the same source rather than guessing at the shape.
--
--   Must be applied as `supabase_admin`: `postgres` is not a superuser in this
--   image and owns neither the `auth` nor the `storage` schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Default privileges — the bare image leaves the permissive
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL` from its
-- init scripts in place, so every function a migration creates silently gains
-- EXECUTE for anon/authenticated. The CLI-managed stack (what CI compared against)
-- has these revoked, which is what lets 0078_…_rpc_acl_contract assert that
-- definer-only helpers are NOT callable by `authenticated`.
--
-- Mirrors the live stack's pg_default_acl for role postgres in schema public:
-- tables keep only Dxtm, sequences only w, functions nothing.
-- MUST run before the migrations — default ACLs apply at CREATE time.
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- auth.uid() / role() / email() — the image ships the 2017 definitions, which read
-- ONLY the flat `request.jwt.claim.sub` GUC. Every contract test impersonates a
-- user by setting the JSON `request.jwt.claims` GUC instead, so under the stale
-- definition auth.uid() is NULL for all of them and ~20 contracts fail with
-- "Anda tidak berwenang …". GoTrue replaces these with a coalesce over both forms.
-- -----------------------------------------------------------------------------
create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

create or replace function auth.role()
returns text
language sql
stable
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;

create or replace function auth.email()
returns text
language sql
stable
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$function$;

-- -----------------------------------------------------------------------------
-- auth.users — replace the image's pre-GoTrue skeleton with the migrated shape.
-- -----------------------------------------------------------------------------
drop table if exists auth.users cascade;

create table auth.users (
  instance_id uuid,
  id uuid not null primary key,
  aud character varying(255),
  role character varying(255),
  email character varying(255),
  encrypted_password character varying(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token character varying(255),
  confirmation_sent_at timestamptz,
  recovery_token character varying(255),
  recovery_sent_at timestamptz,
  email_change_token_new character varying(255),
  email_change character varying(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text default null::character varying unique,
  phone_confirmed_at timestamptz,
  phone_change text default ''::character varying,
  phone_change_token character varying(255) default ''::character varying,
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current character varying(255) default ''::character varying,
  email_change_confirm_status smallint default 0,
  banned_until timestamptz,
  reauthentication_token character varying(255) default ''::character varying,
  reauthentication_sent_at timestamptz,
  is_sso_user boolean default false not null,
  deleted_at timestamptz,
  is_anonymous boolean default false not null,
  constraint users_email_change_confirm_status_check
    check (email_change_confirm_status >= 0 and email_change_confirm_status <= 2)
);

create unique index users_email_partial_key on auth.users using btree (email) where (is_sso_user = false);
create index users_instance_id_email_idx on auth.users using btree (instance_id, lower((email)::text));
create index users_instance_id_idx on auth.users using btree (instance_id);
create index users_is_anonymous_idx on auth.users using btree (is_anonymous);

alter table auth.users enable row level security;
alter table auth.users owner to supabase_auth_admin;

grant all on table auth.users to dashboard_user;
grant insert, references, delete, trigger, truncate, update on table auth.users to postgres;
grant select on table auth.users to postgres with grant option;

-- -----------------------------------------------------------------------------
-- storage — tables, helpers and triggers normally created by storage-api.
-- -----------------------------------------------------------------------------

-- The image already ships an (empty) `storage` schema owned by supabase_admin;
-- `postgres` may not re-own it, so only ensure existence.
create schema if not exists storage;

-- `buckettype` exists in the real schema; the column is unused by our policies but
-- kept so INSERTs written against the real schema stay valid.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'storage' and t.typname = 'buckettype') then
    create type storage.buckettype as enum ('STANDARD', 'ANALYTICS', 'VECTOR');
  end if;
end
$$;

create table if not exists storage.buckets (
  id text not null primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text,
  type storage.buckettype default 'STANDARD'::storage.buckettype not null
);
create unique index if not exists bname on storage.buckets using btree (name);

create table if not exists storage.objects (
  id uuid default gen_random_uuid() not null primary key,
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/'::text)) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);
create unique index if not exists bucketid_objname on storage.objects using btree (bucket_id, name);
create index if not exists idx_objects_bucket_id_name on storage.objects using btree (bucket_id, name collate "C");
create index if not exists name_prefix_search on storage.objects using btree (name text_pattern_ops);

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $function$
declare
    _parts text[];
begin
    select string_to_array(name, '/') into _parts;
    return _parts[1 : array_length(_parts, 1) - 1];
end
$function$;

create or replace function storage.filename(name text)
returns text
language plpgsql
as $function$
declare
_parts text[];
begin
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
end
$function$;

create or replace function storage.update_updated_at_column()
returns trigger
language plpgsql
as $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

create or replace function storage.enforce_bucket_name_length()
returns trigger
language plpgsql
as $function$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$function$;

create or replace function storage.protect_delete()
returns trigger
language plpgsql
as $function$
begin
    if coalesce(current_setting('storage.allow_delete_query', true), 'false') != 'true' then
        raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            using hint = 'This prevents accidental data loss from orphaned objects.',
                  errcode = '42501';
    end if;
    return null;
end;
$function$;

drop trigger if exists enforce_bucket_name_length_trigger on storage.buckets;
create trigger enforce_bucket_name_length_trigger
  before insert or update of name on storage.buckets
  for each row execute function storage.enforce_bucket_name_length();

drop trigger if exists protect_buckets_delete on storage.buckets;
create trigger protect_buckets_delete
  before delete on storage.buckets
  for each statement execute function storage.protect_delete();

drop trigger if exists protect_objects_delete on storage.objects;
create trigger protect_objects_delete
  before delete on storage.objects
  for each statement execute function storage.protect_delete();

drop trigger if exists update_objects_updated_at on storage.objects;
create trigger update_objects_updated_at
  before update on storage.objects
  for each row execute function storage.update_updated_at_column();

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;

grant all on table storage.buckets to postgres with grant option;
grant all on table storage.objects to postgres with grant option;
grant all on table storage.buckets to service_role, authenticated, anon;
grant all on table storage.objects to service_role, authenticated, anon;
grant usage on schema storage to postgres, service_role, authenticated, anon;
