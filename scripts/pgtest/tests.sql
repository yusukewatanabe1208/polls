-- ---------------------------------------------------------------------
-- setup_all.sql を流したデータベースに対する検証。
--
-- 見ているのは「アプリを信用しなくても守られているか」。
-- 画面やサーバーアクションを経由せず、ログインユーザーが直接SQLを
-- 投げたときにどうなるかを確かめる（公開キーがあれば誰でもできるため）。
-- ---------------------------------------------------------------------

\set QUIET on
set client_min_messages = warning;

create table if not exists test_results (
  seq serial primary key,
  name text not null,
  ok boolean not null,
  detail text
);
truncate test_results restart identity;

-- 結果の記録は必ず成功させたいので security definer（テスト対象ではない）
create or replace function t_ok(p_name text, p_cond boolean, p_detail text default null)
returns void language sql security definer as $$
  insert into test_results (name, ok, detail) values (p_name, coalesce(p_cond, false), p_detail);
$$;

/** SQLを実行し、権限エラー(42501)で拒否されたら合格とする */
create or replace function t_denied(p_name text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  -- 例外が出ない＝通ってしまった。RLSで0行になった場合もここに来るため後段で確認する
  perform t_ok(p_name, false, '拒否されずに実行された');
exception
  when insufficient_privilege then
    perform t_ok(p_name, true, sqlerrm);
  when others then
    perform t_ok(p_name, false, format('想定外のエラー %s: %s', sqlstate, sqlerrm));
end;
$$;

/** 権限・制約を問わず「拒否されれば合格」。CHECK違反(23514)も含む */
create or replace function t_rejected(p_name text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform t_ok(p_name, false, '拒否されずに実行された');
exception
  when insufficient_privilege or check_violation then
    perform t_ok(p_name, true, sqlerrm);
  when others then
    perform t_ok(p_name, false, format('想定外のエラー %s: %s', sqlstate, sqlerrm));
end;
$$;

-- =====================================================================
-- 準備（superuser として投入する）
-- =====================================================================
\set admin_id   '''00000000-0000-0000-0000-0000000000a1'''
\set user_id    '''00000000-0000-0000-0000-0000000000b2'''
\set other_id   '''00000000-0000-0000-0000-0000000000c3'''

insert into auth.users (id, email) values
  (:admin_id, 'admin@example.com'),
  (:user_id,  'user@example.com'),
  (:other_id, 'other@example.com');

insert into public.profiles (id, username, specialty_id, work_prefecture, real_name, occupation, is_admin)
values
  (:admin_id, 'admin_user', 1, '東京都', '管理 太郎', '医師', true),
  (:user_id,  'normal_user', 1, '東京都', '普通 花子', '医師', false),
  (:other_id, 'other_user', 2, '大阪府', '他人 次郎', '医師', false);

-- 指標テスト用に、回答者を20人そろえる（min_other_votes = 20）
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000' || lpad(i::text, 5, '0'))::uuid,
       'bulk' || i || '@example.com'
from generate_series(1, 25) i;

insert into public.profiles (id, username, specialty_id, work_prefecture, real_name, occupation)
select ('00000000-0000-0000-0000-0000000' || lpad(i::text, 5, '0'))::uuid,
       'bulk_' || i, 1, '東京都', 'まとめ ' || i, '医師'
from generate_series(1, 25) i;

insert into public.questions (id, author_id, question_text, option_a, option_b, category_id, level)
values
  ('00000000-0000-0000-0000-0000000f0001'::uuid, :admin_id,
   'これはテスト用の質問です。十分な長さがあります。', 'はい', 'いいえ', 1, 'resident'),
  ('00000000-0000-0000-0000-0000000f0002'::uuid, :admin_id,
   'これは2問目のテスト用の質問です。十分な長さ。', 'はい', 'いいえ', 2, 'specialist');

-- =====================================================================
-- 1. 権限の昇格を防げているか（0020）
-- =====================================================================
\echo '--- 1. 権限昇格の防止 ---'
set role authenticated;
select public.set_auth(:user_id);

select t_denied('一般ユーザーは自分を管理者にできない',
  format('update public.profiles set is_admin = true where id = %L', :user_id));

select t_denied('一般ユーザーは自分の利用停止を解除／設定できない',
  format('update public.profiles set is_suspended = true where id = %L', :user_id));

select t_denied('一般ユーザーは is_demo を書き換えられない',
  format('update public.profiles set is_demo = true where id = %L', :user_id));

-- 昇格が本当に起きていないこと（例外を握りつぶしていないかの二重確認）
reset role;
select t_ok('昇格の試行後も管理者になっていない',
  (select not is_admin from public.profiles where id = :user_id));
select t_ok('利用停止フラグも変わっていない',
  (select not is_suspended from public.profiles where id = :user_id));

-- 正当な更新は通る
set role authenticated;
select public.set_auth(:user_id);
update public.profiles set specialty_id = 5 where id = :user_id;
reset role;
select t_ok('専門科の変更は通る',
  (select specialty_id = 5 from public.profiles where id = :user_id));

-- 管理者による利用停止は通る
set role authenticated;
select public.set_auth(:admin_id);
update public.profiles set is_suspended = true where id = :other_id;
reset role;
select t_ok('管理者は他人を利用停止にできる',
  (select is_suspended from public.profiles where id = :other_id));

-- 後続テストのため戻す
update public.profiles set is_suspended = false where id = :other_id;

-- =====================================================================
-- 1.5 公開ビュー経由で書き換えられないか（0024）
--
-- public_profiles は security definer のビューなので、中の profiles には
-- RLSを通さずに触れてしまう。しかも profiles 1枚からの単純な select のため
-- 自動更新可能ビューになっており、GRANT が付いていると書き込み口になる。
-- anon は auth.uid() が null で 0020 のトリガーの防御も素通りするので、
-- 「GRANT が外れていること」そのものを確かめる。
-- =====================================================================
\echo '--- 1.5 公開ビューの書き込み禁止 ---'

select t_ok('公開ビューは自動更新可能（だからGRANTが要）',
  (select is_updatable = 'YES' from information_schema.views
   where table_schema = 'public' and table_name = 'public_profiles'));

set role anon;
select t_denied('未ログインは公開ビュー経由で他人を管理者にできない',
  format('update public.public_profiles set is_admin = true where id = %L', :user_id));
select t_denied('未ログインは公開ビュー経由でプロフィールを消せない',
  format('delete from public.public_profiles where id = %L', :user_id));
select t_denied('未ログインは公開ビューに行を足せない',
  'insert into public.public_profiles (id, username) values (''00000000-0000-0000-0000-0000000000d4'', ''intruder'')');
select t_ok('未ログインでも公開ビューの読み取りはできる',
  (select count(*) > 0 from public.public_profiles));
reset role;

set role authenticated;
select public.set_auth(:user_id);
select t_denied('ログイン済みでも公開ビュー経由では書き換えられない',
  format('update public.public_profiles set is_admin = true where id = %L', :user_id));
reset role;

select t_ok('公開ビュー経由の試行後も管理者になっていない',
  (select not is_admin from public.profiles where id = :user_id));
select t_ok('公開ビュー経由の試行後もプロフィールは残っている',
  (select count(*) = 1 from public.profiles where id = :user_id));

-- トリガー関数はRPCとして呼べない（0024）
set role anon;
select t_denied('未ログインはトリガー関数を直接呼べない',
  'select public.prevent_username_change()');
select t_denied('未ログインは削除依頼のトリガー関数を直接呼べない',
  'select public.apply_removal_request()');
reset role;

-- トリガー経由なら今までどおり動く（EXECUTEを外しても発火する）
set role authenticated;
select public.set_auth(:user_id);
select t_denied('EXECUTEを外してもユーザーネーム変更は止まる',
  format('update public.profiles set username = ''renamed'' where id = %L', :user_id));
reset role;

-- =====================================================================
-- 2. 他人の個人情報が読めないか（RLS）
-- =====================================================================
\echo '--- 2. 個人情報の保護 ---'
set role authenticated;
select public.set_auth(:user_id);

select t_ok('他人の profiles 行は読めない',
  (select count(*) = 0 from public.profiles where id = :other_id));
select t_ok('自分の profiles 行は読める',
  (select count(*) = 1 from public.profiles where id = :user_id));
select t_ok('公開ビューには本名の列が無い',
  (select count(*) = 0 from information_schema.columns
   where table_name = 'public_profiles'
     and column_name in ('real_name', 'license_number', 'work_prefecture')));
reset role;

-- =====================================================================
-- 3. 回答前に結果を見せない（原則§13）
-- =====================================================================
\echo '--- 3. 回答前の結果非表示 ---'
set role authenticated;
select public.set_auth(:user_id);

select t_ok('未回答なら get_question_result は行を返さない',
  (select count(*) = 0 from public.get_question_result('00000000-0000-0000-0000-0000000f0001'::uuid)));

select t_ok('未回答の質問の votes は見えない',
  (select count(*) = 0 from public.votes where question_id = '00000000-0000-0000-0000-0000000f0001'::uuid));
reset role;

-- =====================================================================
-- 4. いいね・お気に入りの切り替え（0019）
-- =====================================================================
\echo '--- 4. 切り替えRPC ---'
set role authenticated;
select public.set_auth(:user_id);

select t_ok('お気に入り：1回目は true', public.toggle_favorite('00000000-0000-0000-0000-0000000f0001'::uuid));
select t_ok('お気に入り：2回目は false', not public.toggle_favorite('00000000-0000-0000-0000-0000000f0001'::uuid));
select t_ok('お気に入り：3回目でまた true', public.toggle_favorite('00000000-0000-0000-0000-0000000f0001'::uuid));
select t_ok('お気に入りの行は1つだけ',
  (select count(*) = 1 from public.favorites
   where question_id = '00000000-0000-0000-0000-0000000f0001'::uuid and user_id = :user_id));

-- 回答してからコメント＋いいね
insert into public.votes (question_id, user_id, choice)
values ('00000000-0000-0000-0000-0000000f0001'::uuid, :user_id, 'A');

insert into public.comments (id, question_id, user_id, body)
values ('00000000-0000-0000-0000-0000000e0001'::uuid,
        '00000000-0000-0000-0000-0000000f0001'::uuid, :user_id, 'テストのコメント');

select t_ok('いいね：1回目は true', public.toggle_comment_like('00000000-0000-0000-0000-0000000e0001'::uuid));
select t_ok('いいね：2回目は false', not public.toggle_comment_like('00000000-0000-0000-0000-0000000e0001'::uuid));
reset role;

-- =====================================================================
-- 5. フィード（0021）
-- =====================================================================
\echo '--- 5. フィード ---'
set role authenticated;
select public.set_auth(:user_id);

select t_ok('フィードは active な質問を返す',
  (select count(*) = 2 from public.get_feed(100)));

select t_ok('回答済みの質問はコメント数が出る',
  (select comment_count = 1 from public.get_feed(100)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid));

select t_ok('未回答の質問はコメント数を明かさない（§13）',
  (select comment_count = 0 from public.get_feed(100)
   where id = '00000000-0000-0000-0000-0000000f0002'::uuid));

select t_ok('未回答が先に並ぶ',
  (select not answered from public.get_feed(100) limit 1));

select t_ok('投稿者名が付く',
  (select author_username = 'admin_user' from public.get_feed(100)
   where id = '00000000-0000-0000-0000-0000000f0002'::uuid));
reset role;

-- 絞り込み：カテゴリー2だけにすると、未回答のq0002だけになる
update public.profiles set filter_category_ids = array[2], shuffle_questions = false
where id = :user_id;
set role authenticated;
select public.set_auth(:user_id);
select t_ok('絞り込みが効く',
  (select count(*) = 1 from public.get_feed(100)));
reset role;

-- 条件に合う未回答が無ければ絞り込みを外す
update public.profiles set filter_category_ids = array[99] where id = :user_id;
set role authenticated;
select public.set_auth(:user_id);
select t_ok('条件に合う未回答が無ければ全件に戻す',
  (select count(*) = 2 from public.get_feed(100)));
reset role;
update public.profiles set filter_category_ids = '{}' where id = :user_id;

-- =====================================================================
-- 6. 指標の計算（要件定義§19/§24/§28）
--    metrics.ts / npm run check と同じ期待値になるか
-- =====================================================================
\echo '--- 6. 指標の計算 ---'

-- q0001：本人以外が 15A / 5B、本人はA → 一致率 75%
insert into public.votes (question_id, user_id, choice)
select '00000000-0000-0000-0000-0000000f0001'::uuid,
       ('00000000-0000-0000-0000-0000000' || lpad(i::text, 5, '0'))::uuid,
       case when i <= 15 then 'A' else 'B' end
from generate_series(1, 20) i;

-- q0002：本人以外が 10A / 10B、本人はA → 一致率 50%、多数派なし
insert into public.votes (question_id, user_id, choice)
select '00000000-0000-0000-0000-0000000f0002'::uuid,
       ('00000000-0000-0000-0000-0000000' || lpad(i::text, 5, '0'))::uuid,
       case when i <= 10 then 'A' else 'B' end
from generate_series(1, 20) i;
insert into public.votes (question_id, user_id, choice)
values ('00000000-0000-0000-0000-0000000f0002'::uuid, :user_id, 'A');

-- 普通度は直近ほど重い加重平均（0025）。
-- q0001 は一致率 15/20 = 75%、q0002 は 10/20 = 50%。回答が新しいのは q0002。
--   重み: q0002 = 1、q0001 = 0.5^(1/20) = 0.965936…
--   (50×1 + 75×0.965936) / (1 + 0.965936) = 62.2834…
select t_ok('§19 普通度は直近を重くした加重平均',
  (select round(ordinariness, 2) = 62.28 from public.get_user_ordinariness(:user_id)),
  (select ordinariness::text from public.get_user_ordinariness(:user_id)));

-- 新しい方(50%)が重いので、単純平均の62.5より下がる
select t_ok('単純平均(62.5)より新しい回答に寄る',
  (select ordinariness < 62.5 from public.get_user_ordinariness(:user_id)));

-- 古い回答もゼロにはならない（重みが0なら 50% ちょうどになるはず）
select t_ok('古い回答の影響がゼロになっていない',
  (select ordinariness > 50 from public.get_user_ordinariness(:user_id)));

select t_ok('重み関数：最新は1.0', public.recency_weight(1) = 1.0);
select t_ok('重み関数：21問前でちょうど半分',
  round(public.recency_weight(21), 4) = 0.5000,
  public.recency_weight(21)::text);
select t_ok('重み関数：100問前でもゼロにならない', public.recency_weight(100) > 0,
  public.recency_weight(100)::text);

select t_ok('§24 多数派一致率は50:50を除いて 1/1 = 100',
  (select round(majority_agreement_rate, 2) = 100.00 from public.get_user_ordinariness(:user_id)),
  (select majority_agreement_rate::text from public.get_user_ordinariness(:user_id)));

select t_ok('対象質問数は2',
  (select eligible_question_count = 2 from public.get_user_ordinariness(:user_id)));

-- §28：本人以外が19人の質問は対象外
insert into public.questions (id, author_id, question_text, option_a, option_b, category_id, level)
values ('00000000-0000-0000-0000-0000000f0003'::uuid, :admin_id,
        '本人以外が19人しか答えていない質問です。', 'はい', 'いいえ', 1, 'resident');
insert into public.votes (question_id, user_id, choice)
select '00000000-0000-0000-0000-0000000f0003'::uuid,
       ('00000000-0000-0000-0000-0000000' || lpad(i::text, 5, '0'))::uuid, 'A'
from generate_series(1, 19) i;
insert into public.votes (question_id, user_id, choice)
values ('00000000-0000-0000-0000-0000000f0003'::uuid, :user_id, 'A');

select t_ok('§28 本人以外19人の質問は対象外のまま',
  (select eligible_question_count = 2 from public.get_user_ordinariness(:user_id)),
  (select eligible_question_count::text from public.get_user_ordinariness(:user_id)));

select t_ok('§29 回答数には数える',
  (select answered_question_count = 3 from public.get_user_ordinariness(:user_id)));

-- =====================================================================
-- 7. 偏差値のスナップショット（0018）
-- =====================================================================
\echo '--- 7. 偏差値 ---'
select public.refresh_ordinariness_snapshot();

select t_ok('スナップショットに医師が入る',
  (select n > 0 from public.ordinariness_stats where id = 1),
  (select n::text from public.ordinariness_stats where id = 1));

select t_ok('標準偏差は実測されている（固定値でない）',
  (select sd is not null from public.ordinariness_stats where id = 1),
  (select sd::text from public.ordinariness_stats where id = 1));

set role authenticated;
select public.set_auth(:user_id);
select t_ok('偏差値が返る',
  (select deviation is not null from public.get_ordinariness_ranking(:user_id)),
  (select deviation::text from public.get_ordinariness_ranking(:user_id)));
select t_ok('分布は必ず10段返す',
  (select count(*) = 10 from public.get_ordinariness_distribution()));
reset role;

-- 2回目の呼び出しでは測り直さない（新しいうちは何もしない）
select t_ok('新しいうちは測り直さない',
  not public.refresh_ordinariness_snapshot_if_stale('30 minutes'));
select t_ok('古くなっていれば測り直す',
  public.refresh_ordinariness_snapshot_if_stale('0 seconds'));

-- =====================================================================
-- 6.5 質問と投稿者のまとめ取得（0023）
-- =====================================================================
\echo '--- 6.5 質問の取得 ---'
set role authenticated;
select public.set_auth(:user_id);

select t_ok('質問と投稿者を1回で取れる',
  (select author_username = 'admin_user' and question_text is not null
   from public.get_question_with_author('00000000-0000-0000-0000-0000000f0001'::uuid)));
reset role;

-- 非公開にすると、投稿者と管理者以外からは引けない
update public.questions set status = 'hidden'
where id = '00000000-0000-0000-0000-0000000f0001'::uuid;

set role authenticated;
select public.set_auth(:other_id);
select t_ok('非公開の質問は他人からは引けない',
  (select count(*) = 0 from public.get_question_with_author('00000000-0000-0000-0000-0000000f0001'::uuid)));
select public.set_auth(:admin_id);
select t_ok('非公開の質問も投稿者本人は引ける',
  (select count(*) = 1 from public.get_question_with_author('00000000-0000-0000-0000-0000000f0001'::uuid)));
reset role;
update public.questions set status = 'active'
where id = '00000000-0000-0000-0000-0000000f0001'::uuid;

-- =====================================================================
-- 7.5 まとめ取得（0022）が、個別の関数と同じ値を返すか
-- =====================================================================
\echo '--- 7.5 指標のまとめ取得 ---'
select t_ok('get_user_report の普通度が get_user_ordinariness と一致',
  (select r.ordinariness is not distinct from m.ordinariness
   from public.get_user_report(:user_id) r, public.get_user_ordinariness(:user_id) m));

select t_ok('多数派一致率も一致',
  (select r.majority_agreement_rate is not distinct from m.majority_agreement_rate
   from public.get_user_report(:user_id) r, public.get_user_ordinariness(:user_id) m));

select t_ok('対象質問数・回答数・投稿数も一致',
  (select r.eligible_question_count = m.eligible_question_count
      and r.answered_question_count = m.answered_question_count
      and r.posted_question_count = m.posted_question_count
   from public.get_user_report(:user_id) r, public.get_user_ordinariness(:user_id) m));

select t_ok('偏差値が get_ordinariness_ranking と一致',
  (select r.deviation is not distinct from k.deviation
   from public.get_user_report(:user_id) r, public.get_ordinariness_ranking(:user_id) k),
  (select deviation::text from public.get_user_report(:user_id)));

select t_ok('順位も一致',
  (select r.percentile is not distinct from k.percentile
      and r.compared_users = k.compared_users
   from public.get_user_report(:user_id) r, public.get_ordinariness_ranking(:user_id) k));

-- =====================================================================
-- 8. 未回答の質問のコメントにはいいねできない（RLSのwith check）
--    指標の集計を乱さないよう、専用の質問を最後に作る
-- =====================================================================
\echo '--- 8. いいねの権限 ---'
insert into public.questions (id, author_id, question_text, option_a, option_b, category_id, level)
values ('00000000-0000-0000-0000-0000000f0004'::uuid, :admin_id,
        'いいねの権限を確かめるための質問です。', 'はい', 'いいえ', 1, 'resident');
insert into public.votes (question_id, user_id, choice)
values ('00000000-0000-0000-0000-0000000f0004'::uuid, :other_id, 'A');
insert into public.comments (id, question_id, user_id, body)
values ('00000000-0000-0000-0000-0000000e0002'::uuid,
        '00000000-0000-0000-0000-0000000f0004'::uuid, :other_id, '別の質問のコメント');

set role authenticated;
select public.set_auth(:user_id);
select t_denied('未回答の質問のコメントにはいいねできない',
  'select public.toggle_comment_like(''00000000-0000-0000-0000-0000000e0002''::uuid)');
reset role;

-- =====================================================================
-- 9. 投稿した質問の反響（0026）
--    「回答前に割れ方を見せない」を守れているか
-- =====================================================================
\echo '--- 9. 投稿した質問の反響 ---'

-- admin_id が f0001（本人は未回答）と f0002 を投稿している。
-- user_id は両方に回答済み、other_id は f0002 のみ回答済み。

-- 投稿者本人（admin）から見る。admin は f0001 に回答していない
set role authenticated;
select public.set_auth(:admin_id);

select t_ok('投稿者は自分の質問の回答数を見られる',
  (select vote_count > 0 from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid),
  (select vote_count::text from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid));

select t_ok('投稿者でも、自分が未回答なら割れ方は見えない（§13）',
  (select a_count is null and b_count is null and comment_count is null
   from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid));

select t_ok('未回答フラグが立っている',
  (select not viewer_answered from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid));
reset role;

-- 投稿者が回答すると割れ方が見えるようになる
insert into public.votes (question_id, user_id, choice)
values ('00000000-0000-0000-0000-0000000f0001'::uuid, :admin_id, 'A');

set role authenticated;
select public.set_auth(:admin_id);
select t_ok('回答すると割れ方が見えるようになる',
  (select a_count is not null and b_count is not null
   from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid));
select t_ok('A/Bの合計が回答数と一致する',
  (select a_count + b_count = vote_count
   from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid));
reset role;

-- 他人から見ると回答数は出ない
set role authenticated;
select public.set_auth(:other_id);
select t_ok('他人には投稿者の質問の回答数を出さない',
  (select vote_count is null from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0001'::uuid));
reset role;

-- 非公開の質問は他人には出さない
update public.questions set status = 'hidden'
where id = '00000000-0000-0000-0000-0000000f0002'::uuid;

set role authenticated;
select public.set_auth(:other_id);
select t_ok('非公開の質問は他人の一覧に出ない',
  (select count(*) = 0 from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0002'::uuid));
select public.set_auth(:admin_id);
select t_ok('非公開の質問も投稿者本人には出る',
  (select count(*) = 1 from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0002'::uuid));
reset role;
update public.questions set status = 'active'
where id = '00000000-0000-0000-0000-0000000f0002'::uuid;

-- 削除済みは誰にも出さない
update public.questions set status = 'deleted'
where id = '00000000-0000-0000-0000-0000000f0004'::uuid;
set role authenticated;
select public.set_auth(:admin_id);
select t_ok('削除済みの質問は投稿者にも出ない',
  (select count(*) = 0 from public.get_authored_questions(:admin_id)
   where id = '00000000-0000-0000-0000-0000000f0004'::uuid));
reset role;

-- =====================================================================
-- 10. お試しの成績（0027）
--     未ログイン(anon)から呼べること、まとめて取れることを確かめる
-- =====================================================================
\echo '--- 10. お試しの成績 ---'
set role anon;

select t_ok('未ログインでもお試しの質問を引ける',
  (select count(*) > 0 from public.get_trial_questions(5)));

select t_ok('未ログインでも複数問の分布をまとめて取れる',
  (select count(*) = 2 from public.get_trial_results(array[
    '00000000-0000-0000-0000-0000000f0001'::uuid,
    '00000000-0000-0000-0000-0000000f0002'::uuid])));

select t_ok('A/Bの合計が回答数と一致する',
  (select bool_and(a_count + b_count = vote_count)
   from public.get_trial_results(array[
     '00000000-0000-0000-0000-0000000f0001'::uuid,
     '00000000-0000-0000-0000-0000000f0002'::uuid])));

-- 非公開の質問はお試しの成績に出さない
-- （非公開にする操作は anon ではできないので、いったんロールを戻す）
reset role;
update public.questions set status = 'hidden'
where id = '00000000-0000-0000-0000-0000000f0002'::uuid;
set role anon;
select t_ok('非公開の質問は分布を返さない',
  (select count(*) = 0 from public.get_trial_results(array[
    '00000000-0000-0000-0000-0000000f0002'::uuid])));
reset role;
update public.questions set status = 'active'
where id = '00000000-0000-0000-0000-0000000f0002'::uuid;

-- ---------------------------------------------------------------------
-- お試しのコメント（0028）
--   公開するのは「お試しで出している質問」だけに限られているか
-- ---------------------------------------------------------------------
reset role;
-- f0001 をお試しの条件（研修医レベル・回答20件以上）に合わせる
update public.questions set level = 'resident'
where id = '00000000-0000-0000-0000-0000000f0001'::uuid;

set role anon;
select t_ok('未ログインでもお試し質問のコメントを読める',
  (select count(*) > 0 from public.get_trial_comments(
    '00000000-0000-0000-0000-0000000f0001'::uuid, 20)),
  (select count(*)::text from public.get_trial_comments(
    '00000000-0000-0000-0000-0000000f0001'::uuid, 20)));

select t_ok('投稿者名と選択が付く',
  (select author_username <> 'unknown' and author_choice is not null
   from public.get_trial_comments('00000000-0000-0000-0000-0000000f0001'::uuid, 20)
   limit 1));

select t_ok('戻り値に user_id を含めない',
  (select count(*) = 0 from information_schema.columns
   where table_schema = 'public'
     and table_name = 'get_trial_comments'
     and column_name = 'user_id'));
reset role;

-- お試しの条件から外れた質問のコメントは出さない
update public.questions set level = 'specialist'
where id = '00000000-0000-0000-0000-0000000f0001'::uuid;
set role anon;
select t_ok('お試し対象外の質問のコメントは読めない',
  (select count(*) = 0 from public.get_trial_comments(
    '00000000-0000-0000-0000-0000000f0001'::uuid, 20)));
reset role;
update public.questions set level = 'resident'
where id = '00000000-0000-0000-0000-0000000f0001'::uuid;

-- 非公開の質問も出さない
update public.questions set status = 'hidden'
where id = '00000000-0000-0000-0000-0000000f0001'::uuid;
set role anon;
select t_ok('非公開の質問のコメントは読めない',
  (select count(*) = 0 from public.get_trial_comments(
    '00000000-0000-0000-0000-0000000f0001'::uuid, 20)));
reset role;
update public.questions set status = 'active'
where id = '00000000-0000-0000-0000-0000000f0001'::uuid;

set role anon;
-- お試しでは個票は出さない（誰が何を選んだかは返らない）
select t_ok('お試しの戻り値に user_id が含まれない',
  (select count(*) = 0 from information_schema.columns
   where table_schema = 'public'
     and column_name = 'user_id'
     and table_name = 'get_trial_results'));

-- =====================================================================
-- 11. プロフィールの文字数制限（0029）
--     画面を通さず直接 update しても効くか
-- =====================================================================
\echo '--- 11. 文字数制限 ---'
set role authenticated;
select public.set_auth(:user_id);

-- 本名は登録後トリガーで変更禁止のため、制限が効くのは新規登録のとき。
-- superuser として insert し、CHECK制約そのものを確かめる。
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e5');
select t_rejected('本名は50文字を超えて登録できない',
  'insert into public.profiles (id, username, specialty_id, work_prefecture, real_name)
   values (''00000000-0000-0000-0000-0000000000e5'', ''too_long_name'', 1, ''東京都'', repeat(''あ'', 51))');

set role authenticated;
select public.set_auth(:user_id);

select t_rejected('医籍登録番号は20桁を超えられない',
  format('update public.profiles set license_number = repeat(''1'', 21) where id = %L', :user_id));

select t_rejected('医籍登録番号に数字以外は入れられない',
  format('update public.profiles set license_number = ''12ab'' where id = %L', :user_id));

-- 範囲内なら通る
update public.profiles set license_number = '1234567890' where id = :user_id;
reset role;
select t_ok('20桁以内の数字は通る',
  (select license_number = '1234567890' from public.profiles where id = :user_id));

set role authenticated;
select public.set_auth(:user_id);
update public.profiles set license_number = '' where id = :user_id;
reset role;
select t_ok('未入力（空）も通る',
  (select license_number = '' from public.profiles where id = :user_id));

-- =====================================================================
-- 12. 運営への要望（0029）
-- =====================================================================
\echo '--- 12. 運営への要望 ---'
set role authenticated;
select public.set_auth(:user_id);

insert into public.feedback (user_id, body) values (:user_id, 'テストの要望です');
select t_ok('本人は要望を送れる',
  (select count(*) = 1 from public.feedback where user_id = :user_id));

select t_denied('他人になりすまして送れない',
  format('insert into public.feedback (user_id, body) values (%L, ''なりすまし'')', :other_id));

select t_rejected('空の要望は送れない',
  format('insert into public.feedback (user_id, body) values (%L, '''')', :user_id));

select t_rejected('1000文字を超える要望は送れない',
  format('insert into public.feedback (user_id, body) values (%L, repeat(''あ'', 1001))', :user_id));

-- 他人の要望は読めない
select public.set_auth(:other_id);
select t_ok('他人の要望は読めない',
  (select count(*) = 0 from public.feedback));
select t_ok('管理者でなければ一覧RPCも空',
  (select count(*) = 0 from public.get_feedback(100)));

-- 管理者は読める
select public.set_auth(:admin_id);
select t_ok('管理者は要望を読める',
  (select count(*) = 1 from public.get_feedback(100)));
select t_ok('一覧には投稿者のユーザーネームが付く',
  (select author_username = 'normal_user' from public.get_feedback(100) limit 1));

-- 一般ユーザーは対応済みにできない
-- RLSでは「見えない行」は更新対象にならず0行更新になる（例外にはならない）。
-- 実際に状態が変わっていないことで確かめる。
select public.set_auth(:other_id);
update public.feedback set status = 'resolved';
reset role;
select t_ok('一般ユーザーは他人の要望の状態を変えられない',
  (select status = 'open' from public.feedback where user_id = :user_id));

-- =====================================================================
-- 結果
-- =====================================================================
\set QUIET off
\echo ''
\pset border 2
select seq, case when ok then 'PASS' else 'FAIL' end as result, name, detail
from test_results order by seq;

\echo ''
select count(*) filter (where ok) || ' / ' || count(*) || ' 件が成功' as summary
from test_results;

do $$
declare v_failed integer;
begin
  select count(*) into v_failed from test_results where not ok;
  if v_failed > 0 then
    raise exception '% 件のテストが失敗しました', v_failed;
  end if;
end;
$$;
