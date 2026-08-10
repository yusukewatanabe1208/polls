-- =====================================================================
-- 質問の対象レベル（研修医／非専門医／専門医）を追加する
--   resident       … 研修医レベル
--   non_specialist … 非専門医レベル
--   specialist     … 専門医レベル
-- 0001〜0004 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.questions
  add column if not exists level text not null default 'non_specialist';

-- 値の制約（既にある場合は付け直す）
alter table public.questions
  drop constraint if exists questions_level_check;
alter table public.questions
  add constraint questions_level_check
  check (level in ('resident', 'non_specialist', 'specialist'));

comment on column public.questions.level is
  '想定する対象レベル： resident=研修医 / non_specialist=非専門医 / specialist=専門医';

create index if not exists questions_level_idx on public.questions (level);

-- デモの質問にレベルを割り振る（内容に応じておおまかに設定）
update public.questions set level = 'resident'
where is_demo and level = 'non_specialist'
  and (question_text like '%肺炎%' or question_text like '%虫垂炎%' or question_text like '%細菌尿%');

update public.questions set level = 'specialist'
where is_demo and level = 'non_specialist'
  and (question_text like '%大動脈弁狭窄%' or question_text like '%敗血症性ショック%' or question_text like '%SGLT2%');
