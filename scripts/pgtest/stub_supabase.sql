-- ---------------------------------------------------------------------
-- ローカルのPostgreSQLで setup_all.sql を動かすための最小限の土台。
--
-- Supabaseが最初から用意しているもの（auth スキーマ・ロール・storage）を
-- 同じ名前・同じ挙動で作る。ここにアプリ固有の定義は書かない。
--
-- auth.uid() は「いまログインしている人」を返す関数。
-- テストでは set_auth(<uuid>) で切り替える。
-- ---------------------------------------------------------------------

create extension if not exists pgcrypto;

-- Supabaseの組み込みロール
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- auth スキーマ
-- ---------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

/**
 * ログイン中のユーザーID。
 * Supabaseと同じく、リクエストごとの設定値（JWTのsub）から読む。
 * 未設定なら null（＝未ログイン、service_role からの実行に相当）。
 */
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- storage スキーマ（画像バケットのポリシーを流すために必要な分だけ）
-- ---------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;

/** 'userid/file.png' を {userid, file.png} に分解する（Supabaseと同じ挙動） */
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- テスト用の補助
-- ---------------------------------------------------------------------

/** 以降の文を「このユーザーとしてログイン中」として実行する */
create or replace function public.set_auth(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
