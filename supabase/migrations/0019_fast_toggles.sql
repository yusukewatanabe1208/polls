-- ---------------------------------------------------------------------
-- 0019: いいね・お気に入りの切り替えを1往復にする
--
-- これまでは、いいね1回につきサーバー側で次の順に待っていた。
--   1. auth.getUser()         … Authサーバーへの問い合わせ
--   2. profiles を1件取得      … 押した人の判定
--   3. comment_likes を検索    … すでに押しているか
--   4. insert または delete
-- どれもネットワーク往復なので、合計すると押してから数百ミリ秒かかっていた。
--
-- ここでは 3と4 をDB内の1関数にまとめ、押した人は auth.uid() から取る。
-- アプリ側は「RPCを1回呼ぶ」だけになる。
--
-- security definer にはしない（既定の invoker のまま）。
-- そうすることで「回答済みの質問のコメントにしか いいね できない」等の
-- 既存のRLSポリシーがこれまでどおり効く。
-- ---------------------------------------------------------------------

/**
 * コメントのいいねを切り替える。押した後の状態（true=いいね中）を返す。
 */
create or replace function public.toggle_comment_like(p_comment_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_removed boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.comment_likes
  where comment_id = p_comment_id and user_id = v_user
  returning true into v_removed;

  if coalesce(v_removed, false) then
    return false;
  end if;

  -- 二重送信で落ちないように on conflict で受け止める
  insert into public.comment_likes (comment_id, user_id)
  values (p_comment_id, v_user)
  on conflict (comment_id, user_id) do nothing;

  return true;
end;
$$;

/**
 * お気に入りを切り替える。押した後の状態（true=お気に入り中）を返す。
 */
create or replace function public.toggle_favorite(p_question_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_removed boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.favorites
  where question_id = p_question_id and user_id = v_user
  returning true into v_removed;

  if coalesce(v_removed, false) then
    return false;
  end if;

  insert into public.favorites (question_id, user_id)
  values (p_question_id, v_user)
  on conflict (question_id, user_id) do nothing;

  return true;
end;
$$;

grant execute on function public.toggle_comment_like(uuid) to authenticated;
grant execute on function public.toggle_favorite(uuid) to authenticated;
