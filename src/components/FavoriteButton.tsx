"use client";

import { toggleFavorite } from "@/app/actions";
import { useToggle } from "@/lib/useToggle";

/**
 * お気に入り（★）。
 * いいねと同じく、押した瞬間に見た目が変わり通信は待たない。
 */
export function FavoriteButton({
  questionId,
  favorited,
}: {
  questionId: string;
  favorited: boolean;
}) {
  const { on, toggle } = useToggle("favorite", questionId, favorited);

  return (
    // action にサーバーアクションを渡してあるので、JSが無い環境でも動く
    <form action={toggleFavorite} onSubmit={toggle}>
      <input type="hidden" name="question_id" value={questionId} />
      <button
        type="submit"
        aria-pressed={on}
        aria-label={on ? "お気に入りから外す" : "お気に入りに追加"}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl transition active:scale-95 ${
          on
            ? "border-amber-300 bg-amber-50 text-amber-500"
            : "border-line bg-white text-slate-300"
        }`}
      >
        ★
      </button>
    </form>
  );
}
