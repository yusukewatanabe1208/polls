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
