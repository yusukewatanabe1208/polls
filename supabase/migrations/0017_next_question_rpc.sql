-- =====================================================================
-- 「次の未回答質問」を1回の問い合わせで返す
--   これまではフィード全体（質問・投票・コメント・投稿者）を4〜5回に
--   分けて取得してから絞り込んでいた。DBの往復が多く遅かったため、
--   出題の絞り込み（診療科・レベル・シャッフル）も含めてSQL側で完結させる。
-- 0001〜0016 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.get_next_question(p_exclude uuid default null)
returns uuid
language sql stable security definer set search_path = public as $$
  with me as (
    select id, filter_category_ids, filter_levels, shuffle_questions
    from public.profiles where id = auth.uid()
  ),
  unanswered as (
    select q.id, q.created_at, q.category_id, q.level
    from public.questions q, me
    where q.status = 'active'
      and (p_exclude is null or q.id <> p_exclude)
      and not exists (
        select 1 from public.votes v
        where v.question_id = q.id and v.user_id = me.id
      )
  ),
  -- 条件に合うものを優先し、無ければ絞り込みを外す
  filtered as (
    select u.* from unanswered u, me
    where (cardinality(me.filter_category_ids) = 0
           or u.category_id = any (me.filter_category_ids))
      and (cardinality(me.filter_levels) = 0
           or u.level = any (me.filter_levels))
  ),
  target as (
    select * from filtered
    union all
    select * from unanswered
    where not exists (select 1 from filtered)
  )
  select t.id from target t, me
  order by
    case when me.shuffle_questions then random() else 0 end,
    t.created_at desc
  limit 1;
$$;

grant execute on function public.get_next_question(uuid) to authenticated;
