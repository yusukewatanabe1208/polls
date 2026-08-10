-- =====================================================================
-- 削除推奨
--   ・管理者が押した場合は即削除
--   ・一般ユーザーは3人以上が押した時点で削除
-- 0001〜0007 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create table if not exists public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);
create index if not exists removal_requests_question_idx
  on public.removal_requests (question_id);

alter table public.removal_requests enable row level security;

drop policy if exists removal_requests_insert on public.removal_requests;
create policy removal_requests_insert on public.removal_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists removal_requests_select on public.removal_requests;
create policy removal_requests_select on public.removal_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists removal_requests_delete_admin on public.removal_requests;
create policy removal_requests_delete_admin on public.removal_requests
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 判定：管理者なら即削除、そうでなければ3人以上で削除
-- ---------------------------------------------------------------------
create or replace function public.apply_removal_request()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_is_admin boolean;
  v_count integer;
begin
  select coalesce(p.is_admin, false) into v_is_admin
  from public.profiles p where p.id = new.user_id;

  select count(*) into v_count
  from public.removal_requests
  where question_id = new.question_id;

  if v_is_admin or v_count >= 3 then
    update public.questions
    set status = 'deleted'
    where id = new.question_id and status <> 'deleted';
  end if;

  return null;
end;
$$;

drop trigger if exists removal_requests_apply on public.removal_requests;
create trigger removal_requests_apply
  after insert on public.removal_requests
  for each row
  execute function public.apply_removal_request();
