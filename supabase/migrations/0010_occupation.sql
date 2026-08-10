-- =====================================================================
-- 職業（コメディカルの利用に対応）
--   医師だけでなく、看護師・薬剤師・理学療法士・臨床工学技士なども利用できるようにする
-- 0001〜0009 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.profiles
  add column if not exists occupation text not null default '医師';

alter table public.profiles
  drop constraint if exists profiles_occupation_check;
alter table public.profiles
  add constraint profiles_occupation_check
  check (occupation in (
    '医師','歯科医師','看護師','保健師','助産師','薬剤師',
    '理学療法士','作業療法士','言語聴覚士','臨床工学技士（ME）',
    '診療放射線技師','臨床検査技師','管理栄養士','救急救命士',
    '公認心理師・臨床心理士','医療事務','学生','その他'
  ));

comment on column public.profiles.occupation is '職業。公開情報';

create index if not exists profiles_occupation_idx on public.profiles (occupation);

-- 公開ビューに職業を含める（列構成が変わるので作り直す）
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
  select id, username, specialty_id, occupation, is_physician, is_admin, created_at
  from public.profiles
  where is_suspended = false;

grant select on public.public_profiles to authenticated, anon;
