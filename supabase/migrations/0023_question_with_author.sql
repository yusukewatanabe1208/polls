-- ---------------------------------------------------------------------
-- 0023: 質問と投稿者を1回で取る
--
-- getQuestion は「質問を取る」→「その author_id で投稿者を取る」の2往復だった。
-- 2つ目は1つ目の結果が出るまで投げられないため、必ず直列に待つことになる。
-- 質問ページはどの経路からも必ずここを通るので、1往復に減らす。
--
-- 見せてよい範囲は従来と同じ：
--   ・質問は status が active／自分の投稿／管理者のときだけ
--   ・投稿者は public_profiles にある公開項目だけ
-- ---------------------------------------------------------------------

create or replace function public.get_question_with_author(p_id uuid)
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
  author_username text,
  author_specialty_id integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id, q.author_id, q.question_text, q.option_a, q.option_b,
    q.category_id, q.level, q.status, q.image_url, q.is_demo, q.created_at,
    coalesce(pp.username, 'unknown') as author_username,
    coalesce(pp.specialty_id, 0) as author_specialty_id
  from public.questions q
  left join public.public_profiles pp on pp.id = q.author_id
  where q.id = p_id
    -- 非公開・削除済みは、投稿者本人と管理者だけが引ける（RLSと同じ条件）
    and (q.status = 'active' or q.author_id = auth.uid() or public.is_admin());
$$;

grant execute on function public.get_question_with_author(uuid) to authenticated;
