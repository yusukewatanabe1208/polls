-- ---------------------------------------------------------------------
-- 0030: 管理画面に出す基本指標
--
-- 「いま何人いて、どれだけ使われているか」を時系列で見るための集計。
-- 管理者だけが呼べる（関数の中で is_admin() を見る）。
--
-- ■ デモデータは数えない
-- 指標は実ユーザーだけで集計する。デモ（is_demo = true）を混ぜると
-- 実際の利用状況が見えなくなるため。
-- 導入直後の実データで確認したところ、登録95人のうち93人、
-- 回答4,128件のうち4,052件がデモだった。混ぜれば指標の98%がデモになる。
-- デモの件数は別途 demo_* として返すので、必要なら画面側で並べて出せる。
--
-- ■ 日付の区切りは日本時間
-- UTCで切ると日本の深夜帯が翌日に寄ってしまい、
-- 「昨日は何件だったか」が実感と合わなくなる。
--
-- 用語：
--   登録者数        実ユーザーの profiles 行数
--   アクティブ      その日に「回答・コメント・質問投稿」のいずれかをした実ユーザー
--   一人当たり回答数 実ユーザーの総回答数 ÷ 実登録者数
-- 個人が特定できる情報は返さない（人数と件数だけ）。
-- ---------------------------------------------------------------------

-- 戻り値の形を変えるときのため、毎回作り直す
-- （create or replace function は戻り値の型を変えられない）
drop function if exists public.get_admin_totals();
drop function if exists public.get_admin_daily(integer);

/** 全体の要約。1行だけ返す */
create or replace function public.get_admin_totals()
returns table (
  total_users integer,
  total_questions integer,
  total_votes integer,
  total_comments integer,
  votes_per_user numeric,
  active_7d integer,
  active_30d integer,
  new_users_7d integer,
  new_users_30d integer,
  new_questions_7d integer,
  demo_users integer,
  demo_votes integer
)
language sql
stable
security definer
set search_path = public
as $$
  with guard as (select public.is_admin() as ok),
  real_users as (
    select id from public.profiles where not is_demo
  ),
  -- その日に何かした人（回答・コメント・質問投稿）。デモは除く
  activity as (
    select v.user_id, v.created_at from public.votes v
      join real_users u on u.id = v.user_id
    union all
    select c.user_id, c.created_at from public.comments c
      join real_users u on u.id = c.user_id
    union all
    select q.author_id, q.created_at from public.questions q
      join real_users u on u.id = q.author_id
  )
  select
    (select count(*)::integer from real_users),
    (select count(*)::integer from public.questions q
      join real_users u on u.id = q.author_id
      where q.status <> 'deleted'),
    (select count(*)::integer from public.votes v
      join real_users u on u.id = v.user_id),
    (select count(*)::integer from public.comments c
      join real_users u on u.id = c.user_id
      where c.status = 'visible'),
    (select case when (select count(*) from real_users) = 0 then 0
       else round(
         (select count(*) from public.votes v join real_users u on u.id = v.user_id)::numeric
         / (select count(*) from real_users), 1) end),
    (select count(distinct user_id)::integer from activity
      where created_at >= now() - interval '7 days'),
    (select count(distinct user_id)::integer from activity
      where created_at >= now() - interval '30 days'),
    (select count(*)::integer from public.profiles
      where not is_demo and created_at >= now() - interval '7 days'),
    (select count(*)::integer from public.profiles
      where not is_demo and created_at >= now() - interval '30 days'),
    (select count(*)::integer from public.questions q
      join real_users u on u.id = q.author_id
      where q.created_at >= now() - interval '7 days' and q.status <> 'deleted'),
    (select count(*)::integer from public.profiles where is_demo),
    (select count(*)::integer from public.votes where is_demo)
  from guard g
  where g.ok;
$$;

/** 日ごとの推移。データが無い日も 0 で埋めて返す。デモは数えない */
create or replace function public.get_admin_daily(p_days integer default 30)
returns table (
  day date,
  new_users integer,
  active_users integer,
  votes integer,
  new_questions integer,
  total_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  with guard as (select public.is_admin() as ok),
  span as (
    select greatest(1, least(coalesce(p_days, 30), 365)) as n
  ),
  -- 日本時間で日付を切る
  days as (
    select generate_series(
      (now() at time zone 'Asia/Tokyo')::date - ((select n from span) - 1),
      (now() at time zone 'Asia/Tokyo')::date,
      interval '1 day'
    )::date as day
  ),
  real_users as (
    select id, created_at from public.profiles where not is_demo
  ),
  activity as (
    select v.user_id, v.created_at from public.votes v
      join real_users u on u.id = v.user_id
    union all
    select c.user_id, c.created_at from public.comments c
      join real_users u on u.id = c.user_id
    union all
    select q.author_id, q.created_at from public.questions q
      join real_users u on u.id = q.author_id
  )
  select
    d.day,
    (select count(*)::integer from real_users p
      where (p.created_at at time zone 'Asia/Tokyo')::date = d.day),
    (select count(distinct a.user_id)::integer from activity a
      where (a.created_at at time zone 'Asia/Tokyo')::date = d.day),
    (select count(*)::integer from public.votes v
      join real_users u on u.id = v.user_id
      where (v.created_at at time zone 'Asia/Tokyo')::date = d.day),
    (select count(*)::integer from public.questions q
      join real_users u on u.id = q.author_id
      where (q.created_at at time zone 'Asia/Tokyo')::date = d.day
        and q.status <> 'deleted'),
    -- その日までの累計登録者数
    (select count(*)::integer from real_users p
      where (p.created_at at time zone 'Asia/Tokyo')::date <= d.day)
  from days d
  cross join guard g
  where g.ok
  order by d.day;
$$;

grant execute on function public.get_admin_totals() to authenticated;
grant execute on function public.get_admin_daily(integer) to authenticated;
