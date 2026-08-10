-- =====================================================================
-- 医師向け2択診療判断サービス — 初期スキーマ
-- Supabase の SQL Editor にこのファイルを貼り付けて実行してください。
-- 要件定義 §39〜§49 に対応します。
-- =====================================================================

-- gen_random_uuid() はPostgreSQL 13以降の標準機能のため拡張は不要。
-- 古い環境向けに試みるが、権限が無くても止まらないようにする。
do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  null;
end
$$;

-- ---------------------------------------------------------------------
-- マスタ
-- ---------------------------------------------------------------------
create table if not exists public.specialties (
  id integer primary key,
  name text not null,
  display_order integer not null,
  active boolean not null default true
);

create table if not exists public.categories (
  id integer primary key,
  name text not null,
  display_order integer not null,
  active boolean not null default true
);

-- 普通度の最低回答数など、将来変更しうる設定値（§28）
create table if not exists public.app_settings (
  id integer primary key default 1,
  min_other_votes integer not null default 20,
  constraint app_settings_single_row check (id = 1)
);
insert into public.app_settings (id, min_other_votes)
values (1, 20) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- プロフィール（§39）
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  specialty_id integer not null references public.specialties(id),
  work_prefecture text not null,           -- 非公開（§5.3）
  is_physician boolean not null default true,
  is_admin boolean not null default false,
  is_suspended boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

-- ---------------------------------------------------------------------
-- 質問・投票・コメント・通報（§42〜§44）
-- ---------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  question_text text not null check (char_length(question_text) between 10 and 300),
  option_a text not null check (char_length(option_a) between 1 and 30),
  option_b text not null check (char_length(option_b) between 1 and 30),
  category_id integer not null references public.categories(id),
  status text not null default 'active' check (status in ('active', 'hidden', 'deleted')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists questions_status_created_idx
  on public.questions (status, created_at desc);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice text not null check (choice in ('A', 'B')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)            -- 1ユーザー1質問1回答（§12）
);
create index if not exists votes_question_idx on public.votes (question_id);
create index if not exists votes_user_idx on public.votes (user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_question_idx on public.comments (question_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 補助関数（SECURITY DEFINER：RLSの再帰を避けるため）
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.has_voted(p_question_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.votes v
    where v.question_id = p_question_id and v.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 公開プロフィール（work_prefecture を含まない）§49
-- ---------------------------------------------------------------------
-- create or replace view は列の削除・並べ替えができない。
-- あとの migration（0010）で列が増えるため、既存DBに流し直すと
-- 「cannot drop columns from view」で失敗する。
-- 何度流しても通るよう、毎回作り直す。
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
  select id, username, specialty_id, is_physician, is_admin, created_at
  from public.profiles
  where is_suspended = false;

-- ---------------------------------------------------------------------
-- Row Level Security（§49）
-- ---------------------------------------------------------------------
alter table public.specialties  enable row level security;
alter table public.categories   enable row level security;
alter table public.app_settings enable row level security;
alter table public.profiles     enable row level security;
alter table public.questions    enable row level security;
alter table public.votes        enable row level security;
alter table public.comments     enable row level security;
alter table public.reports      enable row level security;

-- マスタは全員参照可
drop policy if exists specialties_read on public.specialties;
create policy specialties_read on public.specialties for select using (true);

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (true);

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles：本人の行のみ直接参照可（他人は public_profiles ビュー経由）
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid() and is_admin = false);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- questions：公開中のもの、または自分の投稿、または管理者
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (status = 'active' or author_id = auth.uid() or public.is_admin());

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions
  for insert to authenticated with check (author_id = auth.uid() and is_demo = false);

drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists questions_delete_admin on public.questions;
create policy questions_delete_admin on public.questions
  for delete to authenticated using (public.is_admin());

-- votes：本人の回答のみ参照可（回答前に分布を見せないための要）§13
--        分布は get_question_result() 経由でのみ取得できる
drop policy if exists votes_select_own on public.votes;
create policy votes_select_own on public.votes
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists votes_insert_own on public.votes;
create policy votes_insert_own on public.votes
  for insert to authenticated with check (user_id = auth.uid() and is_demo = false);

-- UPDATE / DELETE のポリシーは作らない ＝ 変更・削除は不可（§12/§14）
drop policy if exists votes_delete_admin on public.votes;
create policy votes_delete_admin on public.votes
  for delete to authenticated using (public.is_admin());

-- comments：回答済みの質問のコメントのみ読める（回答前に読ませない）
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using ((status = 'visible' and public.has_voted(question_id)) or public.is_admin());

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (user_id = auth.uid() and public.has_voted(question_id) and is_demo = false);

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists comments_delete_admin on public.comments;
create policy comments_delete_admin on public.comments
  for delete to authenticated using (public.is_admin());

-- reports：投稿は本人のみ、閲覧は管理者のみ
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin on public.reports
  for select to authenticated using (public.is_admin() or reporter_id = auth.uid());

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists reports_delete_admin on public.reports;
create policy reports_delete_admin on public.reports
  for delete to authenticated using (public.is_admin());

grant select on public.public_profiles to authenticated, anon;

-- ---------------------------------------------------------------------
-- 質問の結果取得（§15/§19/§23/§24/§28）
-- 回答済みの場合のみ結果を返す ＝ 回答前は分布を取得できない（§13）
-- ---------------------------------------------------------------------
create or replace function public.get_question_result(p_question_id uuid)
returns table (
  vote_count integer,
  a_count integer,
  b_count integer,
  a_ratio numeric,
  b_ratio numeric,
  majority_choice text,
  my_choice text,
  other_count integer,
  other_a_count integer,
  other_b_count integer,
  agreement_rate numeric,
  other_majority_choice text,
  eligible boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_my_choice text;
  v_min integer;
  v_a integer; v_b integer; v_total integer;
  v_oa integer; v_ob integer; v_on integer;
begin
  select v.choice into v_my_choice
  from public.votes v
  where v.question_id = p_question_id and v.user_id = v_uid;

  -- 未回答なら何も返さない（回答前に結果を見せない）
  if v_my_choice is null then
    return;
  end if;

  select s.min_other_votes into v_min from public.app_settings s where s.id = 1;

  select
    count(*) filter (where v.choice = 'A'),
    count(*) filter (where v.choice = 'B'),
    count(*)
  into v_a, v_b, v_total
  from public.votes v where v.question_id = p_question_id;

  select
    count(*) filter (where v.choice = 'A'),
    count(*) filter (where v.choice = 'B'),
    count(*)
  into v_oa, v_ob, v_on
  from public.votes v
  where v.question_id = p_question_id and v.user_id <> v_uid;

  return query select
    v_total,
    v_a,
    v_b,
    case when v_total = 0 then 0 else round(100.0 * v_a / v_total, 4) end,
    case when v_total = 0 then 0 else round(100.0 * v_b / v_total, 4) end,
    case when v_a = v_b then null when v_a > v_b then 'A' else 'B' end,
    v_my_choice,
    v_on,
    v_oa,
    v_ob,
    case
      when v_on = 0 then null
      else round(100.0 * (case when v_my_choice = 'A' then v_oa else v_ob end) / v_on, 4)
    end,
    case when v_oa = v_ob then null when v_oa > v_ob then 'A' else 'B' end,
    (v_on >= v_min);
end;
$$;

-- ---------------------------------------------------------------------
-- ユーザー指標（§46〜§48）
--   普通度       … 本人を除いた回答者のうち、自分と同じ選択の割合の平均
--   多数派一致率 … 多数派が存在する対象質問のうち、多数派と一致した割合
--   いずれも本人以外の回答数が min_other_votes 以上の質問のみが対象
-- ---------------------------------------------------------------------
create or replace function public.get_user_ordinariness(p_user_id uuid)
returns table (
  ordinariness numeric,
  majority_agreement_rate numeric,
  eligible_question_count integer,
  answered_question_count integer,
  posted_question_count integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_min integer;
begin
  select s.min_other_votes into v_min from public.app_settings s where s.id = 1;

  return query
  with my_votes as (
    select v.question_id, v.choice
    from public.votes v
    join public.questions q on q.id = v.question_id and q.status = 'active'
    where v.user_id = p_user_id
  ),
  agg as (
    select
      m.question_id,
      m.choice,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from my_votes m
    left join public.votes o
      on o.question_id = m.question_id and o.user_id <> p_user_id
    group by m.question_id, m.choice
  ),
  eligible as (
    select
      a.*,
      100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count as rate,
      case when a.a_count = a.b_count then null
           when a.a_count > a.b_count then 'A' else 'B' end as majority
    from agg a
    where a.other_count >= v_min
  )
  select
    (select round(avg(e.rate), 4) from eligible e),
    (select case
       when count(*) filter (where e.majority is not null) = 0 then null
       else round(
         100.0 * count(*) filter (where e.majority = e.choice)
         / count(*) filter (where e.majority is not null), 4)
     end from eligible e),
    (select count(*)::integer from eligible),
    (select count(*)::integer from my_votes),
    (select count(*)::integer from public.questions q
      where q.author_id = p_user_id and q.status <> 'deleted');
end;
$$;

-- ---------------------------------------------------------------------
-- コメント取得
-- 回答済みの場合のみ返す。投稿者がA/Bどちらを選んだかも併せて返すため、
-- 他人の votes を直接読ませずに済むよう SECURITY DEFINER にしている。
-- ---------------------------------------------------------------------
-- あとの migration（0009）で parent_id・いいね数が増え、戻り値の形が変わる。
-- create or replace function は戻り値の型を変えられないため、
-- 既存DBに流し直せるよう毎回作り直す。
drop function if exists public.get_question_comments(uuid);
create or replace function public.get_question_comments(p_question_id uuid)
returns table (
  id uuid,
  question_id uuid,
  user_id uuid,
  body text,
  status text,
  created_at timestamptz,
  author_username text,
  author_specialty_id integer,
  author_choice text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_voted(p_question_id) and not public.is_admin() then
    return;
  end if;

  return query
  select
    c.id, c.question_id, c.user_id, c.body, c.status, c.created_at,
    p.username, p.specialty_id, v.choice
  from public.comments c
  join public.profiles p on p.id = c.user_id
  left join public.votes v
    on v.question_id = c.question_id and v.user_id = c.user_id
  where c.question_id = p_question_id and c.status = 'visible'
  order by c.created_at asc;
end;
$$;

grant execute on function public.get_question_comments(uuid) to authenticated;
grant execute on function public.get_question_result(uuid) to authenticated;
grant execute on function public.get_user_ordinariness(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_voted(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- マスタデータ投入（§40/§41）
-- ---------------------------------------------------------------------
insert into public.specialties (id, name, display_order) values
  (1,'循環器内科',1),(2,'消化器内科',2),(3,'呼吸器内科',3),(4,'腎臓内科',4),
  (5,'内分泌・糖尿病内科',5),(6,'血液内科',6),(7,'神経内科',7),(8,'総合内科',8),
  (9,'救急科',9),(10,'外科',10),(11,'心臓血管外科',11),(12,'呼吸器外科',12),
  (13,'脳神経外科',13),(14,'整形外科',14),(15,'小児科',15),(16,'産婦人科',16),
  (17,'精神科',17),(18,'麻酔科',18),(19,'放射線科',19),(20,'皮膚科',20),
  (21,'泌尿器科',21),(22,'耳鼻咽喉科',22),(23,'眼科',23),(24,'病理',24),(25,'その他',25)
on conflict (id) do update set name = excluded.name, display_order = excluded.display_order;

insert into public.categories (id, name, display_order) values
  (1,'循環器',1),(2,'消化器',2),(3,'呼吸器',3),(4,'腎臓',4),(5,'内分泌',5),
  (6,'神経',6),(7,'感染症',7),(8,'救急',8),(9,'総合診療',9),(10,'外科',10),(11,'その他',11)
on conflict (id) do update set name = excluded.name, display_order = excluded.display_order;
