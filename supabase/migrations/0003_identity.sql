-- =====================================================================
-- 本人確認情報の追加とユーザーネームの固定
--   ・本名（real_name）と医籍登録番号（license_number）を追加（いずれも非公開）
--   ・ユーザーネームは一度決めたら変更できないようにする
-- 0001 / 0002 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 本名・医籍登録番号（本人と管理者のみ参照可。公開ビューには含めない）
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists real_name text not null default '',
  add column if not exists license_number text not null default '';

comment on column public.profiles.real_name is
  '本名。非公開。public_profiles ビューには含めない。';
comment on column public.profiles.license_number is
  '医籍登録番号。自己申告であり本サービスでは照合しない。非公開。';

-- 公開ビューに本名・医籍番号が入らないことを明示的に作り直す
create or replace view public.public_profiles
with (security_invoker = false) as
  select id, username, specialty_id, is_physician, is_admin, created_at
  from public.profiles
  where is_suspended = false;

grant select on public.public_profiles to authenticated, anon;

-- ---------------------------------------------------------------------
-- ユーザーネームは変更不可（要件：一度選んだら変えられない）
-- ---------------------------------------------------------------------
create or replace function public.prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.username is distinct from old.username then
    raise exception 'ユーザーネームは変更できません'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_username on public.profiles;
create trigger profiles_lock_username
  before update on public.profiles
  for each row
  execute function public.prevent_username_change();

-- ---------------------------------------------------------------------
-- 既存のデモデータに仮の値を入れておく（実ユーザーは画面から入力してもらう）
-- ---------------------------------------------------------------------
update public.profiles
set real_name = 'デモ ' || username,
    license_number = lpad((abs(hashtext(username)) % 900000 + 100000)::text, 6, '0')
where is_demo and (real_name = '' or license_number = '');
