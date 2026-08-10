-- =====================================================================
-- 出題の絞り込み：レベルも複数選択できるようにする
--   filter_levels … 出題するレベルの配列。空なら すべて
-- 0001〜0014 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists filter_levels text[] not null default '{}';

comment on column public.profiles.filter_levels is
  '出題するレベルの配列。空ならすべて';

update public.profiles
set filter_levels = array[filter_level]
where filter_level is not null
  and filter_levels = '{}';
