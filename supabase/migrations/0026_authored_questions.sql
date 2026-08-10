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
