import Link from "next/link";
import { deleteComment } from "@/app/actions";
import { specialtyName } from "@/lib/master";
import type { CommentView } from "@/lib/repo/shapes";
import { CommentActions } from "./CommentActions";
import { CommentForm } from "./CommentForm";
import { CommentLikeButton } from "./CommentLikeButton";

/**
 * コメント欄。
 * スマホで使えるよう、X（旧Twitter）のように縦に積む構成にしている。
 *   @ユーザー名（診療科・回答）
 *   本文
 *   ♡いいね ／ 返信      ← 小さなアクション行
 *   （返信フォームは横に並べず、下に全幅で開く）
 *   └ 返信（左の線で1段下げる。返信の返信は作らない）
 */

function AuthorLine({
  comment,
  questionId,
  currentUserId,
  isAdmin,
}: {
  comment: CommentView;
  questionId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 text-xs">
        <Link
          href={`/profile/${comment.authorUsername}`}
          className="font-semibold hover:underline"
        >
          @{comment.authorUsername}
        </Link>
        <span className="ml-2 text-muted">
          {specialtyName(comment.authorSpecialtyId)}
        </span>
        {comment.authorChoice && (
          <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-brand">
            {comment.authorChoice === "A" ? "はい" : "いいえ"}
          </span>
        )}
      </div>
      {(comment.user_id === currentUserId || isAdmin) && (
        <form action={deleteComment} className="shrink-0">
          <input type="hidden" name="comment_id" value={comment.id} />
          <input type="hidden" name="question_id" value={questionId} />
          <button
            type="submit"
            className="min-h-9 px-1 text-xs text-muted hover:text-red-600"
          >
            削除
          </button>
        </form>
      )}
    </div>
  );
}

function Comment({
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
  return (
    <li className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <AuthorLine
        comment={comment}
        questionId={questionId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />

      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
        {comment.body}
      </p>

      {/* いいねと返信。返信フォームはこの下に全幅で開く */}
      <CommentActions
        commentId={comment.id}
        questionId={questionId}
        likeCount={comment.likeCount}
        likedByMe={comment.likedByMe}
        authorUsername={comment.authorUsername}
        canReply={canPost}
      />

      {replies.length > 0 && (
        <ul className="mt-3 space-y-3 border-l-2 border-line pl-3">
          {replies.map((r) => (
            <li key={r.id}>
              <AuthorLine
                comment={r}
                questionId={questionId}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                {r.body}
              </p>
              <div className="mt-0.5">
                <CommentLikeButton
                  commentId={r.id}
                  questionId={questionId}
                  likeCount={r.likeCount}
                  likedByMe={r.likedByMe}
                />
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
  // 投稿順に並べる（いいね数で並べ替えると、押した瞬間に位置が動いて分かりにくい）
  const byTime = (a: CommentView, b: CommentView) =>
    Date.parse(a.created_at) - Date.parse(b.created_at);
  const roots = comments.filter((c) => !c.parentId).sort(byTime);
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parentId === id).sort(byTime);

  return (
    <section className="card p-5">
      <h2 className="font-semibold">
        コメント
        <span className="ml-2 text-sm font-normal text-muted">
          {comments.length}件
        </span>
      </h2>
      <p className="mt-1 text-xs text-muted">
        コメントは回答を確定した人だけが読み書きできます。
      </p>

      {canPost && (
        <div className="mt-4">
          <CommentForm questionId={questionId} />
        </div>
      )}

      <ul className="mt-5 space-y-3">
        {roots.length === 0 && (
          <li className="text-sm text-muted">まだコメントはありません。</li>
        )}
        {roots.map((c) => (
          <Comment
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
    </section>
  );
}
