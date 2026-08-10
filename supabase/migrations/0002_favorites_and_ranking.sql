-- =====================================================================
-- 追加機能：お気に入り / 画像添付 / 成績表（偏差値・ランク）
-- 0001_init.sql の後に実行してください。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 質問への画像添付（1枚まで）
-- ---------------------------------------------------------------------
alter table public.questions
  add column if not exists image_url text;

-- ---------------------------------------------------------------------
-- お気に入り
-- ---------------------------------------------------------------------
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);
create index if not exists favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites
  for select to authenticated using (user_id = auth.uid());

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 索引（1問ずつ回答する流れを速くする）
-- ---------------------------------------------------------------------
-- 直近の回答の取得
create index if not exists votes_user_created_idx
  on public.votes (user_id, created_at desc);
-- 質問ごとの集計（普通度・結果表示）
create index if not exists votes_question_choice_idx
  on public.votes (question_id, choice);
-- 表示対象コメントの取得
create index if not exists comments_question_status_idx
  on public.comments (question_id, status);
-- フィード（未回答の新しい質問）
create index if not exists questions_active_created_idx
  on public.questions (created_at desc) where status = 'active';
create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 直近の回答（成績表で使用）
-- ---------------------------------------------------------------------
create or replace function public.get_recent_answers(
  p_user_id uuid,
  p_limit integer default 5
)
returns table (
  question_id uuid,
  question_text text,
  option_a text,
  option_b text,
  my_choice text,
  agreement_rate numeric,
  majority_matched boolean,
  eligible boolean,
  answered_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_min integer;
begin
  -- 自分の成績のみ参照できる
  if auth.uid() <> p_user_id and not public.is_admin() then
    return;
  end if;

  select s.min_other_votes into v_min from public.app_settings s where s.id = 1;

  return query
  with my as (
    select v.question_id, v.choice, v.created_at
    from public.votes v
    where v.user_id = p_user_id
    order by v.created_at desc
    limit p_limit
  ),
  agg as (
    select
      m.question_id, m.choice, m.created_at,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from my m
    left join public.votes o
      on o.question_id = m.question_id and o.user_id <> p_user_id
    group by m.question_id, m.choice, m.created_at
  )
  select
    a.question_id,
    q.question_text,
    q.option_a,
    q.option_b,
    a.choice,
    case when a.other_count = 0 then null
      else round(100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count, 4)
    end,
    case when a.a_count = a.b_count then null
      else (case when a.a_count > a.b_count then 'A' else 'B' end) = a.choice
    end,
    (a.other_count >= v_min),
    a.created_at
  from agg a
  join public.questions q on q.id = a.question_id
  order by a.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- 普通度の偏差値と順位（成績表）
--   deviation      … 全体平均50・標準偏差10に正規化した偏差値
--   percentile     … 自分より普通度が高い人の割合（小さいほど普通）
--   compared_users … 比較対象となったユーザー数
-- ---------------------------------------------------------------------
-- PostgRESTはSTABLE関数を読み取り専用トランザクションで実行するため、
-- 一時テーブルは使わずCTEだけで完結させる。
create or replace function public.get_ordinariness_ranking(p_user_id uuid)
returns table (
  ordinariness numeric,
  deviation numeric,
  percentile numeric,
  compared_users integer
)
language sql stable security definer set search_path = public as $$
  with settings as (
    select min_other_votes from public.app_settings where id = 1
  ),
  all_votes as (
    select v.user_id, v.question_id, v.choice
    from public.votes v
    join public.questions q on q.id = v.question_id and q.status = 'active'
  ),
  agg as (
    select
      m.user_id, m.question_id, m.choice,
      count(o.user_id) filter (where o.choice = 'A') as a_count,
      count(o.user_id) filter (where o.choice = 'B') as b_count,
      count(o.user_id) as other_count
    from all_votes m
    left join public.votes o
      on o.question_id = m.question_id and o.user_id <> m.user_id
    group by m.user_id, m.question_id, m.choice
  ),
  ord as (
    select
      a.user_id,
      avg(100.0 * (case when a.choice = 'A' then a.a_count else a.b_count end) / a.other_count) as value
    from agg a
    cross join settings s
    where a.other_count >= s.min_other_votes
    group by a.user_id
  ),
  stats as (
    select
      count(*)::integer as n,
      avg(o.value) as mean,
      coalesce(stddev_pop(o.value), 0) as sd
    from ord o
  ),
  mine as (
    select o.value from ord o where o.user_id = p_user_id
  )
  select
    round((select m.value from mine m), 4) as ordinariness,
    case
      when (select m.value from mine m) is null then null
      when (select s.sd from stats s) = 0 then 50::numeric
      else round(
        50 + 10 * ((select m.value from mine m) - (select s.mean from stats s))
        / (select s.sd from stats s), 4)
    end as deviation,
    case
      when (select m.value from mine m) is null then null
      else round(
        100.0 * (select count(*) from ord o where o.value > (select m.value from mine m))
        / (select s.n from stats s), 4)
    end as percentile,
    (select s.n from stats s) as compared_users;
$$;

grant execute on function public.get_recent_answers(uuid, integer) to authenticated;
grant execute on function public.get_ordinariness_ranking(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 画像用ストレージ（1枚10MBまで）
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images', 'question-images', true, 10485760,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists question_images_read on storage.objects;
create policy question_images_read on storage.objects
  for select using (bucket_id = 'question-images');

drop policy if exists question_images_insert on storage.objects;
create policy question_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists question_images_delete on storage.objects;
create policy question_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
