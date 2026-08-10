"use client";

import { useState } from "react";
import { CommentForm } from "./CommentForm";
import { CommentLikeButton } from "./CommentLikeButton";

/**
 * コメントのアクション行（いいね／返信）と、返信フォーム。
 *
 * 返信フォームは必ず「アクション行の下」に全幅で開く。
 * 以前はCSSの兄弟セレクタで開閉していて、横並びの行の中に入り込み、
 * スマホでは幅が潰れて書きにくかった。ここでは縦に積む構造そのものにしている。
 */
export function CommentActions({
  commentId,
  questionId,
  likeCount,
  likedByMe,
  authorUsername,
  canReply,
}: {
  commentId: string;
  questionId: string;
  likeCount: number;
  likedByMe: boolean;
  authorUsername: string;
  canReply: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="mt-0.5 flex items-center gap-4">
        <CommentLikeButton
          commentId={commentId}
          questionId={questionId}
          likeCount={likeCount}
          likedByMe={likedByMe}
        />
        {canReply && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`-mx-2 flex min-h-9 items-center rounded-full px-2 text-sm transition ${
              open ? "text-brand" : "text-muted hover:text-brand"
            }`}
          >
            {open ? "返信をとじる" : "返信"}
          </button>
        )}
      </div>

      {canReply && open && (
        <div className="mt-2 w-full">
          <p className="mb-1 text-xs text-muted">@{authorUsername} への返信</p>
          <CommentForm
            questionId={questionId}
            parentId={commentId}
            placeholder="返信を入力（500文字まで）"
            autoFocus
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
