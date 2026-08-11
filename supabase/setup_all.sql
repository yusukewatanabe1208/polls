-- =====================================================================
-- 診療スタイル診断：Supabase セットアップ用SQL（全部入り）
--
-- ★このファイルは自動生成です。直接編集しないでください。
--   supabase/migrations/*.sql を直したあと `npm run sql:build` で作り直します。
--
-- 使い方: Supabase ダッシュボード → SQL Editor に丸ごと貼り付けて実行。
--         何度実行しても安全です（既存のデータは消えません）。
-- =====================================================================


-- =====================================================================
-- 0001_init.sql
-- =====================================================================
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

-- =====================================================================
-- 0002_favorites_and_ranking.sql
-- =====================================================================
-- =====================================================================
-- 追加機能：お気に入り / 画像添付 / 成績表（偏差値・ランク）
-- 0001_init.sql の後に実行してください。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 質問への画像添付（1枚まで）
-- ---------------------------------------------------------------------
alter table public.questions
  add column if not exists image_url text;

-- ---------------------------------------------------------------------
-- お気に入り
-- ---------------------------------------------------------------------
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);
create index if not exists favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites
  for select to authenticated using (user_id = auth.uid());

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 索引（1問ずつ回答する流れを速くする）
-- ---------------------------------------------------------------------
-- 直近の回答の取得
create index if not exists votes_user_created_idx
  on public.votes (user_id, created_at desc);
-- 質問ごとの集計（普通度・結果表示）
create index if not exists votes_question_choice_idx
  on public.votes (question_id, choice);
-- 表示対象コメントの取得
create index if not exists comments_question_status_idx
  on public.comments (question_id, status);
-- フィード（未回答の新しい質問）
create index if not exists questions_active_created_idx
  on public.questions (created_at desc) where status = 'active';
create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 直近の回答（成績表で使用）
-- ---------------------------------------------------------------------
create or replace function public.get_recent_answers(
  p_user_id uuid,
  p_limit integer default 5
)
returns table (
  question_id uuid,
  question_text text,
  option_a text,
  option_b text,
  my_choice text,
  agreement_rate numeric,
  majority_matched boolean,
  eligible boolean,
  answered_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_min integer;
begin
  -- 自分の成績のみ参照できる
  if auth.uid() <> p_user_id and not public.is_admin() then
    return;
  end if;

  select s.min_other_votes into v_min from public.app_settings s where s.id = 1;

  return query
  with my as (
    select v.question_id, v.choice, v.created_at
    from public.votes v
    where v.user_id = p_user_id
    order by v.created_at desc
    limit p_limit
  ),
  agg as (
    select
      m.question_id, m.choice, m.created_at,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from my m
    left join public.votes o
      on o.question_id = m.question_id and o.user_id <> p_user_id
    group by m.question_id, m.choice, m.created_at
  )
  select
    a.question_id,
    q.question_text,
    q.option_a,
    q.option_b,
    a.choice,
    case when a.other_count = 0 then null
      else round(100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count, 4)
    end,
    case when a.a_count = a.b_count then null
      else (case when a.a_count > a.b_count then 'A' else 'B' end) = a.choice
    end,
    (a.other_count >= v_min),
    a.created_at
  from agg a
  join public.questions q on q.id = a.question_id
  order by a.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- 普通度の偏差値と順位（成績表）
--   deviation      … 全体平均50・標準偏差10に正規化した偏差値
--   percentile     … 自分より普通度が高い人の割合（小さいほど普通）
--   compared_users … 比較対象となったユーザー数
-- ---------------------------------------------------------------------
-- PostgRESTはSTABLE関数を読み取り専用トランザクションで実行するため、
-- 一時テーブルは使わずCTEだけで完結させる。
create or replace function public.get_ordinariness_ranking(p_user_id uuid)
returns table (
  ordinariness numeric,
  deviation numeric,
  percentile numeric,
  compared_users integer
)
language sql stable security definer set search_path = public as $$
  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  all_votes as (
    select v.user_id, v.question_id, v.choice
    from public.votes v
    join public.questions q on q.id = v.question_id and q.status = 'active'
  ),
  agg as (
    select
      m.user_id, m.question_id, m.choice,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from all_votes m
    left join public.votes o
      on o.question_id = m.question_id and o.user_id <> m.user_id
    group by m.user_id, m.question_id, m.choice
  ),
  ord as (
    select
      a.user_id,
      avg(100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count) as value
    from agg a
    cross join settings s
    where a.other_count >= s.min_other_votes
    group by a.user_id
  ),
  stats as (
    select
      count(*)::integer as n,
      avg(o.value) as mean,
      coalesce(stddev_pop(o.value), 0) as sd
    from ord o
  ),
  mine as (
    select o.value from ord o where o.user_id = p_user_id
  )
  select
    round((select m.value from mine m), 4) as ordinariness,
    case
      when (select m.value from mine m) is null then null
      when (select s.sd from stats s) = 0 then 50::numeric
      else round(
        50 + 10 * ((select m.value from mine m) - (select s.mean from stats s))
        / (select s.sd from stats s), 4)
    end as deviation,
    case
      when (select m.value from mine m) is null then null
      else round(
        100.0 * (select count(*) from ord o where o.value > (select m.value from mine m))
        / (select s.n from stats s), 4)
    end as percentile,
    (select s.n from stats s) as compared_users;
$$;

grant execute on function public.get_recent_answers(uuid, integer) to authenticated;
grant execute on function public.get_ordinariness_ranking(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 画像用ストレージ（1枚10MBまで）
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images', 'question-images', true, 10485760,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists question_images_read on storage.objects;
create policy question_images_read on storage.objects
  for select using (bucket_id = 'question-images');

drop policy if exists question_images_insert on storage.objects;
create policy question_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists question_images_delete on storage.objects;
create policy question_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- 0003_identity.sql
-- =====================================================================
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

-- =====================================================================
-- 0004_fixed_choices.sql
-- =====================================================================
-- =====================================================================
-- 選択肢を「はい／いいえ」に固定する
--   投稿者は質問文だけを考えればよくなる。
--   0001〜0003 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.questions
  alter column option_a set default 'はい',
  alter column option_b set default 'いいえ';

-- 既存の質問（デモを含む）も「はい／いいえ」に統一する
update public.questions
set option_a = 'はい',
    option_b = 'いいえ'
where option_a <> 'はい' or option_b <> 'いいえ';

-- =====================================================================
-- 0005_question_level.sql
-- =====================================================================
-- =====================================================================
-- 質問の対象レベル（研修医／非専門医／専門医）を追加する
--   resident       … 研修医レベル
--   non_specialist … 非専門医レベル
--   specialist     … 専門医レベル
-- 0001〜0004 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.questions
  add column if not exists level text not null default 'non_specialist';

-- 値の制約（既にある場合は付け直す）
alter table public.questions
  drop constraint if exists questions_level_check;
alter table public.questions
  add constraint questions_level_check
  check (level in ('resident', 'non_specialist', 'specialist'));

comment on column public.questions.level is
  '想定する対象レベル： resident=研修医 / non_specialist=非専門医 / specialist=専門医';

create index if not exists questions_level_idx on public.questions (level);

-- デモの質問にレベルを割り振る（内容に応じておおまかに設定）
update public.questions set level = 'resident'
where is_demo and level = 'non_specialist'
  and (question_text like '%肺炎%' or question_text like '%虫垂炎%' or question_text like '%細菌尿%');

update public.questions set level = 'specialist'
where is_demo and level = 'non_specialist'
  and (question_text like '%大動脈弁狭窄%' or question_text like '%敗血症性ショック%' or question_text like '%SGLT2%');

-- =====================================================================
-- 0006_quiz_filter.sql
-- =====================================================================
-- =====================================================================
-- 出題の絞り込み設定（診療科・レベル・シャッフル）
--   filter_category_id … 出題する診療科。null なら すべて
--   filter_level       … 出題するレベル。null なら すべて
--   shuffle_questions  … 出題順をシャッフルするか
-- 0001〜0005 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists filter_category_id integer references public.categories(id),
  add column if not exists filter_level text,
  add column if not exists shuffle_questions boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_filter_level_check;
alter table public.profiles
  add constraint profiles_filter_level_check
  check (filter_level is null or filter_level in ('resident', 'non_specialist', 'specialist'));

comment on column public.profiles.filter_category_id is '出題する診療科。null はすべて';
comment on column public.profiles.filter_level is '出題するレベル。null はすべて';
comment on column public.profiles.shuffle_questions is '出題順をシャッフルするか';

-- =====================================================================
-- 0007_prune_demo_votes.sql
-- =====================================================================
-- =====================================================================
-- デモ質問に実ユーザーの回答が4人以上集まったら、
-- その質問のデモ医師の回答を削除する。
--   → 実際の医師の分布に置き換わっていく。
-- 0001〜0006 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.prune_demo_votes()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_real_votes integer;
begin
  -- デモの回答が入ったときは何もしない
  if new.is_demo then
    return null;
  end if;

  select count(*) into v_real_votes
  from public.votes
  where question_id = new.question_id and not is_demo;

  if v_real_votes >= 4 then
    delete from public.votes
    where question_id = new.question_id and is_demo;

    delete from public.comments
    where question_id = new.question_id and is_demo;
  end if;

  return null;
end;
$$;

drop trigger if exists votes_prune_demo on public.votes;
create trigger votes_prune_demo
  after insert on public.votes
  for each row
  execute function public.prune_demo_votes();

-- すでに4人以上の実回答が集まっている質問があれば、いま整理しておく
delete from public.votes v
where v.is_demo
  and (
    select count(*) from public.votes r
    where r.question_id = v.question_id and not r.is_demo
  ) >= 4;

delete from public.comments c
where c.is_demo
  and (
    select count(*) from public.votes r
    where r.question_id = c.question_id and not r.is_demo
  ) >= 4;

-- =====================================================================
-- 0008_removal_requests.sql
-- =====================================================================
-- =====================================================================
-- 削除推奨
--   ・管理者が押した場合は即削除
--   ・一般ユーザーは3人以上が押した時点で削除
-- 0001〜0007 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create table if not exists public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);
create index if not exists removal_requests_question_idx
  on public.removal_requests (question_id);

alter table public.removal_requests enable row level security;

drop policy if exists removal_requests_insert on public.removal_requests;
create policy removal_requests_insert on public.removal_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists removal_requests_select on public.removal_requests;
create policy removal_requests_select on public.removal_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists removal_requests_delete_admin on public.removal_requests;
create policy removal_requests_delete_admin on public.removal_requests
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 判定：管理者なら即削除、そうでなければ3人以上で削除
-- ---------------------------------------------------------------------
create or replace function public.apply_removal_request()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_is_admin boolean;
  v_count integer;
begin
  select coalesce(p.is_admin, false) into v_is_admin
  from public.profiles p where p.id = new.user_id;

  select count(*) into v_count
  from public.removal_requests
  where question_id = new.question_id;

  if v_is_admin or v_count >= 3 then
    update public.questions
    set status = 'deleted'
    where id = new.question_id and status <> 'deleted';
  end if;

  return null;
end;
$$;

drop trigger if exists removal_requests_apply on public.removal_requests;
create trigger removal_requests_apply
  after insert on public.removal_requests
  for each row
  execute function public.apply_removal_request();

-- =====================================================================
-- 0009_comment_likes.sql
-- =====================================================================
-- =====================================================================
-- コメントの「いいね」と「返信」
--   ・いいねは1コメント1ユーザー1回（もう一度押すと取り消し）
--   ・コメントに対するコメント（返信）を1階層まで
--   ・プロフィールで、もらったいいね数と自分のコメントを参照できる
-- 0001〜0008 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 返信（親コメント）
-- ---------------------------------------------------------------------
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx on public.comments (parent_id);

comment on column public.comments.parent_id is
  '返信先のコメント。null なら質問への直接のコメント';

-- ---------------------------------------------------------------------
-- いいね
-- ---------------------------------------------------------------------
create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
create index if not exists comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

-- 回答済みの質問のコメントにだけ、いいねを付けたり数を見たりできる
drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes
  for select to authenticated
  using (
    exists (
      select 1 from public.comments c
      where c.id = comment_id
        and (public.has_voted(c.question_id) or c.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists comment_likes_insert on public.comment_likes;
create policy comment_likes_insert on public.comment_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.comments c
      where c.id = comment_id and public.has_voted(c.question_id)
    )
  );

drop policy if exists comment_likes_delete_own on public.comment_likes;
create policy comment_likes_delete_own on public.comment_likes
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- コメント取得（いいね数・自分の押下状態・返信先を含める）
-- 戻り値の型が変わるため、いったん削除してから作り直す
-- ---------------------------------------------------------------------
drop function if exists public.get_question_comments(uuid);

create function public.get_question_comments(p_question_id uuid)
returns table (
  id uuid,
  question_id uuid,
  user_id uuid,
  parent_id uuid,
  body text,
  status text,
  created_at timestamptz,
  author_username text,
  author_specialty_id integer,
  author_choice text,
  like_count integer,
  liked_by_me boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_voted(p_question_id) and not public.is_admin() then
    return;
  end if;

  return query
  select
    c.id, c.question_id, c.user_id, c.parent_id, c.body, c.status, c.created_at,
    p.username, p.specialty_id, v.choice,
    (select count(*)::integer from public.comment_likes l where l.comment_id = c.id),
    exists (
      select 1 from public.comment_likes l
      where l.comment_id = c.id and l.user_id = auth.uid()
    )
  from public.comments c
  join public.profiles p on p.id = c.user_id
  left join public.votes v
    on v.question_id = c.question_id and v.user_id = c.user_id
  where c.question_id = p_question_id and c.status = 'visible'
  order by c.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------
-- プロフィール用：自分のコメントと、もらったいいね
-- ---------------------------------------------------------------------
drop function if exists public.get_user_comments(uuid, integer);

create function public.get_user_comments(p_user_id uuid, p_limit integer default 20)
returns table (
  id uuid,
  question_id uuid,
  question_text text,
  body text,
  created_at timestamptz,
  like_count integer,
  is_reply boolean
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.question_id, q.question_text, c.body, c.created_at,
    (select count(*)::integer from public.comment_likes l where l.comment_id = c.id),
    c.parent_id is not null
  from public.comments c
  join public.questions q on q.id = c.question_id
  where c.user_id = p_user_id and c.status = 'visible'
  order by (select count(*) from public.comment_likes l where l.comment_id = c.id) desc,
           c.created_at desc
  limit p_limit;
$$;

-- もらったいいねの合計
drop function if exists public.get_received_like_count(uuid);

create function public.get_received_like_count(p_user_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.comment_likes l
  join public.comments c on c.id = l.comment_id
  where c.user_id = p_user_id and c.status = 'visible';
$$;

grant execute on function public.get_question_comments(uuid) to authenticated;
grant execute on function public.get_user_comments(uuid, integer) to authenticated;
grant execute on function public.get_received_like_count(uuid) to authenticated;

-- =====================================================================
-- 0010_demo_username_rename.sql
-- =====================================================================
-- =====================================================================
-- デモ医師のユーザーネームだけは変更を許可する
--   要件「ユーザーネームは一度選んだら変えられない」は実ユーザーに対するもの。
--   デモデータ（is_demo = true）は scripts/seed-supabase.mjs で作り直すため、
--   命名規則の変更（例: 末尾に _demo を付ける）を反映できる必要がある。
-- 0001〜0007 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.username is distinct from old.username and not old.is_demo then
    raise exception 'ユーザーネームは変更できません'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- =====================================================================
-- 0010_occupation.sql
-- =====================================================================
-- =====================================================================
-- 職業（コメディカルの利用に対応）
--   医師だけでなく、看護師・薬剤師・理学療法士・臨床工学技士なども利用できるようにする
-- 0001〜0009 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists occupation text not null default '医師';

alter table public.profiles
  drop constraint if exists profiles_occupation_check;
alter table public.profiles
  add constraint profiles_occupation_check
  check (occupation in (
    '医師','歯科医師','看護師','保健師','助産師','薬剤師',
    '理学療法士','作業療法士','言語聴覚士','臨床工学技士（ME）',
    '診療放射線技師','臨床検査技師','管理栄養士','救急救命士',
    '公認心理師・臨床心理士','医療事務','学生','その他'
  ));

comment on column public.profiles.occupation is '職業。公開情報';

create index if not exists profiles_occupation_idx on public.profiles (occupation);

-- 公開ビューに職業を含める（列構成が変わるので作り直す）
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
  select id, username, specialty_id, occupation, is_physician, is_admin, created_at
  from public.profiles
  where is_suspended = false;

grant select on public.public_profiles to authenticated, anon;

-- =====================================================================
-- 0011_doctor_only_metrics.sql
-- =====================================================================
-- =====================================================================
-- 指標の集計対象を「医師」に限定する
--   コメディカルも回答・コメントはできるが、
--   分布・多数派・普通度・偏差値の母集団は医師のみとする。
--   （自分の普通度は「医師と比べてどうか」を表す）
-- 0001〜0010 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

/** 指標の集計対象か（医師のみ） */
create or replace function public.counts_for_metrics(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.occupation = '医師' from public.profiles p where p.id = p_user_id),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 質問の結果（医師の回答のみを集計）
-- ---------------------------------------------------------------------
create or replace function public.get_question_result(p_question_id uuid)
returns table (
  vote_count integer, a_count integer, b_count integer,
  a_ratio numeric, b_ratio numeric, majority_choice text, my_choice text,
  other_count integer, other_a_count integer, other_b_count integer,
  agreement_rate numeric, other_majority_choice text, eligible boolean
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

  if v_my_choice is null then
    return;
  end if;

  select s.min_other_votes into v_min from public.app_settings s where s.id = 1;

  -- 医師の回答のみ集計する
  select
    count(*) filter (where v.choice = 'A'),
    count(*) filter (where v.choice = 'B'),
    count(*)
  into v_a, v_b, v_total
  from public.votes v
  join public.profiles p on p.id = v.user_id and p.occupation = '医師'
  where v.question_id = p_question_id;

  select
    count(*) filter (where v.choice = 'A'),
    count(*) filter (where v.choice = 'B'),
    count(*)
  into v_oa, v_ob, v_on
  from public.votes v
  join public.profiles p on p.id = v.user_id and p.occupation = '医師'
  where v.question_id = p_question_id and v.user_id <> v_uid;

  return query select
    v_total, v_a, v_b,
    case when v_total = 0 then 0 else round(100.0 * v_a / v_total, 4) end,
    case when v_total = 0 then 0 else round(100.0 * v_b / v_total, 4) end,
    case when v_a = v_b then null when v_a > v_b then 'A' else 'B' end,
    v_my_choice,
    v_on, v_oa, v_ob,
    case when v_on = 0 then null
      else round(100.0 * (case when v_my_choice = 'A' then v_oa else v_ob end) / v_on, 4) end,
    case when v_oa = v_ob then null when v_oa > v_ob then 'A' else 'B' end,
    (v_on >= v_min);
end;
$$;

-- ---------------------------------------------------------------------
-- 普通度・多数派一致率（他の回答者は医師のみ）
-- ---------------------------------------------------------------------
create or replace function public.get_user_ordinariness(p_user_id uuid)
returns table (
  ordinariness numeric, majority_agreement_rate numeric,
  eligible_question_count integer, answered_question_count integer,
  posted_question_count integer
)
language plpgsql stable security definer set search_path = public as $$
declare v_min integer;
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
      m.question_id, m.choice,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from my_votes m
    left join (
      select v.question_id, v.user_id, v.choice
      from public.votes v
      join public.profiles p on p.id = v.user_id and p.occupation = '医師'
    ) o on o.question_id = m.question_id and o.user_id <> p_user_id
    group by m.question_id, m.choice
  ),
  eligible as (
    select a.*,
      100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count as rate,
      case when a.a_count = a.b_count then null
           when a.a_count > a.b_count then 'A' else 'B' end as majority
    from agg a where a.other_count >= v_min
  )
  select
    (select round(avg(e.rate), 4) from eligible e),
    (select case when count(*) filter (where e.majority is not null) = 0 then null
       else round(100.0 * count(*) filter (where e.majority = e.choice)
         / count(*) filter (where e.majority is not null), 4) end from eligible e),
    (select count(*)::integer from eligible),
    (select count(*)::integer from my_votes),
    (select count(*)::integer from public.questions q
      where q.author_id = p_user_id and q.status <> 'deleted');
end;
$$;

-- ---------------------------------------------------------------------
-- 偏差値・順位（母集団は医師のみ。本人が医師でなくても値は出す）
-- ---------------------------------------------------------------------
create or replace function public.get_ordinariness_ranking(p_user_id uuid)
returns table (
  ordinariness numeric, deviation numeric, percentile numeric, compared_users integer
)
language sql stable security definer set search_path = public as $$
  with settings as (select min_other_votes from public.app_settings where id = 1),
  doctor_votes as (
    select v.question_id, v.user_id, v.choice
    from public.votes v
    join public.profiles p on p.id = v.user_id and p.occupation = '医師'
    join public.questions q on q.id = v.question_id and q.status = 'active'
  ),
  target_votes as (
    select v.question_id, v.user_id, v.choice
    from public.votes v
    join public.questions q on q.id = v.question_id and q.status = 'active'
    where v.user_id = p_user_id
    union all
    select question_id, user_id, choice from doctor_votes
  ),
  agg as (
    select
      m.user_id, m.question_id, m.choice,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from (select distinct user_id, question_id, choice from target_votes) m
    left join doctor_votes o
      on o.question_id = m.question_id and o.user_id <> m.user_id
    group by m.user_id, m.question_id, m.choice
  ),
  ord as (
    select a.user_id,
      avg(100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count) as value
    from agg a cross join settings s
    where a.other_count >= s.min_other_votes
    group by a.user_id
  ),
  -- 母集団は医師のみ
  population as (
    select o.value from ord o
    join public.profiles p on p.id = o.user_id and p.occupation = '医師'
  ),
  stats as (
    select count(*)::integer as n, avg(value) as mean,
           coalesce(stddev_pop(value), 0) as sd
    from population
  ),
  mine as (select o.value from ord o where o.user_id = p_user_id)
  select
    round((select m.value from mine m), 4),
    case
      when (select m.value from mine m) is null then null
      when (select s.n from stats s) = 0 then null
      when (select s.sd from stats s) = 0 then 50::numeric
      else round(50 + 10 * ((select m.value from mine m) - (select s.mean from stats s))
        / (select s.sd from stats s), 4)
    end,
    case
      when (select m.value from mine m) is null then null
      when (select s.n from stats s) = 0 then null
      else round(100.0 * (select count(*) from population pp where pp.value > (select m.value from mine m))
        / (select s.n from stats s), 4)
    end,
    (select s.n from stats s);
$$;

-- ---------------------------------------------------------------------
-- 直近の回答（他の回答者は医師のみ）
-- ---------------------------------------------------------------------
create or replace function public.get_recent_answers(p_user_id uuid, p_limit integer default 5)
returns table (
  question_id uuid, question_text text, option_a text, option_b text,
  my_choice text, agreement_rate numeric, majority_matched boolean,
  eligible boolean, answered_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_min integer;
begin
  if auth.uid() <> p_user_id and not public.is_admin() then
    return;
  end if;

  select s.min_other_votes into v_min from public.app_settings s where s.id = 1;

  return query
  with my as (
    select v.question_id, v.choice, v.created_at
    from public.votes v where v.user_id = p_user_id
    order by v.created_at desc limit p_limit
  ),
  agg as (
    select m.question_id, m.choice, m.created_at,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from my m
    left join (
      select v.question_id, v.user_id, v.choice
      from public.votes v
      join public.profiles p on p.id = v.user_id and p.occupation = '医師'
    ) o on o.question_id = m.question_id and o.user_id <> p_user_id
    group by m.question_id, m.choice, m.created_at
  )
  select a.question_id, q.question_text, q.option_a, q.option_b, a.choice,
    case when a.other_count = 0 then null
      else round(100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count, 4) end,
    case when a.a_count = a.b_count then null
      else (case when a.a_count > a.b_count then 'A' else 'B' end) = a.choice end,
    (a.other_count >= v_min),
    a.created_at
  from agg a join public.questions q on q.id = a.question_id
  order by a.created_at desc;
end;
$$;

grant execute on function public.counts_for_metrics(uuid) to authenticated;

-- =====================================================================
-- 0012_lock_identity.sql
-- =====================================================================
-- =====================================================================
-- 本名と職業も変更不可にする（ユーザーネームと同様）
--   登録時に決めた本人情報は後から変えられないようにする。
--   出題の既定：医師はシャッフル、それ以外は救急×研修医レベル。
-- 0001〜0011 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.username is distinct from old.username then
    raise exception 'ユーザーネームは変更できません' using errcode = '42501';
  end if;
  -- 空欄のまま登録された場合の後追い入力は許可し、入力後の変更を禁止する
  if old.real_name <> '' and new.real_name is distinct from old.real_name then
    raise exception '本名は変更できません' using errcode = '42501';
  end if;
  if old.occupation is distinct from new.occupation then
    raise exception '職業は変更できません' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 医師以外の既定：救急（category_id=8）×研修医レベル
update public.profiles
set filter_category_id = 8,
    filter_level = 'resident',
    shuffle_questions = false
where occupation <> '医師'
  and filter_category_id is null
  and filter_level is null;

-- =====================================================================
-- 0013_liked_comments.sql
-- =====================================================================
-- =====================================================================
-- 自分がいいねしたコメントの一覧（お気に入りページで参照する）
-- 0001〜0012 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.get_liked_comments(p_limit integer default 50)
returns table (
  id uuid,
  question_id uuid,
  question_text text,
  body text,
  author_username text,
  created_at timestamptz,
  like_count integer
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.question_id, q.question_text, c.body, p.username, l.created_at,
    (select count(*)::integer from public.comment_likes x where x.comment_id = c.id)
  from public.comment_likes l
  join public.comments c on c.id = l.comment_id and c.status = 'visible'
  join public.questions q on q.id = c.question_id
  join public.profiles p on p.id = c.user_id
  where l.user_id = auth.uid()
  order by l.created_at desc
  limit p_limit;
$$;

grant execute on function public.get_liked_comments(integer) to authenticated;

-- =====================================================================
-- 0014_multi_category_filter.sql
-- =====================================================================
-- =====================================================================
-- 出題の絞り込み：診療科を複数選択できるようにする
--   filter_category_ids … 出題する診療科の配列。空なら すべて
--   （従来の filter_category_id は移行後も残すが使わない）
-- 0001〜0013 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists filter_category_ids integer[] not null default '{}';

comment on column public.profiles.filter_category_ids is
  '出題する診療科のID配列。空ならすべて';

-- 旧カラムの値を移行する
update public.profiles
set filter_category_ids = array[filter_category_id]
where filter_category_id is not null
  and filter_category_ids = '{}';

-- =====================================================================
-- 0015_multi_level_filter.sql
-- =====================================================================
-- =====================================================================
-- 出題の絞り込み：レベルも複数選択できるようにする
--   filter_levels … 出題するレベルの配列。空なら すべて
-- 0001〜0014 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists filter_levels text[] not null default '{}';

comment on column public.profiles.filter_levels is
  '出題するレベルの配列。空ならすべて';

update public.profiles
set filter_levels = array[filter_level]
where filter_level is not null
  and filter_levels = '{}';

-- =====================================================================
-- 0016_trial_without_login.sql
-- =====================================================================
-- =====================================================================
-- ログインなしのお試し（5問）
--   ・未ログイン（anon）でも「決まった5問」と「その質問の分布」だけは見られる。
--   ・回答はサーバーに保存しない（Cookieに持つ）ので votes には一切入らない。
--   ・普通度・コメント・投稿はログイン後のみ（RLSはそのまま）。
-- 0001〜0010 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

-- ---------------------------------------------------------------------
-- お試しで出す質問（研修医レベルの基本問題から、常に同じ並びで先頭N問）
-- ---------------------------------------------------------------------
create or replace function public.get_trial_questions(p_limit integer default 5)
returns table (
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  category_id integer,
  level text
)
language sql stable security definer set search_path = public as $$
  select q.id, q.question_text, q.option_a, q.option_b, q.category_id, q.level
  from public.questions q
  where q.status = 'active'
    and q.level = 'resident'
    and (
      -- 分布を見せる意味があるので、ある程度回答が集まっているものに限る
      select count(*) from public.votes v where v.question_id = q.id
    ) >= 20
  order by q.created_at, q.id
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

-- ---------------------------------------------------------------------
-- お試し用の分布（本人の回答は存在しないので、全体の集計だけを返す）
-- ---------------------------------------------------------------------
create or replace function public.get_trial_result(p_question_id uuid)
returns table (
  vote_count integer,
  a_count integer,
  b_count integer
)
language sql stable security definer set search_path = public as $$
  select
    count(*)::integer,
    count(*) filter (where v.choice = 'A')::integer,
    count(*) filter (where v.choice = 'B')::integer
  from public.votes v
  where v.question_id = p_question_id
    and exists (
      select 1 from public.questions q
      where q.id = p_question_id and q.status = 'active'
    );
$$;

grant execute on function public.get_trial_questions(integer) to anon, authenticated;
grant execute on function public.get_trial_result(uuid) to anon, authenticated;

-- =====================================================================
-- 0017_next_question_rpc.sql
-- =====================================================================
-- =====================================================================
-- 「次の未回答質問」を1回の問い合わせで返す
--   これまではフィード全体（質問・投票・コメント・投稿者）を4〜5回に
--   分けて取得してから絞り込んでいた。DBの往復が多く遅かったため、
--   出題の絞り込み（診療科・レベル・シャッフル）も含めてSQL側で完結させる。
-- 0001〜0016 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.get_next_question(p_exclude uuid default null)
returns uuid
language sql stable security definer set search_path = public as $$
  with me as (
    select id, filter_category_ids, filter_levels, shuffle_questions
    from public.profiles where id = auth.uid()
  ),
  unanswered as (
    select q.id, q.created_at, q.category_id, q.level
    from public.questions q, me
    where q.status = 'active'
      and (p_exclude is null or q.id <> p_exclude)
      and not exists (
        select 1 from public.votes v
        where v.question_id = q.id and v.user_id = me.id
      )
  ),
  -- 条件に合うものを優先し、無ければ絞り込みを外す
  filtered as (
    select u.* from unanswered u, me
    where (cardinality(me.filter_category_ids) = 0
           or u.category_id = any (me.filter_category_ids))
      and (cardinality(me.filter_levels) = 0
           or u.level = any (me.filter_levels))
  ),
  target as (
    select * from filtered
    union all
    select * from unanswered
    where not exists (select 1 from filtered)
  )
  select t.id from target t, me
  order by
    case when me.shuffle_questions then random() else 0 end,
    t.created_at desc
  limit 1;
$$;

grant execute on function public.get_next_question(uuid) to authenticated;

-- =====================================================================
-- 0018_ordinariness_snapshot.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0018: 偏差値の母集団統計をスナップショット化する
--
-- これまで get_ordinariness_ranking は、呼ばれるたびに「全医師 × 全質問」の
-- 普通度を計算し直してから平均と標準偏差を求めていた。
-- 利用者が増えるほど成績表もプロフィールも重くなる作りだった。
--
-- 標準偏差は今までどおり実測する（固定値は使わない）。
-- 変えるのは「いつ測るか」だけ:
--   ・母集団の平均・標準偏差・順位 … スナップショットから読む（定期的に測り直す）
--   ・自分の普通度            … 毎回その場で計算する（自分の分だけなので軽い）
-- 母集団の分布は1人が数問答えた程度では動かないため、これで表示は変わらない。
-- ---------------------------------------------------------------------

-- 医師ひとりひとりの普通度（測り直したときの値）
create table if not exists public.ordinariness_snapshot (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  value numeric not null
);

-- 母集団全体の統計。1行だけ持つ
create table if not exists public.ordinariness_stats (
  id smallint primary key default 1 check (id = 1),
  n integer not null default 0,
  mean numeric,
  sd numeric,
  computed_at timestamptz not null default now()
);

insert into public.ordinariness_stats (id, n, computed_at)
values (1, 0, 'epoch'::timestamptz)
on conflict (id) do nothing;

create index if not exists ordinariness_snapshot_value_idx
  on public.ordinariness_snapshot (value);

-- スナップショットは関数経由でのみ読み書きする
alter table public.ordinariness_snapshot enable row level security;
alter table public.ordinariness_stats enable row level security;

-- ---------------------------------------------------------------------
-- 測り直し
-- ---------------------------------------------------------------------
create or replace function public.refresh_ordinariness_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ordinariness_snapshot;

  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  doctor_votes as (
    select v.question_id, v.user_id, v.choice
    from public.votes v
    join public.profiles p on p.id = v.user_id and p.occupation = '医師'
    join public.questions q on q.id = v.question_id and q.status = 'active'
  ),
  agg as (
    select
      m.user_id, m.question_id, m.choice,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from doctor_votes m
    left join doctor_votes o
      on o.question_id = m.question_id and o.user_id <> m.user_id
    group by m.user_id, m.question_id, m.choice
  ),
  ord as (
    select
      a.user_id,
      avg(
        100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end)
        / a.other_count
      ) as value
    from agg a
    cross join settings s
    where a.other_count >= s.min_other_votes
    group by a.user_id
  )
  insert into public.ordinariness_snapshot (user_id, value)
  select o.user_id, o.value from ord o;

  -- 平均と標準偏差はここで実測する
  update public.ordinariness_stats
  set
    n = coalesce(s.n, 0),
    mean = s.mean,
    sd = s.sd,
    computed_at = now()
  from (
    select
      count(*)::integer as n,
      avg(value) as mean,
      coalesce(stddev_pop(value), 0) as sd
    from public.ordinariness_snapshot
  ) s
  where public.ordinariness_stats.id = 1;
end;
$$;

/**
 * 前回の測り直しから p_max_age を過ぎていれば測り直す。
 * 過ぎていなければ何もしないので、毎回呼んでも安い。
 * 測り直したときだけ true を返す。
 */
create or replace function public.refresh_ordinariness_snapshot_if_stale(
  p_max_age interval default '30 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age_ok boolean;
begin
  select computed_at > now() - p_max_age into v_age_ok
  from public.ordinariness_stats where id = 1;

  if coalesce(v_age_ok, false) then
    return false;
  end if;

  perform public.refresh_ordinariness_snapshot();
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 偏差値・順位の取得（スナップショットを使う版）
-- ---------------------------------------------------------------------
drop function if exists public.get_ordinariness_ranking(uuid);

create or replace function public.get_ordinariness_ranking(p_user_id uuid)
returns table (
  ordinariness numeric,
  deviation numeric,
  percentile numeric,
  compared_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  -- 自分の回答した質問だけを見るので、全体を舐めなくて済む
  my_votes as (
    select v.question_id, v.choice
    from public.votes v
    join public.questions q on q.id = v.question_id and q.status = 'active'
    where v.user_id = p_user_id
  ),
  -- 同じ質問に答えた「自分以外の医師」だけを集める
  doctor_others as (
    select o.question_id, o.choice
    from public.votes o
    join public.profiles po on po.id = o.user_id and po.occupation = '医師'
    where o.user_id <> p_user_id
      and o.question_id in (select question_id from my_votes)
  ),
  my_agg as (
    select
      m.question_id, m.choice,
      count(d.question_id) filter (where d.choice = 'A') as a_count,
      count(d.question_id) filter (where d.choice = 'B') as b_count,
      count(d.question_id) as other_count
    from my_votes m
    left join doctor_others d on d.question_id = m.question_id
    group by m.question_id, m.choice
  ),
  mine as (
    select avg(
      100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end)
      / a.other_count
    ) as value
    from my_agg a
    cross join settings s
    where a.other_count >= s.min_other_votes
  ),
  stats as (
    select n, mean, sd from public.ordinariness_stats where id = 1
  )
  select
    round((select m.value from mine m), 4) as ordinariness,
    case
      when (select m.value from mine m) is null then null
      when coalesce((select s.n from stats s), 0) = 0 then 50::numeric
      when coalesce((select s.sd from stats s), 0) = 0 then 50::numeric
      else round(
        50 + 10 * ((select m.value from mine m) - (select s.mean from stats s))
        / (select s.sd from stats s), 4)
    end as deviation,
    case
      when (select m.value from mine m) is null then null
      when coalesce((select s.n from stats s), 0) = 0 then null
      else round(
        100.0 * (
          select count(*) from public.ordinariness_snapshot o
          where o.value > (select m.value from mine m)
        ) / (select s.n from stats s), 4)
    end as percentile,
    coalesce((select s.n from stats s), 0)::integer as compared_users;
$$;

-- ---------------------------------------------------------------------
-- 分布グラフ用：医師全体が10段階のどこに何人いるか
--
-- 区切りは成績表の称号（偏差値5きざみ）と同じにしてある。
-- 個人が特定できる情報は返さない（人数だけ）。
-- ---------------------------------------------------------------------
create or replace function public.get_ordinariness_distribution()
returns table (level integer, user_count integer)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select n, mean, sd from public.ordinariness_stats where id = 1
  ),
  scored as (
    select
      case
        when coalesce((select s.sd from stats s), 0) = 0 then 50::numeric
        else 50 + 10 * (o.value - (select s.mean from stats s))
             / (select s.sd from stats s)
      end as deviation
    from public.ordinariness_snapshot o
  ),
  banded as (
    select
      case
        when deviation >= 70 then 10
        when deviation >= 65 then 9
        when deviation >= 60 then 8
        when deviation >= 55 then 7
        when deviation >= 50 then 6
        when deviation >= 45 then 5
        when deviation >= 40 then 4
        when deviation >= 35 then 3
        when deviation >= 30 then 2
        else 1
      end as level
    from scored
  )
  -- 0人の段も抜けないように、1〜10を必ず返す
  select
    g.level::integer,
    coalesce(count(b.level), 0)::integer as user_count
  from generate_series(1, 10) as g(level)
  left join banded b on b.level = g.level
  group by g.level
  order by g.level;
$$;

grant execute on function public.get_ordinariness_ranking(uuid) to authenticated;
grant execute on function public.get_ordinariness_distribution() to authenticated;
grant execute on function public.refresh_ordinariness_snapshot_if_stale(interval) to authenticated;

-- 初回ぶんをここで作っておく
select public.refresh_ordinariness_snapshot();

-- =====================================================================
-- 0019_fast_toggles.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0019: いいね・お気に入りの切り替えを1往復にする
--
-- これまでは、いいね1回につきサーバー側で次の順に待っていた。
--   1. auth.getUser()         … Authサーバーへの問い合わせ
--   2. profiles を1件取得      … 押した人の判定
--   3. comment_likes を検索    … すでに押しているか
--   4. insert または delete
-- どれもネットワーク往復なので、合計すると押してから数百ミリ秒かかっていた。
--
-- ここでは 3と4 をDB内の1関数にまとめ、押した人は auth.uid() から取る。
-- アプリ側は「RPCを1回呼ぶ」だけになる。
--
-- security definer にはしない（既定の invoker のまま）。
-- そうすることで「回答済みの質問のコメントにしか いいね できない」等の
-- 既存のRLSポリシーがこれまでどおり効く。
-- ---------------------------------------------------------------------

/**
 * コメントのいいねを切り替える。押した後の状態（true=いいね中）を返す。
 */
create or replace function public.toggle_comment_like(p_comment_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_removed boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.comment_likes
  where comment_id = p_comment_id and user_id = v_user
  returning true into v_removed;

  if coalesce(v_removed, false) then
    return false;
  end if;

  -- 二重送信で落ちないように on conflict で受け止める
  insert into public.comment_likes (comment_id, user_id)
  values (p_comment_id, v_user)
  on conflict (comment_id, user_id) do nothing;

  return true;
end;
$$;

/**
 * お気に入りを切り替える。押した後の状態（true=お気に入り中）を返す。
 */
create or replace function public.toggle_favorite(p_question_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_removed boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.favorites
  where question_id = p_question_id and user_id = v_user
  returning true into v_removed;

  if coalesce(v_removed, false) then
    return false;
  end if;

  insert into public.favorites (question_id, user_id)
  values (p_question_id, v_user)
  on conflict (question_id, user_id) do nothing;

  return true;
end;
$$;

grant execute on function public.toggle_comment_like(uuid) to authenticated;
grant execute on function public.toggle_favorite(uuid) to authenticated;

-- =====================================================================
-- 0020_lock_privilege_columns.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0020: 権限に関わる列を、本人が書き換えられないようにする
--
-- profiles_update_own は「自分の行なら更新してよい」というだけの規則で、
-- 列の制限が無かった。INSERT側には is_admin = false の制約があるのに
-- UPDATE側には無かったため、ログイン済みのユーザーが公開キーを使って
--     update profiles set is_admin = true where id = <自分>
-- を直接投げると、管理者になれてしまう状態だった。
--
-- 管理者になると is_admin() を使うポリシーがすべて開くため、
-- 全ユーザーの本名・医籍登録番号・勤務都道府県が読めるようになる。
-- 影響が大きいので、トリガーで列そのものを守る。
--
-- ポリシーではなくトリガーにしている理由：
--   ・列単位のGRANTだけでは security definer のRPC経由の書き込みを守れない
--   ・トリガーなら、どの経路から来た更新でも必ず通る
--
-- 管理画面（利用停止の切り替え）と scripts/make-admin.mjs は今までどおり動く。
--   ・管理者からの更新は許可する
--   ・service_role / SQL Editor（auth.uid() が null）も許可する
-- ---------------------------------------------------------------------

create or replace function public.prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.username is distinct from old.username then
    raise exception 'ユーザーネームは変更できません' using errcode = '42501';
  end if;
  -- 空欄のまま登録された場合の後追い入力は許可し、入力後の変更を禁止する
  if old.real_name <> '' and new.real_name is distinct from old.real_name then
    raise exception '本名は変更できません' using errcode = '42501';
  end if;
  if old.occupation is distinct from new.occupation then
    raise exception '職業は変更できません' using errcode = '42501';
  end if;

  -- 権限に関わる列。管理者以外は変更できない。
  -- auth.uid() が null のとき（service_role・SQL Editor）は素通しする。
  if auth.uid() is not null and not public.is_admin() then
    if new.is_admin is distinct from old.is_admin
      or new.is_suspended is distinct from old.is_suspended
      or new.is_demo is distinct from old.is_demo
    then
      raise exception '権限に関わる項目は変更できません' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 0003 で作られているが、未適用の環境でも確実に張られるようにしておく
drop trigger if exists profiles_lock_username on public.profiles;
create trigger profiles_lock_username
  before update on public.profiles
  for each row
  execute function public.prevent_username_change();

-- =====================================================================
-- 0021_feed_rpc.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0021: フィードを1回の問い合わせで返す
--
-- これまでの getFeed は次の5回をアプリ側から投げていた。
--   1. questions を100件
--   2. 自分の votes
--   3. comments を「全件」        ← limit が無く、テーブルが育つほど重くなる
--   4. 投稿者の public_profiles
--   5. 自分の profiles（出題の絞り込み設定）
-- そのうえで絞り込み・並べ替えをJavaScriptでやっていた。
--
-- 3が特に問題で、欲しいのは質問ごとの件数だけなのに全行を運んでいた。
-- ここではSQL側で数え、絞り込みと並べ替えも含めて1回で返す。
--
-- security definer だがRLSの代わりに以下を関数内で守る：
--   ・出すのは status = 'active' の質問だけ
--   ・投稿者は public_profiles にある公開項目だけ（本名・勤務地は出さない）
--   ・コメント数は「自分が回答済みの質問」だけ。未回答は 0 を返す
--     （回答前に結果もコメントも見せない、という原則§13を壊さないため）
-- ---------------------------------------------------------------------

create or replace function public.get_feed(p_limit integer default 100)
returns table (
  id uuid,
  author_id uuid,
  question_text text,
  option_a text,
  option_b text,
  category_id integer,
  level text,
  status text,
  image_url text,
  is_demo boolean,
  created_at timestamptz,
  answered boolean,
  author_username text,
  author_specialty_id integer,
  comment_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.filter_category_ids, p.filter_levels, p.shuffle_questions
    from public.profiles p
    where p.id = auth.uid()
  ),
  base as (
    select
      q.id, q.author_id, q.question_text, q.option_a, q.option_b,
      q.category_id, q.level, q.status, q.image_url, q.is_demo, q.created_at,
      exists (
        select 1 from public.votes v
        where v.question_id = q.id and v.user_id = (select m.id from me m)
      ) as answered
    from public.questions q
    where q.status = 'active'
  ),
  -- 絞り込みに合うもの。未回答が1件も無ければ絞り込みを外す（従来と同じ挙動）
  filtered as (
    select b.* from base b, me m
    where (cardinality(m.filter_category_ids) = 0
           or b.category_id = any (m.filter_category_ids))
      and (cardinality(m.filter_levels) = 0
           or b.level = any (m.filter_levels))
  ),
  target as (
    select * from filtered
    union all
    select * from base
    where not exists (select 1 from filtered f where not f.answered)
  )
  select
    t.id, t.author_id, t.question_text, t.option_a, t.option_b,
    t.category_id, t.level, t.status, t.image_url, t.is_demo, t.created_at,
    t.answered,
    coalesce(pp.username, 'unknown') as author_username,
    coalesce(pp.specialty_id, 0) as author_specialty_id,
    -- 未回答の質問ではコメント数を明かさない
    case
      when t.answered then (
        select count(*)::integer from public.comments c
        where c.question_id = t.id and c.status = 'visible'
      )
      else 0
    end as comment_count
  from target t
  left join public.public_profiles pp on pp.id = t.author_id
  cross join me m
  order by
    t.answered,                                        -- 未回答が先
    case when m.shuffle_questions and not t.answered
         then random() else 0 end,
    t.created_at desc
  limit least(coalesce(p_limit, 100), 200);
$$;

grant execute on function public.get_feed(integer) to authenticated;

-- =====================================================================
-- 0022_user_report_rpc.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0022: 成績表・プロフィールの指標を1回の問い合わせにまとめる
--
-- 成績表とプロフィールは get_user_ordinariness と get_ordinariness_ranking を
-- 両方呼んでいた。どちらも中で「自分の普通度」を最初から計算し直すため、
-- 同じ集計を2回していた。
--
-- ここでは自分の集計を1度だけ作り、そこから
--   ・普通度／多数派一致率／対象質問数／回答数／投稿数
--   ・偏差値／順位（母集団はスナップショットから）
-- をまとめて返す。
--
-- 既存の2つの関数はそのまま残す（/setup の診断や個別の呼び出しで使うため）。
-- ---------------------------------------------------------------------

create or replace function public.get_user_report(p_user_id uuid)
returns table (
  ordinariness numeric,
  majority_agreement_rate numeric,
  eligible_question_count integer,
  answered_question_count integer,
  posted_question_count integer,
  deviation numeric,
  percentile numeric,
  compared_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  my_votes as (
    select v.question_id, v.choice
    from public.votes v
    join public.questions q on q.id = v.question_id and q.status = 'active'
    where v.user_id = p_user_id
  ),
  -- 自分が答えた質問に限って、他の医師の回答を集める
  doctor_others as (
    select o.question_id, o.choice
    from public.votes o
    join public.profiles po on po.id = o.user_id and po.occupation = '医師'
    where o.user_id <> p_user_id
      and o.question_id in (select question_id from my_votes)
  ),
  agg as (
    select
      m.question_id, m.choice,
      count(d.question_id) filter (where d.choice = 'A') as a_count,
      count(d.question_id) filter (where d.choice = 'B') as b_count,
      count(d.question_id) as other_count
    from my_votes m
    left join doctor_others d on d.question_id = m.question_id
    group by m.question_id, m.choice
  ),
  eligible as (
    select
      a.*,
      100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end)
        / a.other_count as rate,
      case when a.a_count = a.b_count then null
           when a.a_count > a.b_count then 'A'
           else 'B' end as majority
    from agg a
    cross join settings s
    where a.other_count >= s.min_other_votes
  ),
  mine as (
    select avg(e.rate) as value from eligible e
  ),
  stats as (
    select n, mean, sd from public.ordinariness_stats where id = 1
  )
  select
    round((select m.value from mine m), 4) as ordinariness,
    (select case
       when count(*) filter (where e.majority is not null) = 0 then null
       else round(
         100.0 * count(*) filter (where e.majority = e.choice)
         / count(*) filter (where e.majority is not null), 4)
     end from eligible e) as majority_agreement_rate,
    (select count(*)::integer from eligible) as eligible_question_count,
    (select count(*)::integer from my_votes) as answered_question_count,
    (select count(*)::integer from public.questions q
      where q.author_id = p_user_id and q.status <> 'deleted') as posted_question_count,
    case
      when (select m.value from mine m) is null then null
      when coalesce((select s.n from stats s), 0) = 0 then 50::numeric
      when coalesce((select s.sd from stats s), 0) = 0 then 50::numeric
      else round(
        50 + 10 * ((select m.value from mine m) - (select s.mean from stats s))
        / (select s.sd from stats s), 4)
    end as deviation,
    case
      when (select m.value from mine m) is null then null
      when coalesce((select s.n from stats s), 0) = 0 then null
      else round(
        100.0 * (
          select count(*) from public.ordinariness_snapshot o
          where o.value > (select m.value from mine m)
        ) / (select s.n from stats s), 4)
    end as percentile,
    coalesce((select s.n from stats s), 0)::integer as compared_users;
$$;

grant execute on function public.get_user_report(uuid) to authenticated;

-- =====================================================================
-- 0023_question_with_author.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0023: 質問と投稿者を1回で取る
--
-- getQuestion は「質問を取る」→「その author_id で投稿者を取る」の2往復だった。
-- 2つ目は1つ目の結果が出るまで投げられないため、必ず直列に待つことになる。
-- 質問ページはどの経路からも必ずここを通るので、1往復に減らす。
--
-- 見せてよい範囲は従来と同じ：
--   ・質問は status が active／自分の投稿／管理者のときだけ
--   ・投稿者は public_profiles にある公開項目だけ
-- ---------------------------------------------------------------------

create or replace function public.get_question_with_author(p_id uuid)
returns table (
  id uuid,
  author_id uuid,
  question_text text,
  option_a text,
  option_b text,
  category_id integer,
  level text,
  status text,
  image_url text,
  is_demo boolean,
  created_at timestamptz,
  author_username text,
  author_specialty_id integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id, q.author_id, q.question_text, q.option_a, q.option_b,
    q.category_id, q.level, q.status, q.image_url, q.is_demo, q.created_at,
    coalesce(pp.username, 'unknown') as author_username,
    coalesce(pp.specialty_id, 0) as author_specialty_id
  from public.questions q
  left join public.public_profiles pp on pp.id = q.author_id
  where q.id = p_id
    -- 非公開・削除済みは、投稿者本人と管理者だけが引ける（RLSと同じ条件）
    and (q.status = 'active' or q.author_id = auth.uid() or public.is_admin());
$$;

grant execute on function public.get_question_with_author(uuid) to authenticated;

-- =====================================================================
-- 0024_harden_public_profiles.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0024: public_profiles への書き込み経路を閉じ、トリガー関数をRPCから隠す
--
-- ■ public_profiles の穴
-- public_profiles は「他人については公開項目だけ見せる」ための読み取り専用の
-- ビューのつもりだったが、実際には次の3つが重なって書き込み経路になっていた。
--
--   1. ビューが security definer（security_invoker = false）で、
--      中の profiles には所有者の権限で触る＝profiles のRLSを通らない
--   2. profiles 1枚から素直に select しているだけなので、
--      PostgreSQL が自動更新可能ビューとみなす（is_updatable = YES）
--   3. Supabase の既定で anon・authenticated に ALL が GRANT されている
--
-- この結果、公開キーさえあれば未ログインからでも
--     PATCH /rest/v1/public_profiles?id=eq.<誰でも>   {"is_admin": true}
--     DELETE /rest/v1/public_profiles?id=eq.<誰でも>
-- が通ってしまう。ビューには is_admin 列があるため、他人を管理者にすることも、
-- プロフィールを消すこともできる状態だった。
--
-- 0020 で入れた prevent_username_change トリガーは
--   「auth.uid() が null なら素通し（service_role・SQL Editor のため）」
-- という条件なので、auth.uid() が null になる anon はこの防御をすり抜ける。
-- つまりトリガーだけでは塞げず、GRANT を外す必要がある。
--
-- security_invoker = true にする案もあるが、それだと profiles のRLS
-- （自分の行だけ）が効いて他人のユーザーネームが引けなくなり、
-- コメント一覧・ランキング・投稿者名の表示が全部壊れる。
-- このビューは「読ませるために意図して definer にしている」ものなので、
-- definer のまま SELECT だけに絞るのが筋が通る。
--
-- ■ トリガー関数がRPCとして公開されている件
-- apply_removal_request / prune_demo_votes / prevent_username_change は
-- トリガーから呼ばれる関数で、/rest/v1/rpc/... から直接呼ぶ意味はない。
-- 呼べる状態にしておく理由が無いので外す。
-- トリガー経由の実行には EXECUTE 権限は要らない（PostgreSQL は
-- CREATE TRIGGER の時点で見て、発火時には見ない）ので、動作には影響しない。
--
-- 同じ指摘が public.rls_auto_enable にも出るが、これは Supabase 側が
-- 用意したイベントトリガー関数でこちらの所有物ではない。ローカルの
-- pgtest環境には存在せず、本番でも所有者でなければ revoke できないため、
-- 「あって、かつ外せるなら外す」形にしてある。
-- ---------------------------------------------------------------------

-- public_profiles は読み取り専用にする
revoke insert, update, delete, truncate, references
  on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- トリガー関数はRPCから呼べないようにする
revoke execute on function public.apply_removal_request()
  from anon, authenticated, public;
revoke execute on function public.prune_demo_votes()
  from anon, authenticated, public;
revoke execute on function public.prevent_username_change()
  from anon, authenticated, public;

-- Supabase 側の関数。無い環境・権限が無い環境では黙って見送る。
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable()
      from anon, authenticated, public;
  end if;
exception
  when insufficient_privilege then
    raise notice 'rls_auto_enable の権限を変更できませんでした（所有者ではないため）';
end;
$$;

-- =====================================================================
-- 0025_weighted_ordinariness.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0025: 普通度に「直近ほど重い」傾斜をかける
--
-- これまでの普通度は、対象となる質問すべての一致率を単純平均していた。
-- そのため昔の回答がいつまでも同じ重さで残り、いまの診療スタイルが
-- 変わっても値が動きにくかった。
--
-- 新しい定義：回答の新しい順に並べ、次の重みを掛けた加重平均にする。
--
--     重み = 0.5 ^ ((順位 - 1) / 20)
--
--   1問目前(最新) 1.00 ／ 20問目前 0.51 ／ 40問目前 0.26 ／ 100問目前 0.03
--
-- 20問ごとに重みが半分になる（半減期20問）。段差が無いので
-- 20問目と21問目で値が飛ぶことがなく、古い回答も重みはゼロにならない。
--
-- 対象となるのは従来どおり「本人以外の回答が min_other_votes 以上ある質問」。
-- 順位はその対象質問の中で、自分が回答した日時の新しい順に付ける。
--
-- 多数派一致率は「一致した質問の割合」という別の指標なので、重み付けしない。
--
-- 同じ定義を次の3か所すべてに入れる（ずれると偏差値が狂うため）：
--   ・get_user_ordinariness      … プロフィール等
--   ・get_user_report            … 成績表・プロフィール（0022）
--   ・refresh_ordinariness_snapshot / get_ordinariness_ranking … 偏差値（0018）
-- TypeScript側の同じ計算は src/lib/metrics.ts にある。
-- ---------------------------------------------------------------------

-- 半減期20問の重み。順位は1が最新
create or replace function public.recency_weight(p_rank bigint)
returns numeric
language sql
immutable
as $$
  select power(0.5::numeric, (p_rank - 1)::numeric / 20::numeric);
$$;

grant execute on function public.recency_weight(bigint) to authenticated, anon;

-- ---------------------------------------------------------------------
-- 個人の指標
-- ---------------------------------------------------------------------
create or replace function public.get_user_ordinariness(p_user_id uuid)
returns table (
  ordinariness numeric,
  majority_agreement_rate numeric,
  eligible_question_count integer,
  answered_question_count integer,
  posted_question_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  my_votes as (
    select v.question_id, v.choice, v.created_at
    from public.votes v
    join public.questions q on q.id = v.question_id and q.status = 'active'
    where v.user_id = p_user_id
  ),
  doctor_others as (
    select o.question_id, o.choice
    from public.votes o
    join public.profiles po on po.id = o.user_id and po.occupation = '医師'
    where o.user_id <> p_user_id
      and o.question_id in (select question_id from my_votes)
  ),
  agg as (
    select
      m.question_id, m.choice, m.created_at,
      count(d.question_id) filter (where d.choice = 'A') as a_count,
      count(d.question_id) filter (where d.choice = 'B') as b_count,
      count(d.question_id) as other_count
    from my_votes m
    left join doctor_others d on d.question_id = m.question_id
    group by m.question_id, m.choice, m.created_at
  ),
  eligible as (
    select
      a.*,
      100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end)
        / a.other_count as rate,
      case when a.a_count = a.b_count then null
           when a.a_count > a.b_count then 'A'
           else 'B' end as majority
    from agg a
    cross join settings s
    where a.other_count >= s.min_other_votes
  ),
  -- 回答の新しい順に順位を付け、直近ほど重くする
  weighted as (
    select
      e.*,
      public.recency_weight(
        row_number() over (order by e.created_at desc, e.question_id)
      ) as w
    from eligible e
  )
  select
    (select round(sum(x.rate * x.w) / nullif(sum(x.w), 0), 4) from weighted x),
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
$$;

-- ---------------------------------------------------------------------
-- 成績表・プロフィール用のまとめ取得（0022 を新しい定義で作り直す）
-- ---------------------------------------------------------------------
create or replace function public.get_user_report(p_user_id uuid)
returns table (
  ordinariness numeric,
  majority_agreement_rate numeric,
  eligible_question_count integer,
  answered_question_count integer,
  posted_question_count integer,
  deviation numeric,
  percentile numeric,
  compared_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select * from public.get_user_ordinariness(p_user_id)
  ),
  stats as (
    select n, mean, sd from public.ordinariness_stats where id = 1
  )
  select
    m.ordinariness,
    m.majority_agreement_rate,
    m.eligible_question_count,
    m.answered_question_count,
    m.posted_question_count,
    case
      when m.ordinariness is null then null
      when coalesce((select s.n from stats s), 0) = 0 then 50::numeric
      when coalesce((select s.sd from stats s), 0) = 0 then 50::numeric
      else round(
        50 + 10 * (m.ordinariness - (select s.mean from stats s))
        / (select s.sd from stats s), 4)
    end as deviation,
    case
      when m.ordinariness is null then null
      when coalesce((select s.n from stats s), 0) = 0 then null
      else round(
        100.0 * (
          select count(*) from public.ordinariness_snapshot o
          where o.value > m.ordinariness
        ) / (select s.n from stats s), 4)
    end as percentile,
    coalesce((select s.n from stats s), 0)::integer as compared_users
  from m;
$$;

-- ---------------------------------------------------------------------
-- 偏差値の母集団（0018 のスナップショットも同じ重み付けにする）
-- ---------------------------------------------------------------------
create or replace function public.refresh_ordinariness_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ordinariness_snapshot;

  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  doctor_votes as (
    select v.question_id, v.user_id, v.choice, v.created_at
    from public.votes v
    join public.profiles p on p.id = v.user_id and p.occupation = '医師'
    join public.questions q on q.id = v.question_id and q.status = 'active'
  ),
  agg as (
    select
      m.user_id, m.question_id, m.choice, m.created_at,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from doctor_votes m
    left join doctor_votes o
      on o.question_id = m.question_id and o.user_id <> m.user_id
    group by m.user_id, m.question_id, m.choice, m.created_at
  ),
  eligible as (
    select
      a.user_id,
      a.created_at,
      a.question_id,
      100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end)
        / a.other_count as rate
    from agg a
    cross join settings s
    where a.other_count >= s.min_other_votes
  ),
  -- 順位は「その人の中で」新しい順に付ける
  weighted as (
    select
      e.user_id,
      e.rate,
      public.recency_weight(
        row_number() over (
          partition by e.user_id
          order by e.created_at desc, e.question_id
        )
      ) as w
    from eligible e
  ),
  ord as (
    select x.user_id, sum(x.rate * x.w) / nullif(sum(x.w), 0) as value
    from weighted x
    group by x.user_id
  )
  insert into public.ordinariness_snapshot (user_id, value)
  select o.user_id, o.value from ord o where o.value is not null;

  update public.ordinariness_stats
  set
    n = coalesce(s.n, 0),
    mean = s.mean,
    sd = s.sd,
    computed_at = now()
  from (
    select
      count(*)::integer as n,
      avg(value) as mean,
      coalesce(stddev_pop(value), 0) as sd
    from public.ordinariness_snapshot
  ) s
  where public.ordinariness_stats.id = 1;
end;
$$;

-- ---------------------------------------------------------------------
-- 偏差値・順位（0018 の版を、同じ重み付けの普通度で作り直す）
-- ---------------------------------------------------------------------
create or replace function public.get_ordinariness_ranking(p_user_id uuid)
returns table (
  ordinariness numeric,
  deviation numeric,
  percentile numeric,
  compared_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  select r.ordinariness, r.deviation, r.percentile, r.compared_users
  from public.get_user_report(p_user_id) r;
$$;

grant execute on function public.get_user_ordinariness(uuid) to authenticated;
grant execute on function public.get_user_report(uuid) to authenticated;
grant execute on function public.get_ordinariness_ranking(uuid) to authenticated;

-- 定義が変わったので、母集団を測り直しておく
select public.refresh_ordinariness_snapshot();

-- =====================================================================
-- 0026_authored_questions.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0026: 投稿した質問が「どうなったか」をプロフィールで見られるようにする
--
-- これまで getQuestionsByAuthor は質問そのものしか返していなかったため、
-- 自分が出した質問に何人答えたのか、どう割れたのかが分からなかった。
--
-- 原則§13（回答前に結果を見せない）は崩さない。開示の範囲を分けている。
--
--   回答数            … 投稿者本人と管理者にだけ返す。
--                       「何人に届いたか」は投稿者に必要な情報で、
--                       かつ人数だけではA/Bどちらが多いか分からないため
--                       先入観を与えない。
--   A/Bの内訳・コメント数 … 見ている人がその質問に回答済みのときだけ返す。
--                       自分の質問でも、自分が答えるまでは割れ方を見せない。
--   非公開(hidden)の質問  … 投稿者本人と管理者にだけ返す（RLSと同じ条件）。
--
-- 集計は「医師のみ」ではなく全回答者。ここは指標ではなく
-- 「自分の質問への反響」を見せる画面なので、実際に答えた人数を出す。
-- ---------------------------------------------------------------------

create or replace function public.get_authored_questions(p_author_id uuid)
returns table (
  id uuid,
  author_id uuid,
  question_text text,
  option_a text,
  option_b text,
  category_id integer,
  level text,
  status text,
  image_url text,
  is_demo boolean,
  created_at timestamptz,
  -- 投稿者本人・管理者にだけ入る（それ以外は null）
  vote_count integer,
  -- 見ている人が回答済みのときだけ入る（それ以外は null）
  a_count integer,
  b_count integer,
  comment_count integer,
  viewer_answered boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select
      auth.uid() as uid,
      (auth.uid() = p_author_id) as is_author,
      public.is_admin() as is_admin
  )
  select
    q.id, q.author_id, q.question_text, q.option_a, q.option_b,
    q.category_id, q.level, q.status, q.image_url, q.is_demo, q.created_at,
    case when v.is_author or v.is_admin then (
      select count(*)::integer from public.votes t where t.question_id = q.id
    ) end as vote_count,
    case when answered.yes then (
      select count(*)::integer from public.votes t
      where t.question_id = q.id and t.choice = 'A'
    ) end as a_count,
    case when answered.yes then (
      select count(*)::integer from public.votes t
      where t.question_id = q.id and t.choice = 'B'
    ) end as b_count,
    case when answered.yes then (
      select count(*)::integer from public.comments c
      where c.question_id = q.id and c.status = 'visible'
    ) end as comment_count,
    answered.yes as viewer_answered
  from public.questions q
  cross join viewer v
  cross join lateral (
    select exists (
      select 1 from public.votes t
      where t.question_id = q.id and t.user_id = v.uid
    ) as yes
  ) answered
  where q.author_id = p_author_id
    and q.status <> 'deleted'
    -- 非公開は投稿者本人と管理者だけ
    and (q.status = 'active' or v.is_author or v.is_admin)
  order by q.created_at desc;
$$;

grant execute on function public.get_authored_questions(uuid) to authenticated;

-- =====================================================================
-- 0027_trial_results.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0027: お試しの成績を1回の問い合わせで出す
--
-- お試しは「5問続けて解いて、最後に成績を見る」流れにした。
-- 途中では分布を見せないので、必要なのは最後の1回だけ。
-- これまでは get_trial_result を質問の数だけ呼んでいた。
--
-- 本人の回答はサーバーに無い（Cookieにしか無い）ので、返すのは全体集計だけ。
-- どちらを選んだかはアプリ側が持っていて、そこで突き合わせる。
-- ---------------------------------------------------------------------

create or replace function public.get_trial_results(p_ids uuid[])
returns table (
  question_id uuid,
  vote_count integer,
  a_count integer,
  b_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id as question_id,
    count(v.id)::integer as vote_count,
    count(v.id) filter (where v.choice = 'A')::integer as a_count,
    count(v.id) filter (where v.choice = 'B')::integer as b_count
  from public.questions q
  left join public.votes v on v.question_id = q.id
  where q.id = any (p_ids)
    and q.status = 'active'
  group by q.id;
$$;

grant execute on function public.get_trial_results(uuid[]) to anon, authenticated;

-- =====================================================================
-- 0028_trial_comments.sql
-- =====================================================================
-- ---------------------------------------------------------------------
-- 0028: お試し（未ログイン）でもコメントを読めるようにする
--
-- 0016 でお試しの分布は anon に公開している。コメントも同じ範囲に限って読める
-- ようにする。「他の医師がどう考えたか」が見えないと、分布の数字だけでは
-- 判断の理由が伝わらないため。
--
-- 公開する範囲は get_trial_questions と完全に同じ条件に縛る。
--   ・status = 'active'
--   ・level  = 'resident'
--   ・回答が20件以上
-- つまり「お試しで出している質問」だけ。他の質問のコメントは一切出ない。
--
-- 原則§13（回答前に結果を見せない）との関係：
-- この関数は誰でも呼べるため、お試しの5問については「回答しなくても
-- コメントが読める」ことになる。ただしこれは分布（get_trial_result）が
-- すでに同じ条件で公開されているのと同じ扱いで、範囲は広がっていない。
-- ログインが要る本編の質問は、これまでどおり回答しないと何も見えない。
--
-- 返さないもの：
--   ・user_id（誰が書いたかのIDは出さない。表示に使うのは公開名だけ）
--   ・liked_by_me（未ログインでは自分が無い）
-- ---------------------------------------------------------------------

create or replace function public.get_trial_comments(
  p_question_id uuid,
  p_limit integer default 20
)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  author_username text,
  author_specialty_id integer,
  author_choice text,
  like_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.parent_id,
    c.body,
    c.created_at,
    coalesce(pp.username, 'unknown') as author_username,
    coalesce(pp.specialty_id, 0) as author_specialty_id,
    v.choice as author_choice,
    (select count(*)::integer from public.comment_likes l where l.comment_id = c.id)
      as like_count
  from public.comments c
  join public.questions q on q.id = c.question_id
  left join public.public_profiles pp on pp.id = c.user_id
  -- コメントした人がその質問でどちらを選んだか（ログイン版と同じ表示にする）
  left join public.votes v
    on v.question_id = c.question_id and v.user_id = c.user_id
  where c.question_id = p_question_id
    and c.status = 'visible'
    -- お試しで出している質問に限る（get_trial_questions と同じ条件）
    and q.status = 'active'
    and q.level = 'resident'
    and (select count(*) from public.votes t where t.question_id = q.id) >= 20
  order by c.created_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

grant execute on function public.get_trial_comments(uuid, integer) to anon, authenticated;
