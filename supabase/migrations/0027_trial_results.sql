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
