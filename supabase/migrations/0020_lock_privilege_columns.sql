-- ---------------------------------------------------------------------
-- 0020: 権限に関わる列を、本人が書き換えられないようにする
--
-- profiles_update_own は「自分の行なら更新してよい」というだけの規則で、
-- 列の制限が無かった。INSERT側には is_admin = false の制約があるのに
-- UPDATE側には無かったため、ログイン済みのユーザーが公開キーを使って
--     update profiles set is_admin = true where id = <自分>
-- を直接投げると、管理者になれてしまう状態だった。
--
-- 管理者になると is_admin() を使うポリシーがすべて開くため、
-- 全ユーザーの本名・医籍登録番号・勤務都道府県が読めるようになる。
-- 影響が大きいので、トリガーで列そのものを守る。
--
-- ポリシーではなくトリガーにしている理由：
--   ・列単位のGRANTだけでは security definer のRPC経由の書き込みを守れない
--   ・トリガーなら、どの経路から来た更新でも必ず通る
--
-- 管理画面（利用停止の切り替え）と scripts/make-admin.mjs は今までどおり動く。
--   ・管理者からの更新は許可する
--   ・service_role / SQL Editor（auth.uid() が null）も許可する
-- ---------------------------------------------------------------------

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

  -- 権限に関わる列。管理者以外は変更できない。
  -- auth.uid() が null のとき（service_role・SQL Editor）は素通しする。
  if auth.uid() is not null and not public.is_admin() then
    if new.is_admin is distinct from old.is_admin
      or new.is_suspended is distinct from old.is_suspended
      or new.is_demo is distinct from old.is_demo
    then
      raise exception '権限に関わる項目は変更できません' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 0003 で作られているが、未適用の環境でも確実に張られるようにしておく
drop trigger if exists profiles_lock_username on public.profiles;
create trigger profiles_lock_username
  before update on public.profiles
  for each row
  execute function public.prevent_username_change();
