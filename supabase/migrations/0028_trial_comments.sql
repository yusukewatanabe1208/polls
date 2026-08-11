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
