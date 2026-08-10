-- =====================================================================
-- 出題の絞り込み設定（診療科・レベル・シャッフル）
--   filter_category_id … 出題する診療科。null なら すべて
--   filter_level       … 出題するレベル。null なら すべて
--   shuffle_questions  … 出題順をシャッフルするか
-- 0001〜0005 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists filter_category_id integer references public.categories(id),
  add column if not exists filter_level text,
  add column if not exists shuffle_questions boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_filter_level_check;
alter table public.profiles
  add constraint profiles_filter_level_check
  check (filter_level is null or filter_level in ('resident', 'non_specialist', 'specialist'));

comment on column public.profiles.filter_category_id is '出題する診療科。null はすべて';
comment on column public.profiles.filter_level is '出題するレベル。null はすべて';
comment on column public.profiles.shuffle_questions is '出題順をシャッフルするか';
