import Link from "next/link";
import { redirect } from "next/navigation";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * 回答画面の入口。
 * - 未回答があれば、その質問へ
 * - go=question（メニューの「普通度診断」）のときは、未回答が無くても
 *   直近に回答した質問を開いて必ず質問画面にする
 * - それ以外（左上のロゴなど）は、これまで通り完了画面を出す
 */
export default async function PlayEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; go?: string }>;
}) {
  const session = await repo.getSession();
  // 未ログインは、まずログインなしのお試し（5問）へ
  if (!session) redirect("/try");
  if (!session.profile) redirect("/onboarding");

  const { go } = await searchParams;
  const profile = session.profile;

  const nextId = await repo.getNextUnansweredQuestionId(profile.id);
  if (nextId) redirect(`/play/${nextId}`);

  if (go === "question") {
    const recent = await repo.getRecentAnswers(profile.id, 1);
    if (recent[0]) redirect(`/play/${recent[0].questionId}`);
  }

  const answered = await repo.getAnsweredCount(profile.id);

  return (
    <div className="space-y-5">
      <section className="card p-6 text-center">
        <p className="text-4xl">🎉</p>
        <h1 className="mt-3 text-xl font-bold">未回答の質問がありません</h1>
        <p className="mt-2 text-muted">
          これまでに{answered}問に回答しました。
          <br />
          新しい質問が投稿されるとここに表示されます。
        </p>
        <div className="mt-6 space-y-3">
          <Link href="/questions/new" className="btn btn-primary w-full">
            質問を投稿する
          </Link>
          <Link href="/report" className="btn btn-ghost w-full">
            成績表を見る
          </Link>
        </div>
      </section>
    </div>
  );
}
