-- ---------------------------------------------------------------------
-- 0021: フィードを1回の問い合わせで返す
--
-- これまでの getFeed は次の5回をアプリ側から投げていた。
--   1. questions を100件
--   2. 自分の votes
--   3. comments を「全件」        ← limit が無く、テーブルが育つほど重くなる
--   4. 投稿者の public_profiles
--   5. 自分の profiles（出題の絞り込み設定）
-- そのうえで絞り込み・並べ替えをJavaScriptでやっていた。
--
-- 3が特に問題で、欲しいのは質問ごとの件数だけなのに全行を運んでいた。
-- ここではSQL側で数え、絞り込みと並べ替えも含めて1回で返す。
--
-- security definer だがRLSの代わりに以下を関数内で守る：
--   ・出すのは status = 'active' の質問だけ
--   ・投稿者は public_profiles にある公開項目だけ（本名・勤務地は出さない）
--   ・コメント数は「自分が回答済みの質問」だけ。未回答は 0 を返す
--     （回答前に結果もコメントも見せない、という原則§13を壊さないため）
-- ---------------------------------------------------------------------

create or replace function public.get_feed(p_limit integer default 100)
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
  answered boolean,
  author_username text,
  author_specialty_id integer,
  comment_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.filter_category_ids, p.filter_levels, p.shuffle_questions
    from public.profiles p
    where p.id = auth.uid()
  ),
  base as (
    select
      q.id, q.author_id, q.question_text, q.option_a, q.option_b,
      q.category_id, q.level, q.status, q.image_url, q.is_demo, q.created_at,
      exists (
        select 1 from public.votes v
        where v.question_id = q.id and v.user_id = (select m.id from me m)
      ) as answered
    from public.questions q
    where q.status = 'active'
  ),
  -- 絞り込みに合うもの。未回答が1件も無ければ絞り込みを外す（従来と同じ挙動）
  filtered as (
    select b.* from base b, me m
    where (cardinality(m.filter_category_ids) = 0
           or b.category_id = any (m.filter_category_ids))
      and (cardinality(m.filter_levels) = 0
           or b.level = any (m.filter_levels))
  ),
  target as (
    select * from filtered
    union all
    select * from base
    where not exists (select 1 from filtered f where not f.answered)
  )
  select
    t.id, t.author_id, t.question_text, t.option_a, t.option_b,
    t.category_id, t.level, t.status, t.image_url, t.is_demo, t.created_at,
    t.answered,
    coalesce(pp.username, 'unknown') as author_username,
    coalesce(pp.specialty_id, 0) as author_specialty_id,
    -- 未回答の質問ではコメント数を明かさない
    case
      when t.answered then (
        select count(*)::integer from public.comments c
        where c.question_id = t.id and c.status = 'visible'
      )
      else 0
    end as comment_count
  from target t
  left join public.public_profiles pp on pp.id = t.author_id
  cross join me m
  order by
    t.answered,                                        -- 未回答が先
    case when m.shuffle_questions and not t.answered
         then random() else 0 end,
    t.created_at desc
  limit least(coalesce(p_limit, 100), 200);
$$;

grant execute on function public.get_feed(integer) to authenticated;
