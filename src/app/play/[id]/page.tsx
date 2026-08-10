import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CommentSection } from "@/components/CommentSection";
import { DemoBadge } from "@/components/DemoBadge";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RemovalButton } from "@/components/RemovalButton";
import { ReportMenu } from "@/components/ReportMenu";
import { RepostForm } from "@/components/RepostForm";
import { VoteForm } from "@/components/VoteForm";
import { REPORT_INTERVAL } from "@/lib/limits";
import { categoryName, levelLabel, specialtyName } from "@/lib/master";
import { displayScore } from "@/lib/metrics";
import { repo, type QuestionResult, type QuestionWithAuthor } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function PlayQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ removed?: string }>;
}) {
  const { id } = await params;
  const { removed } = await searchParams;

  // 質問の取得はログイン状態に依存しないので、セッションと同時に投げる
  const [session, question] = await Promise.all([
    repo.getSession(),
    repo.getQuestion(id),
  ]);

  // 未ログインは、まずログインなしのお試し（5問）へ
  if (!session) redirect("/try");
  if (!session.profile) redirect("/onboarding");
  if (!question || question.status === "deleted") notFound();

  const me = session.profile;
  if (question.status === "hidden" && !me.is_admin && question.author_id !== me.id) {
    notFound();
  }

  // まとめて並行に取得する（順番に待つと往復回数ぶん遅くなる）
  const [result, favorited, answeredCount, removalRequested] = await Promise.all([
    repo.getQuestionResult(question.id, me.id),
    repo.isFavorited(question.id, me.id),
    repo.getAnsweredCount(me.id),
    repo.hasRequestedRemoval(question.id, me.id),
  ]);
  const answered = result !== null;

  const [comments, minOtherVotes, metrics, nextId] = answered
    ? await Promise.all([
        repo.getComments(question.id, me.id),
        repo.getMinOtherVotes(),
        repo.getUserMetrics(me.id),
        // 結果を読んでいる間に次の質問を先読みさせる
        repo.getNextUnansweredQuestionId(me.id, question.id),
      ])
    : [[], 0, null, null];

  // 5問ごとに成績表を挟む
  const reportDue = answeredCount > 0 && answeredCount % REPORT_INTERVAL === 0;
  const nextHref = reportDue
    ? `/report?after=${answeredCount}`
    : nextId
      ? `/play/${nextId}`
      : "/play?done=1";

  const untilReport = REPORT_INTERVAL - (answeredCount % REPORT_INTERVAL);
  const progress = ((answeredCount % REPORT_INTERVAL) / REPORT_INTERVAL) * 100;

  return (
    <div className="space-y-4">
      {removed && (
        <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand">
          {removed === "1"
            ? "前の質問を削除しました。"
            : "削除推奨を受け付けました。"}
        </p>
      )}

      <section>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>回答 {answeredCount}問</span>
          <span>
            {untilReport === REPORT_INTERVAL && answeredCount > 0
              ? "成績表を確認できます"
              : `次の成績表まであと${untilReport}問`}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <article className="card p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">
              {categoryName(question.category_id)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
              {levelLabel(question.level)}
            </span>
            <Link
              href={`/profile/${question.authorUsername}`}
              className="text-muted"
            >
              @{question.authorUsername}
            </Link>
            <span className="text-muted">
              {specialtyName(question.authorSpecialtyId)}
            </span>
            <DemoBadge show={question.is_demo} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <FavoriteButton questionId={question.id} favorited={favorited} />
            <ReportMenu questionId={question.id} />
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-[1.15rem] font-medium leading-8">
          {question.question_text}
        </p>

        {question.image_url && (
          // 添付画像（1枚まで）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.image_url}
            alt="質問の添付画像"
            className="mt-4 w-full rounded-xl border border-line object-contain"
          />
        )}

        {result ? (
          <Result
            question={question}
            result={result}
            minOtherVotes={minOtherVotes}
            ordinariness={metrics?.ordinariness ?? null}
          />
        ) : (
          <VoteForm
            questionId={question.id}
            optionA={question.option_a}
            optionB={question.option_b}
          />
        )}
      </article>

      {answered ? (
        <>
          {/* 「次の質問へ」と「コピーして再投稿」を並べて表示 */}
          <RepostForm
            nextHref={nextHref}
            nextLabel={reportDue ? "成績表を見る →" : "次の質問へ →"}
            questionText={question.question_text}
            categoryId={question.category_id}
            level={question.level}
          />

          <CommentSection
            questionId={question.id}
            comments={comments}
            currentUserId={me.id}
            isAdmin={me.is_admin}
            canPost={question.status === "active" && !me.is_suspended}
          />

          <RemovalButton
            questionId={question.id}
            requested={removalRequested}
            isAdmin={me.is_admin}
          />
        </>
      ) : (
        <p className="px-1 text-center text-sm text-muted">
          回答すると、他の医師の選択とコメントが表示されます。
        </p>
      )}
    </div>
  );
}

function Result({
  question,
  result,
  minOtherVotes,
  ordinariness,
}: {
  question: QuestionWithAuthor;
  result: QuestionResult;
  minOtherVotes: number;
  ordinariness: number | null;
}) {
  const rows = [
    { key: "A" as const, text: question.option_a, ratio: result.aRatio, count: result.aCount },
    { key: "B" as const, text: question.option_b, ratio: result.bRatio, count: result.bCount },
  ];

  return (
    <div className="mt-5 space-y-4">
      <div className="space-y-3">
        {rows.map((r) => {
          const mine = result.myChoice === r.key;
          return (
            <div
              key={r.key}
              className={`rounded-2xl border-2 p-3 ${
                mine ? "border-brand bg-brand-soft" : "border-line bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  <span className="text-brand">{r.key}</span>　{r.text}
                </span>
                <span className="text-xl font-bold tabular-nums">
                  {Math.round(r.ratio)}%
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white ring-1 ring-line">
                <div
                  className={mine ? "h-full bg-brand" : "h-full bg-slate-300"}
                  style={{ width: `${r.ratio}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted tabular-nums">
                {r.count}票{mine && " ・ あなたの回答"}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-muted">
        回答数 {result.voteCount.toLocaleString("ja-JP")}
      </p>

      {result.eligible ? (
        <div className="rounded-2xl bg-brand-soft p-4 text-center">
          <p className="text-sm text-brand">
            あなたと同じ回答（あなたを除く{result.otherCount}人中）
          </p>
          <p className="text-4xl font-bold text-brand">
            {displayScore(result.agreementRate)}%
          </p>
          <p className="mt-1 text-sm text-muted">
            {result.otherMajorityChoice === null
              ? "ちょうど同数のため、多数派一致率の対象外です。"
              : result.otherMajorityChoice === result.myChoice
                ? "多数派と同じ判断です。"
                : "多数派とは異なる判断です。"}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-4 text-center">
          <p className="font-bold">回答募集中</p>
          <p className="mt-1 text-sm text-muted">
            この質問はまだ普通度には反映されません（あなた以外
            {result.otherCount}／{minOtherVotes}人）。
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-line p-3 text-center text-sm">
        <span className="text-muted">現在の普通度</span>
        <span className="ml-2 text-2xl font-bold">
          {displayScore(ordinariness)}
        </span>
      </div>
    </div>
  );
}
