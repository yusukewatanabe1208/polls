-- =====================================================================
-- デモ医師のユーザーネームだけは変更を許可する
--   要件「ユーザーネームは一度選んだら変えられない」は実ユーザーに対するもの。
--   デモデータ（is_demo = true）は scripts/seed-supabase.mjs で作り直すため、
--   命名規則の変更（例: 末尾に _demo を付ける）を反映できる必要がある。
-- 0001〜0007 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.username is distinct from old.username and not old.is_demo then
    raise exception 'ユーザーネームは変更できません'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
