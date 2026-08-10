"use client";

import { useFormStatus } from "react-dom";
import { toggleFavorite } from "@/app/actions";

function StarButton({ favorited }: { favorited: boolean }) {
  const { pending } = useFormStatus();
  // 送信中は反転した状態を先に見せる（体感を速くする）
  const shown = pending ? !favorited : favorited;

  return (
    <button
      type="submit"
      aria-pressed={shown}
      aria-label={favorited ? "お気に入りから外す" : "お気に入りに追加"}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl transition ${
        shown
          ? "border-amber-300 bg-amber-50 text-amber-500"
          : "border-line bg-white text-slate-300"
      }`}
    >
      ★
    </button>
  );
}

export function FavoriteButton({
  questionId,
  favorited,
}: {
  questionId: string;
  favorited: boolean;
}) {
  // サーバーアクションを直接指定することで、JSが無効でも動作する
  return (
    <form action={toggleFavorite}>
      <input type="hidden" name="question_id" value={questionId} />
      <StarButton favorited={favorited} />
    </form>
  );
}
