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
