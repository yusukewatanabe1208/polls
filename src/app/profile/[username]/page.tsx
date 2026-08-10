import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { categoryName, specialtyName } from "@/lib/master";
import { displayScore } from "@/lib/metrics";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");

  const { username } = await params;
  const profile = await repo.getProfileByUsername(decodeURIComponent(username));
  if (!profile) notFound();

  const isMe = profile.id === session.profile.id;
  const [metrics, authored, min, receivedLikes, myComments, ranking] =
    await Promise.all([
      repo.getUserMetrics(profile.id),
      repo.getQuestionsByAuthor(profile.id),
      repo.getMinOtherVotes(),
      repo.getReceivedLikeCount(profile.id),
      repo.getMyComments(profile.id, 20),
      repo.getRanking(profile.id),
    ]);
  const questions = authored.filter(
    (q) => q.status === "active" || isMe || session.profile!.is_admin,
  );

  return (
    <div className="space-y-5">
      <section className="card p-6 text-center">
        <h1 className="text-xl font-bold">@{profile.username}</h1>
        <p className="text-sm text-muted">
          {profile.occupation ?? "医師"}
          <span className="mx-1">·</span>
          {specialtyName(profile.specialty_id)}
        </p>
        {(profile.occupation ?? "医師") !== "医師" && (
          <p className="mt-1 text-xs text-muted">
            普通度・偏差値は医師の回答と比べた値です。
          </p>
        )}

        {ranking.rankLevel && (
          <div className="mt-5">
            {/* 成績表と同じ称号カード */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/ranks/level-${ranking.rankLevel}.webp`}
              alt={`${ranking.rankLabel}のカード`}
              width={150}
              height={256}
              className="mx-auto w-[150px] rounded-xl shadow-sm"
            />
            <p className="mt-2 text-xl font-bold leading-tight">
              {ranking.rankLabel}
            </p>
            <p className="text-sm text-muted">
              偏差値 {displayScore(ranking.deviation)}
            </p>
          </div>
        )}

        <div className="mt-8">
          <p className="text-sm text-muted">
            {isMe ? "あなたの普通度" : "普通度"}
          </p>
          <p className="text-7xl font-bold leading-none tracking-tight">
            {displayScore(metrics.ordinariness)}
          </p>
          <p className="mt-3 text-sm text-muted">
            {metrics.ordinariness === null ? (
              <>
                指標の計算対象となる回答がまだありません。
                <br />
                あなた以外の回答が{min}人以上集まった質問に回答すると表示されます。
              </>
            ) : (
              <>
                平均して{displayScore(metrics.ordinariness)}%の回答者と
                <br />
                同じ判断をしています。
              </>
            )}
          </p>
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <p className="text-sm text-muted">多数派一致率</p>
          <p className="text-4xl font-bold">
            {displayScore(metrics.majority_agreement_rate)}
            {metrics.majority_agreement_rate !== null && "%"}
          </p>
          {metrics.majority_agreement_rate !== null && (
            <p className="mt-2 text-sm text-muted">
              回答した質問の{displayScore(metrics.majority_agreement_rate)}%で
              <br />
              多数派と同じ判断をしています。
            </p>
          )}
        </div>

        <dl className="mt-8 grid grid-cols-4 gap-2 border-t border-line pt-6 text-sm">
          <div>
            <dt className="text-muted">回答数</dt>
            <dd className="text-xl font-semibold">
              {metrics.answered_question_count}
            </dd>
          </div>
          <div>
            <dt className="text-muted">投稿数</dt>
            <dd className="text-xl font-semibold">
              {metrics.posted_question_count}
            </dd>
          </div>
          <div>
            <dt className="text-muted">指標対象</dt>
            <dd className="text-xl font-semibold">
              {metrics.eligible_question_count}
            </dd>
          </div>
          <div>
            <dt className="text-muted">もらったいいね</dt>
            <dd className="text-xl font-semibold text-rose-600">
              ♥ {receivedLikes}
            </dd>
          </div>
        </dl>

        <Link href="/about" className="mt-6 inline-block text-sm text-brand underline">
          普通度とは？
        </Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">
            {isMe ? "自分のコメント" : "コメント"}
          </h2>
          <span className="text-sm text-muted">
            もらったいいね ♥ {receivedLikes}
          </span>
        </div>
        {myComments.length === 0 ? (
          <p className="card p-5 text-sm text-muted">まだコメントがありません。</p>
        ) : (
          myComments.map((c) => (
            <Link
              key={c.id}
              href={`/play/${c.questionId}`}
              className="card block p-4"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-600">
                  ♥ {c.likeCount}
                </span>
                {c.isReply && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-muted">
                    返信
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {c.body}
              </p>
              <p className="mt-1 line-clamp-1 text-xs text-muted">
                {c.questionText}
              </p>
            </Link>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">投稿した質問</h2>
        {questions.length === 0 ? (
          <p className="card p-5 text-sm text-muted">まだ投稿がありません。</p>
        ) : (
          questions.map((q) => (
            <Link
              key={q.id}
              href={`/play/${q.id}`}
              className="card block p-4 hover:bg-slate-50"
            >
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                {categoryName(q.category_id)}
              </span>
              {q.status !== "active" && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  {q.status === "hidden" ? "非公開" : "削除済み"}
                </span>
              )}
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm">
                {q.question_text}
              </p>
            </Link>
          ))
        )}
      </section>

      {isMe && (
        <p className="text-xs text-muted">
          勤務都道府県は公開されません（あなたの設定：{profile.work_prefecture}）。
        </p>
      )}
    </div>
  );
}
