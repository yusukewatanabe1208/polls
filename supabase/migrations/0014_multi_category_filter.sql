-- =====================================================================
-- 出題の絞り込み：診療科を複数選択できるようにする
--   filter_category_ids … 出題する診療科の配列。空なら すべて
--   （従来の filter_category_id は移行後も残すが使わない）
-- 0001〜0013 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists filter_category_ids integer[] not null default '{}';

comment on column public.profiles.filter_category_ids is
  '出題する診療科のID配列。空ならすべて';

-- 旧カラムの値を移行する
update public.profiles
set filter_category_ids = array[filter_category_id]
where filter_category_id is not null
  and filter_category_ids = '{}';
