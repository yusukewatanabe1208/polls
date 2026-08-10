-- =====================================================================
-- コメントの「いいね」と「返信」
--   ・いいねは1コメント1ユーザー1回（もう一度押すと取り消し）
--   ・コメントに対するコメント（返信）を1階層まで
--   ・プロフィールで、もらったいいね数と自分のコメントを参照できる
-- 0001〜0008 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 返信（親コメント）
-- ---------------------------------------------------------------------
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx on public.comments (parent_id);

comment on column public.comments.parent_id is
  '返信先のコメント。null なら質問への直接のコメント';

-- ---------------------------------------------------------------------
-- いいね
-- ---------------------------------------------------------------------
create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
create index if not exists comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

-- 回答済みの質問のコメントにだけ、いいねを付けたり数を見たりできる
drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes
  for select to authenticated
  using (
    exists (
      select 1 from public.comments c
      where c.id = comment_id
        and (public.has_voted(c.question_id) or c.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists comment_likes_insert on public.comment_likes;
create policy comment_likes_insert on public.comment_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.comments c
      where c.id = comment_id and public.has_voted(c.question_id)
    )
  );

drop policy if exists comment_likes_delete_own on public.comment_likes;
create policy comment_likes_delete_own on public.comment_likes
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- コメント取得（いいね数・自分の押下状態・返信先を含める）
-- 戻り値の型が変わるため、いったん削除してから作り直す
-- ---------------------------------------------------------------------
drop function if exists public.get_question_comments(uuid);

create function public.get_question_comments(p_question_id uuid)
returns table (
  id uuid,
  question_id uuid,
  user_id uuid,
  parent_id uuid,
  body text,
  status text,
  created_at timestamptz,
  author_username text,
  author_specialty_id integer,
  author_choice text,
  like_count integer,
  liked_by_me boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_voted(p_question_id) and not public.is_admin() then
    return;
  end if;

  return query
  select
    c.id, c.question_id, c.user_id, c.parent_id, c.body, c.status, c.created_at,
    p.username, p.specialty_id, v.choice,
    (select count(*)::integer from public.comment_likes l where l.comment_id = c.id),
    exists (
      select 1 from public.comment_likes l
      where l.comment_id = c.id and l.user_id = auth.uid()
    )
  from public.comments c
  join public.profiles p on p.id = c.user_id
  left join public.votes v
    on v.question_id = c.question_id and v.user_id = c.user_id
  where c.question_id = p_question_id and c.status = 'visible'
  order by c.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------
-- プロフィール用：自分のコメントと、もらったいいね
-- ---------------------------------------------------------------------
drop function if exists public.get_user_comments(uuid, integer);

create function public.get_user_comments(p_user_id uuid, p_limit integer default 20)
returns table (
  id uuid,
  question_id uuid,
  question_text text,
  body text,
  created_at timestamptz,
  like_count integer,
  is_reply boolean
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.question_id, q.question_text, c.body, c.created_at,
    (select count(*)::integer from public.comment_likes l where l.comment_id = c.id),
    c.parent_id is not null
  from public.comments c
  join public.questions q on q.id = c.question_id
  where c.user_id = p_user_id and c.status = 'visible'
  order by (select count(*) from public.comment_likes l where l.comment_id = c.id) desc,
           c.created_at desc
  limit p_limit;
$$;

-- もらったいいねの合計
drop function if exists public.get_received_like_count(uuid);

create function public.get_received_like_count(p_user_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.comment_likes l
  join public.comments c on c.id = l.comment_id
  where c.user_id = p_user_id and c.status = 'visible';
$$;

grant execute on function public.get_question_comments(uuid) to authenticated;
grant execute on function public.get_user_comments(uuid, integer) to authenticated;
grant execute on function public.get_received_like_count(uuid) to authenticated;
