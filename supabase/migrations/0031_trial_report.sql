-- ---------------------------------------------------------------------
-- 0031: お試しの成績を、ログイン後の成績表と同じ計算で出す
--
-- これまでお試しの成績は「回答者全員のうち自分と同じ選択の割合の単純平均」で、
-- 正式な普通度（医師のみ・本人以外が min_other_votes 以上・直近重視の加重平均）
-- とは別物だった。そのため偏差値とランクは出していなかった。
--
-- ここでは正式な定義とそろえ、偏差値・順位・ランクまで出せるようにする。
--   ・母集団は医師のみ（get_user_ordinariness と同じ）
--   ・本人の回答はサーバーに無いので、自己除外は不要（もともと入っていない）
--   ・重みは 0.5 ^ ((順位-1)/20)（0025 と同じ）。配列の後ろほど新しい回答
--   ・偏差値・順位は ordinariness_stats / ordinariness_snapshot から
--     （ログイン後とまったく同じ母集団）
--
-- ■ 対象はお試しの5問だけに縛る
-- 引数の質問IDは Cookie から来るので、細工すれば任意のIDを渡せてしまう。
-- 縛りが無いと「回答していない質問の分布」を誰でも引ける口になり、
-- 原則§13（回答前に結果を見せない）が壊れる。
-- get_trial_questions と同じ条件（active・研修医レベル・回答20件以上）に限る。
-- ---------------------------------------------------------------------

drop function if exists public.get_trial_report(uuid[], text[]);
drop function if exists public.get_trial_answer_details(uuid[], text[]);

/** お試しで答えた質問のうち、集計対象になるものと自分の一致率 */
create or replace function public.trial_agg(p_ids uuid[], p_choices text[])
returns table (
  question_id uuid,
  choice text,
  ord bigint,
  a_count integer,
  b_count integer,
  other_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select t.id, t.choice, t.ord
    from unnest(p_ids, p_choices) with ordinality as t(id, choice, ord)
    where t.choice in ('A', 'B')
  ),
  -- お試しで出している質問だけ（get_trial_questions と同じ条件）
  trial as (
    select q.id
    from public.questions q
    where q.status = 'active'
      and q.level = 'resident'
      and (select count(*) from public.votes v where v.question_id = q.id) >= 20
  )
  select
    i.id,
    i.choice,
    i.ord,
    (select count(*)::integer from public.votes v
       join public.profiles p on p.id = v.user_id and p.occupation = '医師'
      where v.question_id = i.id and v.choice = 'A'),
    (select count(*)::integer from public.votes v
       join public.profiles p on p.id = v.user_id and p.occupation = '医師'
      where v.question_id = i.id and v.choice = 'B'),
    (select count(*)::integer from public.votes v
       join public.profiles p on p.id = v.user_id and p.occupation = '医師'
      where v.question_id = i.id)
  from input i
  join trial t on t.id = i.id;
$$;

/** ログイン後の get_user_report と同じ形・同じ定義で返す */
create or replace function public.get_trial_report(p_ids uuid[], p_choices text[])
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
  agg as (
    select * from public.trial_agg(p_ids, p_choices)
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
  -- 配列の後ろほど新しい回答なので、ord の降順で順位を付ける
  weighted as (
    select
      e.*,
      public.recency_weight(row_number() over (order by e.ord desc)) as w
    from eligible e
  ),
  mine as (
    select sum(x.rate * x.w) / nullif(sum(x.w), 0) as value from weighted x
  ),
  stats as (
    select n, mean, sd from public.ordinariness_stats where id = 1
  )
  select
    round((select m.value from mine m), 4),
    (select case
       when count(*) filter (where e.majority is not null) = 0 then null
       else round(
         100.0 * count(*) filter (where e.majority = e.choice)
         / count(*) filter (where e.majority is not null), 4)
     end from eligible e),
    (select count(*)::integer from eligible),
    (select count(*)::integer from agg),
    0,
    case
      when (select m.value from mine m) is null then null
      when coalesce((select s.n from stats s), 0) = 0 then 50::numeric
      when coalesce((select s.sd from stats s), 0) = 0 then 50::numeric
      else round(
        50 + 10 * ((select m.value from mine m) - (select s.mean from stats s))
        / (select s.sd from stats s), 4)
    end,
    case
      when (select m.value from mine m) is null then null
      when coalesce((select s.n from stats s), 0) = 0 then null
      else round(
        100.0 * (
          select count(*) from public.ordinariness_snapshot o
          where o.value > (select m.value from mine m)
        ) / (select s.n from stats s), 4)
    end,
    coalesce((select s.n from stats s), 0)::integer;
$$;

/** 回答履歴。ログイン後の get_recent_answers と同じ形で返す */
create or replace function public.get_trial_answer_details(
  p_ids uuid[],
  p_choices text[]
)
returns table (
  question_id uuid,
  question_text text,
  option_a text,
  option_b text,
  my_choice text,
  agreement_rate numeric,
  majority_matched boolean,
  eligible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  agg as (
    select * from public.trial_agg(p_ids, p_choices)
  )
  select
    a.question_id,
    q.question_text,
    q.option_a,
    q.option_b,
    a.choice,
    case when a.other_count = 0 then null
      else round(
        100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end)
        / a.other_count, 4) end,
    case when a.a_count = a.b_count then null
      else (case when a.a_count > a.b_count then 'A' else 'B' end) = a.choice end,
    a.other_count >= (select s.min_other_votes from settings s)
  from agg a
  join public.questions q on q.id = a.question_id
  order by a.ord;
$$;

grant execute on function public.trial_agg(uuid[], text[]) to anon, authenticated;
grant execute on function public.get_trial_report(uuid[], text[]) to anon, authenticated;
grant execute on function public.get_trial_answer_details(uuid[], text[]) to anon, authenticated;
