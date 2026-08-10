import Link from "next/link";
import { deleteComment, toggleCommentLike } from "@/app/actions";
import { specialtyName } from "@/lib/master";
import type { CommentView } from "@/lib/repo/shapes";
import { CommentForm } from "./CommentForm";

/** いいねボタン（サーバーアクション直結なのでJavaScriptが無くても動く） */
function LikeButton({
  comment,
  questionId,
}: {
  comment: CommentView;
  questionId: string;
}) {
  return (
    <form action={toggleCommentLike}>
      <input type="hidden" name="comment_id" value={comment.id} />
      <input type="hidden" name="question_id" value={questionId} />
      <button
        type="submit"
        aria-pressed={comment.likedByMe}
        aria-label={comment.likedByMe ? "いいねを取り消す" : "いいね"}
        className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
          comment.likedByMe
            ? "border-rose-300 bg-rose-50 text-rose-600"
            : "border-line bg-white text-muted"
        }`}
      >
        <span aria-hidden>{comment.likedByMe ? "♥" : "♡"}</span>
        <span className="tabular-nums">{comment.likeCount}</span>
      </button>
    </form>
  );
}

function CommentBody({
  comment,
  questionId,
  currentUserId,
  isAdmin,
  canPost,
  replies,
}: {
  comment: CommentView;
  questionId: string;
  currentUserId: string;
  isAdmin: boolean;
  canPost: boolean;
  replies: CommentView[];
}) {
  const replyToggleId = `reply-${comment.id}`;

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/profile/${comment.authorUsername}`}
            className="font-semibold hover:underline"
          >
            @{comment.authorUsername}
          </Link>
          <span className="text-muted">
            {specialtyName(comment.authorSpecialtyId)}
          </span>
          {comment.authorChoice && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">
              {comment.authorChoice === "A" ? "はい" : "いいえ"}
            </span>
          )}
        </span>
        {(comment.user_id === currentUserId || isAdmin) && (
          <form action={deleteComment}>
            <input type="hidden" name="comment_id" value={comment.id} />
            <input type="hidden" name="question_id" value={questionId} />
            <button type="submit" className="text-muted hover:text-red-600">
              削除
            </button>
          </form>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>

      <div className="mt-2 flex items-center gap-2">
        <LikeButton comment={comment} questionId={questionId} />
        {canPost && (
          <>
            {/* 返信欄はCSSで開閉するのでJavaScript不要 */}
            <input type="checkbox" id={replyToggleId} className="peer sr-only" />
            <label
              htmlFor={replyToggleId}
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted"
            >
              返信
            </label>
            <div className="hidden w-full peer-checked:block">
              <CommentForm
                questionId={questionId}
                parentId={comment.id}
                placeholder={`@${comment.authorUsername} への返信`}
              />
            </div>
          </>
        )}
      </div>

      {replies.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-line pl-3">
          {replies.map((r) => (
            <li key={r.id}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/profile/${r.authorUsername}`}
                    className="font-semibold hover:underline"
                  >
                    @{r.authorUsername}
                  </Link>
                  <span className="text-muted">
                    {specialtyName(r.authorSpecialtyId)}
                  </span>
                </span>
                {(r.user_id === currentUserId || isAdmin) && (
                  <form action={deleteComment}>
                    <input type="hidden" name="comment_id" value={r.id} />
                    <input type="hidden" name="question_id" value={questionId} />
                    <button
                      type="submit"
                      className="text-muted hover:text-red-600"
                    >
                      削除
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                {r.body}
              </p>
              <div className="mt-1">
                <LikeButton comment={r} questionId={questionId} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function CommentSection({
  questionId,
  comments,
  currentUserId,
  isAdmin,
  canPost,
}: {
  questionId: string;
  comments: CommentView[];
  currentUserId: string;
  isAdmin: boolean;
  canPost: boolean;
}) {
  // 親コメントはいいねの多い順、返信は投稿順
  const roots = comments
    .filter((c) => !c.parentId)
    .sort(
      (a, b) =>
        b.likeCount - a.likeCount ||
        Date.parse(a.created_at) - Date.parse(b.created_at),
    );
  const repliesOf = (id: string) =>
    comments
      .filter((c) => c.parentId === id)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  return (
    <section className="card p-6">
      <h2 className="font-semibold">
        コメント
        <span className="ml-2 text-sm font-normal text-muted">
          {comments.length}件
        </span>
      </h2>
      <p className="mt-1 text-xs text-muted">
        コメントは回答を確定した人だけが読み書きできます。
      </p>

      <ul className="mt-4 space-y-3">
        {roots.length === 0 && (
          <li className="text-sm text-muted">まだコメントはありません。</li>
        )}
        {roots.map((c) => (
          <CommentBody
            key={c.id}
            comment={c}
            questionId={questionId}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            canPost={canPost}
            replies={repliesOf(c.id)}
          />
        ))}
      </ul>

      {canPost && (
        <div className="mt-5 border-t border-line pt-4">
          <CommentForm questionId={questionId} />
        </div>
      )}
    </section>
  );
}
