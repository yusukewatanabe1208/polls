"use client";

import { useOptimistic } from "react";
import { toggleCommentLike } from "@/app/actions";

/**
 * コメントのいいね。
 * 押した瞬間にハートと件数が変わるよう楽観更新し、サーバーの結果で上書きする。
 * （以前はサーバーアクション直結で、押しても画面が変わったように見えなかった）
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
  const [state, setState] = useOptimistic({ liked: likedByMe, count: likeCount });

  return (
    <form
      action={async (formData: FormData) => {
        setState({
          liked: !state.liked,
          count: Math.max(0, state.count + (state.liked ? -1 : 1)),
        });
        await toggleCommentLike(formData);
      }}
    >
      <input type="hidden" name="comment_id" value={commentId} />
      <input type="hidden" name="question_id" value={questionId} />
      <button
        type="submit"
        aria-pressed={state.liked}
        aria-label={state.liked ? "いいねを取り消す" : "いいね"}
        className={`-mx-2 flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm transition ${
          state.liked ? "text-rose-600" : "text-muted hover:text-rose-500"
        }`}
      >
        <span aria-hidden className="text-base leading-none">
          {state.liked ? "♥" : "♡"}
        </span>
        <span className="tabular-nums">{state.count > 0 ? state.count : ""}</span>
      </button>
    </form>
  );
}
