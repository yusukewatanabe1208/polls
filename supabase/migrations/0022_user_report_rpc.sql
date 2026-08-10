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
