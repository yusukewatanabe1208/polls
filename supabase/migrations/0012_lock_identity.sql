-- =====================================================================
-- 本名と職業も変更不可にする（ユーザーネームと同様）
--   登録時に決めた本人情報は後から変えられないようにする。
--   出題の既定：医師はシャッフル、それ以外は救急×研修医レベル。
-- 0001〜0011 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

create or replace function public.prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.username is distinct from old.username then
    raise exception 'ユーザーネームは変更できません' using errcode = '42501';
  end if;
  -- 空欄のまま登録された場合の後追い入力は許可し、入力後の変更を禁止する
  if old.real_name <> '' and new.real_name is distinct from old.real_name then
    raise exception '本名は変更できません' using errcode = '42501';
  end if;
  if old.occupation is distinct from new.occupation then
    raise exception '職業は変更できません' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 医師以外の既定：救急（category_id=8）×研修医レベル
update public.profiles
set filter_category_id = 8,
    filter_level = 'resident',
    shuffle_questions = false
where occupation <> '医師'
  and filter_category_id is null
  and filter_level is null;
