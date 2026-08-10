import { requestRemoval } from "@/app/actions";
import { REMOVAL_THRESHOLD } from "@/lib/limits";

/**
 * 不適切な質問の削除推奨。
 * 管理者が押すと即削除、一般ユーザーは REMOVAL_THRESHOLD 人で削除される。
 * サーバーアクションを直接指定しているので、JavaScriptが無くても動く。
 */
export function RemovalButton({
  questionId,
  requested,
  isAdmin,
}: {
  questionId: string;
  /** すでにこのユーザーが推奨済みか */
  requested: boolean;
  isAdmin: boolean;
}) {
  if (requested) {
    return (
      <p className="text-center text-xs text-muted">
        この質問に削除推奨を出しています（{REMOVAL_THRESHOLD}人に達すると削除されます）。
      </p>
    );
  }

  return (
    <form action={requestRemoval}>
      <input type="hidden" name="question_id" value={questionId} />
      <button
        type="submit"
        className="btn w-full border border-red-200 bg-red-50 text-red-700 active:bg-red-100"
      >
        不適切につき削除推奨
      </button>
      <p className="mt-1 text-center text-xs text-muted">
        {isAdmin
          ? "管理者のため、押すとすぐに削除されます。"
          : `${REMOVAL_THRESHOLD}人が推奨すると削除されます。押すと次の質問へ進みます。`}
      </p>
    </form>
  );
}
