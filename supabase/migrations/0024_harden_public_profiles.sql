-- ---------------------------------------------------------------------
-- 0024: public_profiles への書き込み経路を閉じ、トリガー関数をRPCから隠す
--
-- ■ public_profiles の穴
-- public_profiles は「他人については公開項目だけ見せる」ための読み取り専用の
-- ビューのつもりだったが、実際には次の3つが重なって書き込み経路になっていた。
--
--   1. ビューが security definer（security_invoker = false）で、
--      中の profiles には所有者の権限で触る＝profiles のRLSを通らない
--   2. profiles 1枚から素直に select しているだけなので、
--      PostgreSQL が自動更新可能ビューとみなす（is_updatable = YES）
--   3. Supabase の既定で anon・authenticated に ALL が GRANT されている
--
-- この結果、公開キーさえあれば未ログインからでも
--     PATCH /rest/v1/public_profiles?id=eq.<誰でも>   {"is_admin": true}
--     DELETE /rest/v1/public_profiles?id=eq.<誰でも>
-- が通ってしまう。ビューには is_admin 列があるため、他人を管理者にすることも、
-- プロフィールを消すこともできる状態だった。
--
-- 0020 で入れた prevent_username_change トリガーは
--   「auth.uid() が null なら素通し（service_role・SQL Editor のため）」
-- という条件なので、auth.uid() が null になる anon はこの防御をすり抜ける。
-- つまりトリガーだけでは塞げず、GRANT を外す必要がある。
--
-- security_invoker = true にする案もあるが、それだと profiles のRLS
-- （自分の行だけ）が効いて他人のユーザーネームが引けなくなり、
-- コメント一覧・ランキング・投稿者名の表示が全部壊れる。
-- このビューは「読ませるために意図して definer にしている」ものなので、
-- definer のまま SELECT だけに絞るのが筋が通る。
--
-- ■ トリガー関数がRPCとして公開されている件
-- apply_removal_request / prune_demo_votes / prevent_username_change は
-- トリガーから呼ばれる関数で、/rest/v1/rpc/... から直接呼ぶ意味はない。
-- 呼べる状態にしておく理由が無いので外す。
-- トリガー経由の実行には EXECUTE 権限は要らない（PostgreSQL は
-- CREATE TRIGGER の時点で見て、発火時には見ない）ので、動作には影響しない。
--
-- 同じ指摘が public.rls_auto_enable にも出るが、これは Supabase 側が
-- 用意したイベントトリガー関数でこちらの所有物ではない。ローカルの
-- pgtest環境には存在せず、本番でも所有者でなければ revoke できないため、
-- 「あって、かつ外せるなら外す」形にしてある。
-- ---------------------------------------------------------------------

-- public_profiles は読み取り専用にする
revoke insert, update, delete, truncate, references
  on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- トリガー関数はRPCから呼べないようにする
revoke execute on function public.apply_removal_request()
  from anon, authenticated, public;
revoke execute on function public.prune_demo_votes()
  from anon, authenticated, public;
revoke execute on function public.prevent_username_change()
  from anon, authenticated, public;

-- Supabase 側の関数。無い環境・権限が無い環境では黙って見送る。
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable()
      from anon, authenticated, public;
  end if;
exception
  when insufficient_privilege then
    raise notice 'rls_auto_enable の権限を変更できませんでした（所有者ではないため）';
end;
$$;
