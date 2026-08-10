import Link from "next/link";
import { redirect } from "next/navigation";
import { QuestionCard } from "@/components/QuestionCard";
import { displayScore } from "@/lib/metrics";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ all_answered?: string }>;
}) {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");

  const { all_answered } = await searchParams;
  const profile = session.profile;
  const [feed, metrics] = await Promise.all([
    repo.getFeed(profile.id),
    repo.getUserMetrics(profile.id),
  ]);
  const unanswered = feed.filter((f) => !f.answered);

  return (
    <div className="space-y-5">
      <section className="card flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs text-muted">あなたの普通度</p>
          <p className="text-4xl font-bold leading-none">
            {displayScore(metrics.ordinariness)}
          </p>
          <p className="mt-1 text-xs text-muted">
            多数派一致率 {displayScore(metrics.majority_agreement_rate)}
            {metrics.majority_agreement_rate !== null && "%"}　/　回答数{" "}
            {metrics.answered_question_count}
          </p>
        </div>
        <Link href={`/profile/${profile.username}`} className="btn btn-ghost">
          プロフィール
        </Link>
      </section>

      {all_answered && (
        <p className="rounded-lg bg-brand-soft p-3 text-sm text-brand">
          未回答の質問がなくなりました。新しい質問を投稿してみませんか？
        </p>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">
          質問フィード
          <span className="ml-2 text-sm font-normal text-muted">
            未回答 {unanswered.length}件
          </span>
        </h1>
        <Link href="/questions/new" className="btn btn-ghost !py-1.5 text-sm">
          質問を投稿
        </Link>
      </div>

      {feed.length === 0 ? (
        <p className="card p-6 text-sm text-muted">まだ質問がありません。</p>
      ) : (
        <div className="space-y-4">
          {feed.map((item) => (
            <QuestionCard key={item.question.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
