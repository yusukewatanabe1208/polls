-- =====================================================================
-- ダミーデータの削除（Supabase側）
-- ローカル版と同じく、ダミーデータには is_demo = true が付きます。
-- 実データには付かないため、ダミーだけを安全に削除できます。
-- =====================================================================

-- 1) 件数の確認
select
  (select count(*) from public.profiles  where is_demo) as demo_profiles,
  (select count(*) from public.questions where is_demo) as demo_questions,
  (select count(*) from public.votes     where is_demo) as demo_votes,
  (select count(*) from public.comments  where is_demo) as demo_comments,
  (select count(*) from public.votes     where not is_demo) as real_votes;

-- 2) ダミー医師の投票・コメントのみ削除（質問とアカウントは残す）
-- delete from public.comments where is_demo;
-- delete from public.votes    where is_demo;

-- 3) ダミーデータをすべて削除
--    （ダミー質問に付いた実ユーザーの回答・コメントも外部キーの連鎖で消えます）
-- delete from public.comments  where is_demo;
-- delete from public.votes     where is_demo;
-- delete from public.questions where is_demo;
-- delete from auth.users u where exists (
--   select 1 from public.profiles p where p.id = u.id and p.is_demo
-- );   -- profiles は auth.users の削除に連動して消えます

-- =====================================================================
-- 自分を管理者にする（§38の管理画面を使うため）
-- =====================================================================
-- update public.profiles set is_admin = true where username = 'あなたのユーザーネーム';
