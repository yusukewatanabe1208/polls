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
