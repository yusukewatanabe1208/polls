import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** 回答履歴は10問ずつ表示する */
const PAGE_SIZE = 10;

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; shown?: string }>;
}) {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");

  const { after, shown } = await searchParams;
  const me = session.profile;

  // 「もっと見る」で10問ずつ増やす
  const requested = Number(shown);
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.ceil(requested / PAGE_SIZE) * PAGE_SIZE, 500)
      : PAGE_SIZE;

  // 指標は1回の問い合わせでまとめて取る（0022）
  const [report, answers, minOtherVotes, distribution] = await Promise.all([
    repo.getUserReport(me.id),
    // 次があるか判定するため1件多く取る
    repo.getRecentAnswers(me.id, limit + 1),
    repo.getMinOtherVotes(),
    repo.getOrdinarinessDistribution(),
  ]);

  const hasMore = answers.length > limit;
  const recent = answers.slice(0, limit);

  return (
    <ReportView
      report={report}
      answers={recent}
      distribution={distribution}
      minOtherVotes={minOtherVotes}
      subtitle={
        after
          ? `${after}問回答しました。ここまでの成績です。`
          : `これまでに${report.answered_question_count}問回答しています。`
      }
      answerHref={(id) => `/play/${id}`}
      footer={
        <div className="space-y-3">
          {hasMore && (
            <Link
              href={`/report?shown=${limit + PAGE_SIZE}${after ? `&after=${after}` : ""}`}
              className="btn btn-ghost w-full"
              scroll={false}
            >
              さらに{PAGE_SIZE}問を見る
            </Link>
          )}
          <Link href="/play" className="btn btn-primary w-full">
            次の質問へ →
          </Link>
          {/* メニューから外した画面へは、ここから行けるようにしておく */}
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/profile/${me.username}`} className="btn btn-ghost">
              プロフィール
            </Link>
            <Link href="/favorites" className="btn btn-ghost">
              お気に入り
            </Link>
          </div>
        </div>
      }
    />
  );
}
