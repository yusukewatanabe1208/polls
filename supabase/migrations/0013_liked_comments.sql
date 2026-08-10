-- =====================================================================
-- 自分がいいねしたコメントの一覧（お気に入りページで参照する）
-- 0001〜0012 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.get_liked_comments(p_limit integer default 50)
returns table (
  id uuid,
  question_id uuid,
  question_text text,
  body text,
  author_username text,
  created_at timestamptz,
  like_count integer
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.question_id, q.question_text, c.body, p.username, l.created_at,
    (select count(*)::integer from public.comment_likes x where x.comment_id = c.id)
  from public.comment_likes l
  join public.comments c on c.id = l.comment_id and c.status = 'visible'
  join public.questions q on q.id = c.question_id
  join public.profiles p on p.id = c.user_id
  where l.user_id = auth.uid()
  order by l.created_at desc
  limit p_limit;
$$;

grant execute on function public.get_liked_comments(integer) to authenticated;
