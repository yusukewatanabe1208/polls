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
