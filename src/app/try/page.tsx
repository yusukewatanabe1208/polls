import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { TrialVoteForm } from "@/components/TrialVoteForm";
import { categoryName, specialtyName } from "@/lib/master";
import {
  repo,
  type TrialComment,
  type TrialQuestion,
  type TrialResult,
} from "@/lib/repo";
import { TRIAL_LIMIT, getTrialAnswers, type TrialAnswer } from "@/lib/trial";
import type { Choice } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * サインインなしのお試し（5問）。トップ画面は置かず、ここが入口。
 *
 * 1問ごとに回答 → その質問の分布を見せる → 次の質問、と進み、
 * 5問すべて終わったところで成績を出す。
 * 回答はCookieにだけ持ち、votes には保存しない。
 */
export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await repo.getSession();
  if (session?.profile) redirect("/play");
  if (session) redirect("/onboarding");

  const [questions, answers, { show }] = await Promise.all([
    repo.getTrialQuestions(TRIAL_LIMIT),
    getTrialAnswers(),
    searchParams,
  ]);

  if (questions.length === 0) {
    return (
      <SignInWall message="いま出せる質問がありません。サインインすると全ての質問に回答できます。" />
    );
  }

  const total = Math.min(TRIAL_LIMIT, questions.length);

  // 回答した直後：その質問の分布を見せる（成績の判定より先に見る）
  const shown = show ? questions.find((q) => q.id === show) : undefined;
  const shownAnswer = shown ? answers.find((a) => a.id === shown.id) : undefined;
  if (shown && shownAnswer) {
    const [result, comments] = await Promise.all([
      repo.getTrialResult(shown.id),
      repo.getTrialComments(shown.id),
    ]);
    const done = answers.length >= total;
    return (
      <div className="space-y-4">
        <Progress done={answers.length} total={total} />
        <article className="card p-5">
          <QuestionBody question={shown} />
          {result ? (
            <Distribution
              question={shown}
              result={result}
              myChoice={shownAnswer.choice}
            />
          ) : (
            <p className="mt-4 text-sm text-muted">分布を取得できませんでした。</p>
          )}
        </article>

        <TrialComments comments={comments} />

        <Link href="/try" className="btn btn-primary w-full">
          {done ? "成績を見る →" : "次の質問へ →"}
        </Link>
        {!done && (
          <p className="px-1 text-center text-sm text-muted">
            あと{total - answers.length}問で成績が出ます。
          </p>
        )}
      </div>
    );
  }

  // 全問終わったら成績を出す（ログイン後の成績表と同じ中身）
  const current = questions.find((q) => !answers.some((a) => a.id === q.id));
  if (answers.length >= total || !current) {
    return <TrialReport answers={answers} />;
  }

  return (
    <div className="space-y-4">
      <Progress done={answers.length} total={total} />
      <article className="card p-5">
        <QuestionBody question={current} />
        <TrialVoteForm
          questionId={current.id}
          optionA={current.option_a}
          optionB={current.option_b}
        />
      </article>
      <p className="px-1 text-center text-sm text-muted">
        回答すると他の医師の選択が表示されます。
        {total}問すべてに答えると成績が出ます（あと{total - answers.length}問）。
      </p>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <section>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          お試し {Math.min(done, total)}/{total}問
        </span>
        <span>サインイン不要</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-brand transition-[width]"
          style={{ width: `${(Math.min(done, total) / total) * 100}%` }}
        />
      </div>
    </section>
  );
}

function QuestionBody({ question }: { question: TrialQuestion }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">
          {categoryName(question.category_id)}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
          研修医レベル
        </span>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-[1.15rem] font-medium leading-8">
        {question.question_text}
      </p>
    </>
  );
}

/** 回答した直後に見せる分布 */
function Distribution({
  question,
  result,
  myChoice,
}: {
  question: TrialQuestion;
  result: TrialResult;
  myChoice: Choice;
}) {
  const rows = [
    {
      key: "A" as const,
      text: question.option_a,
      ratio: result.aRatio,
      count: result.aCount,
    },
    {
      key: "B" as const,
      text: question.option_b,
      ratio: result.bRatio,
      count: result.bCount,
    },
  ];

  return (
    <div className="mt-5 space-y-3">
      {rows.map((r) => {
        const mine = myChoice === r.key;
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
      <p className="text-sm text-muted">
        回答数 {result.voteCount.toLocaleString("ja-JP")}
      </p>
    </div>
  );
}

/**
 * お試しで見せるコメント（読むだけ）。
 * 投稿・いいね・返信はサインインしてから。
 */
function TrialComments({ comments }: { comments: TrialComment[] }) {
  const roots = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parentId === id);

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">他の医師のコメント</h2>
        {comments.length > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {comments.length}件
          </span>
        )}
      </div>

      {roots.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          この質問にはまだコメントがありません。
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {roots.map((c) => (
            <li key={c.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
              <TrialCommentBody comment={c} />
              {repliesOf(c.id).length > 0 && (
                <ul className="mt-3 space-y-3 border-l-2 border-line pl-3">
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id}>
                      <TrialCommentBody comment={r} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        サインインすると、コメントの投稿・返信・いいねができます。
      </p>
    </section>
  );
}

function TrialCommentBody({ comment }: { comment: TrialComment }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-slate-700">
          @{comment.authorUsername}
        </span>
        <span>{specialtyName(comment.authorSpecialtyId)}</span>
        {comment.authorChoice && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand">
            {comment.authorChoice}を選択
          </span>
        )}
        {comment.likeCount > 0 && (
          <span className="tabular-nums text-rose-600">♥ {comment.likeCount}</span>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
        {comment.body}
      </p>
    </>
  );
}

/** お試しの質問が出せないときの案内 */
function SignInWall({ message }: { message: string }) {
  return (
    <div className="space-y-5">
      <section className="card p-6 text-center">
        <h1 className="text-xl font-bold">サインインして続ける</h1>
        <p className="mt-3 text-sm text-muted">{message}</p>
        <Link href="/login" className="btn btn-primary mt-6 w-full">
          サインイン
        </Link>
      </section>
    </div>
  );
}

/**
 * お試しの成績。ログイン後の成績表とまったく同じ中身を出す。
 *
 * 計算も正式な定義と同じ（医師のみ・本人以外が規定数以上・直近重視の加重平均、
 * 偏差値は同じ母集団のスナップショットから）。0031 のRPCが担当する。
 * 違うのは、回答履歴から質問を開けない点（サインイン前のため）と、
 * 下に置くボタンがサインインである点だけ。
 */
async function TrialReport({ answers }: { answers: TrialAnswer[] }) {
  const [report, details, distribution, minOtherVotes] = await Promise.all([
    repo.getTrialReport(answers),
    repo.getTrialAnswerDetails(answers),
    repo.getOrdinarinessDistribution(),
    repo.getMinOtherVotes(),
  ]);

  return (
    <ReportView
      report={report}
      answers={details}
      distribution={distribution}
      minOtherVotes={minOtherVotes}
      subtitle={`お試しの${answers.length}問が終わりました。`}
      footer={
        <div className="space-y-3">
          <Link href="/login" className="btn btn-primary w-full">
            サインイン
          </Link>
          <p className="text-center text-xs text-muted">
            サインインすると、すべての質問に回答でき、
            他の医師のコメントも読めます。
            お試しの回答は記録されないため、あらためて回答してください。
          </p>
        </div>
      }
    />
  );
}
