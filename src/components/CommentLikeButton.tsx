"use client";

import { toggleCommentLike } from "@/app/actions";
import { useToggle } from "@/lib/useToggle";

/**
 * コメントのいいね。
 *
 * 押した瞬間にハートと件数が変わり、通信は裏で進む（useToggle）。
 * サーバー側は toggle_comment_like RPC の1往復だけで終わる。
 */
export function CommentLikeButton({
  commentId,
  questionId,
  likeCount,
  likedByMe,
}: {
  commentId: string;
  questionId: string;
  likeCount: number;
  likedByMe: boolean;
}) {
  const { on, toggle } = useToggle("like", commentId, likedByMe);
  // 自分の分だけ足し引きする（他の人の増減はページを開き直したときに反映される）
  const count = Math.max(0, likeCount + (on ? 1 : 0) - (likedByMe ? 1 : 0));

  return (
    // action にサーバーアクションを渡してあるので、JSが無い環境でも動く
    <form action={toggleCommentLike} onSubmit={toggle}>
      <input type="hidden" name="comment_id" value={commentId} />
      <input type="hidden" name="question_id" value={questionId} />
      <button
        type="submit"
        aria-pressed={on}
        aria-label={on ? "いいねを取り消す" : "いいね"}
        className={`-mx-2 flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm transition active:scale-95 ${
          on ? "text-rose-600" : "text-muted hover:text-rose-500"
        }`}
      >
        <span aria-hidden className="text-base leading-none">
          {on ? "♥" : "♡"}
        </span>
        <span className="tabular-nums">{count > 0 ? count : ""}</span>
      </button>
    </form>
  );
}
