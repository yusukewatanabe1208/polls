-- =====================================================================
-- デモ質問に実ユーザーの回答が4人以上集まったら、
-- その質問のデモ医師の回答を削除する。
--   → 実際の医師の分布に置き換わっていく。
-- 0001〜0006 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.prune_demo_votes()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_real_votes integer;
begin
  -- デモの回答が入ったときは何もしない
  if new.is_demo then
    return null;
  end if;

  select count(*) into v_real_votes
  from public.votes
  where question_id = new.question_id and not is_demo;

  if v_real_votes >= 4 then
    delete from public.votes
    where question_id = new.question_id and is_demo;

    delete from public.comments
    where question_id = new.question_id and is_demo;
  end if;

  return null;
end;
$$;

drop trigger if exists votes_prune_demo on public.votes;
create trigger votes_prune_demo
  after insert on public.votes
  for each row
  execute function public.prune_demo_votes();

-- すでに4人以上の実回答が集まっている質問があれば、いま整理しておく
delete from public.votes v
where v.is_demo
  and (
    select count(*) from public.votes r
    where r.question_id = v.question_id and not r.is_demo
  ) >= 4;

delete from public.comments c
where c.is_demo
  and (
    select count(*) from public.votes r
    where r.question_id = c.question_id and not r.is_demo
  ) >= 4;
