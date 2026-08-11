-- ---------------------------------------------------------------------
-- 0032: お試し5問の構成を「割れる3問・はっきり2問」にする
--
-- これまでは条件（active・研修医レベル・回答20件以上）に合うものを
-- 古い順に5問返すだけだった。たまたま全部が一方に偏った問題ばかりだと
-- 「みんな同じ答えじゃないか」で終わってしまい、普通度の面白さが伝わらない。
--
-- 多数派の割合で2つに分け、割合を決めて混ぜる。
--   多数派が70%以下（割れる問題）      … 3問
--   多数派が70%より上（はっきりした問題）… 2問
--
-- 「可能な限り」なので、片方が足りないときは残りから埋めて必ず5問返す。
-- p_limit を変えたときも 3:2 の比率を保つ（切り上げで割れる問題を優先）。
--
-- 並び順は従来どおり created_at, id の固定。お試しの回答はCookieに
-- 質問IDで持つため、呼ぶたびに顔ぶれが変わると回答が対応しなくなる。
-- ---------------------------------------------------------------------

create or replace function public.get_trial_questions(p_limit integer default 5)
returns table (
  id uuid,
  question_text text,
  option_a text,
  option_b text,
  category_id integer,
  level text
)
language sql
stable
security definer
set search_path = public
as $$
  with lim as (
    select greatest(1, least(coalesce(p_limit, 5), 20)) as n
  ),
  quota as (
    -- 割れる問題を3/5。端数は割れる側に寄せる
    select n, ceil(n * 3.0 / 5)::integer as n_low,
           n - ceil(n * 3.0 / 5)::integer as n_high
    from lim
  ),
  eligible as (
    select
      q.id, q.question_text, q.option_a, q.option_b,
      q.category_id, q.level, q.created_at,
      (select count(*) from public.votes v where v.question_id = q.id) as votes,
      (select count(*) from public.votes v
        where v.question_id = q.id and v.choice = 'A') as a_count
    from public.questions q
    where q.status = 'active'
      and q.level = 'resident'
      -- 分布を見せる意味があるので、ある程度回答が集まっているものに限る
      and (select count(*) from public.votes v where v.question_id = q.id) >= 20
  ),
  scored as (
    select
      e.*,
      -- 多数派の割合（A・Bのうち多い方）
      100.0 * greatest(e.a_count, e.votes - e.a_count) / e.votes as majority_pct
    from eligible e
  ),
  low as (  -- 割れる問題
    select s.id, s.created_at,
           row_number() over (order by s.created_at, s.id) as rn
    from scored s where s.majority_pct <= 70
  ),
  high as ( -- はっきりした問題
    select s.id, s.created_at,
           row_number() over (order by s.created_at, s.id) as rn
    from scored s where s.majority_pct > 70
  ),
  chosen as (
    select l.id from low l, quota q where l.rn <= q.n_low
    union all
    select h.id from high h, quota q where h.rn <= q.n_high
  ),
  -- 片方が足りなかったぶんを、残りから古い順に埋める
  rest as (
    select s.id, row_number() over (order by s.created_at, s.id) as rn
    from scored s
    where not exists (select 1 from chosen c where c.id = s.id)
  ),
  need as (
    select (select n from lim) - (select count(*) from chosen) as k
  ),
  final as (
    select id from chosen
    union all
    select r.id from rest r, need where r.rn <= need.k
  )
  select s.id, s.question_text, s.option_a, s.option_b, s.category_id, s.level
  from scored s
  join final f on f.id = s.id
  order by s.created_at, s.id;
$$;

grant execute on function public.get_trial_questions(integer) to anon, authenticated;
