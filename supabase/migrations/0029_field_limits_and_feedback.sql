-- ---------------------------------------------------------------------
-- 0029: プロフィールの文字数制限をDBにも入れる／運営への要望を受け取る
--
-- ■ 文字数制限
-- 本名と医籍登録番号は、入力欄（maxLength）とサーバーアクションでは
-- 上限を見ていたが、DBには制約が無かった。
-- 公開キーを使えば画面を通さずに直接 update できるため、
-- アプリ側だけの制限は実質的に効かない。DBにも同じ値を入れる。
--   本名           50文字以内
--   医籍登録番号   半角数字20桁以内（未入力可）
-- 値は src/lib/limits.ts の REAL_NAME_MAX / LICENSE_NUMBER_MAX と揃える。
--
-- ■ 運営への要望
-- ハンバーガーメニューから送れる要望の置き場所。
--   ・書けるのはログイン済みの本人だけ
--   ・読めるのは管理者だけ（他人の要望は見えない）
--   ・本人は自分が送ったものだけ読める（送信済みの確認用）
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 文字数制限
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_real_name_len;
alter table public.profiles add constraint profiles_real_name_len
  check (char_length(real_name) <= 50);

alter table public.profiles drop constraint if exists profiles_license_number_format;
alter table public.profiles add constraint profiles_license_number_format
  check (license_number = '' or license_number ~ '^[0-9]{1,20}$');

-- ---------------------------------------------------------------------
-- 運営への要望
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx
  on public.feedback (created_at desc);
create index if not exists feedback_user_idx
  on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

-- 書けるのは本人だけ
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check (user_id = auth.uid());

-- 読めるのは本人（自分の送信分）と管理者だけ
drop policy if exists feedback_select_own_or_admin on public.feedback;
create policy feedback_select_own_or_admin on public.feedback
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 対応済みにできるのは管理者だけ
drop policy if exists feedback_update_admin on public.feedback;
create policy feedback_update_admin on public.feedback
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists feedback_delete_admin on public.feedback;
create policy feedback_delete_admin on public.feedback
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 管理画面用の一覧（投稿者のユーザーネームを添える）
-- 本名などの非公開項目は返さない
-- ---------------------------------------------------------------------
create or replace function public.get_feedback(p_limit integer default 100)
returns table (
  id uuid,
  body text,
  status text,
  created_at timestamptz,
  author_username text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.body, f.status, f.created_at,
    coalesce(pp.username, 'unknown') as author_username
  from public.feedback f
  left join public.public_profiles pp on pp.id = f.user_id
  where public.is_admin()
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

grant execute on function public.get_feedback(integer) to authenticated;
