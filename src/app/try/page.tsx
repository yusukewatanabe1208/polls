import Link from "next/link";
import { redirect } from "next/navigation";
import { TrialVoteForm } from "@/components/TrialVoteForm";
import { categoryName, specialtyName } from "@/lib/master";
import { displayScore } from "@/lib/metrics";
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

  // 全問終わったら成績を出す
  if (answers.length >= total) {
    const results = await repo.getTrialResults(answers.map((a) => a.id));
    return <TrialReport questions={questions} answers={answers} results={results} />;
  }

  // 次の未回答の質問へ。無ければ成績へ
  const current = questions.find((q) => !answers.some((a) => a.id === q.id));
  if (!current) {
    const results = await repo.getTrialResults(answers.map((a) => a.id));
    return <TrialReport questions={questions} answers={answers} results={results} />;
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

/**
 * お試しの成績。
 *
 * 普通度＝各問で「自分と同じ選択をした人の割合」の平均。
 * ここでの母集団はその質問に答えた全員で、回答数の下限も設けていない。
 * 正式な普通度（医師のみ・本人以外20人以上・直近重視の加重平均）とは
 * 定義が違うため、偏差値やランクはお試しでは出さない。
 */
function TrialReport({
  questions,
  answers,
  results,
}: {
  questions: TrialQuestion[];
  answers: TrialAnswer[];
  results: Map<string, TrialResult>;
}) {
  const rows = answers.map((a) => {
    const question = questions.find((q) => q.id === a.id);
    const result = results.get(a.id);
    const sameCount = !result
      ? 0
      : a.choice === "A"
        ? result.aCount
        : result.bCount;
    const agreementRate =
      !result || result.voteCount === 0
        ? null
        : (sameCount / result.voteCount) * 100;
    const majority =
      !result || result.aCount === result.bCount
        ? null
        : result.aCount > result.bCount
          ? "A"
          : "B";
    return { answer: a, question, result, agreementRate, majority };
  });

  const rated = rows.filter((r) => r.agreementRate !== null);
  const ordinariness =
    rated.length === 0
      ? null
      : rated.reduce((s, r) => s + (r.agreementRate ?? 0), 0) / rated.length;

  const withMajority = rows.filter((r) => r.majority !== null);
  const majorityMatched = withMajority.filter(
    (r) => r.majority === r.answer.choice,
  ).length;

  return (
    <div className="space-y-5">
      <header className="text-center">
        <h1 className="text-2xl font-bold">お試しの成績</h1>
        <p className="mt-1 text-sm text-muted">
          {answers.length}問すべてに回答しました。
        </p>
      </header>

      {/* 普通度 */}
      <section className="card p-6 text-center">
        <p className="text-sm text-muted">あなたの普通度（お試し）</p>
        <p className="mt-1 text-6xl font-bold leading-none tracking-tight">
          {displayScore(ordinariness)}
          {ordinariness !== null && (
            <span className="ml-1 align-baseline text-2xl font-semibold">%</span>
          )}
        </p>
        <p className="mt-3 text-sm text-muted">
          {ordinariness === null
            ? "まだ他の回答が集まっていないため計算できませんでした。"
            : `回答した${rated.length}問で、平均して${displayScore(
                ordinariness,
              )}%の人があなたと同じ選択をしていました。`}
        </p>

        {withMajority.length > 0 && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            多数派と同じ判断だったのは
            <span className="mx-1 text-2xl font-bold text-brand tabular-nums">
              {majorityMatched}
            </span>
            /{withMajority.length}問
          </p>
        )}

        <Link href="/login" className="btn btn-primary mt-6 w-full">
          サインイン
        </Link>
        <p className="mt-3 text-xs text-muted">
          サインインすると、すべての質問に回答でき、
          医師だけを母集団にした正式な普通度・偏差値・ランクと、
          他の医師のコメントが見られます。
        </p>
      </section>

      {/* 1問ずつの結果 */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">回答した質問</h2>
        {rows.map((r, i) => (
          <article key={r.answer.id} className="card p-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                {i + 1}問目
              </span>
              {r.question && (
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">
                  {categoryName(r.question.category_id)}
                </span>
              )}
            </div>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {r.question?.question_text ?? "（質問を取得できませんでした）"}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand">
                あなた：{r.answer.choice}
                {r.question &&
                  `（${
                    r.answer.choice === "A"
                      ? r.question.option_a
                      : r.question.option_b
                  }）`}
              </span>
              {r.agreementRate === null ? (
                <span className="text-muted">回答がまだありません</span>
              ) : (
                <>
                  <span className="font-semibold tabular-nums">
                    同じ回答 {Math.round(r.agreementRate)}%
                  </span>
                  {r.majority === null ? (
                    <span className="text-muted">同数</span>
                  ) : r.majority === r.answer.choice ? (
                    <span className="text-emerald-700">多数派</span>
                  ) : (
                    <span className="text-amber-700">少数派</span>
                  )}
                </>
              )}
            </div>

            {r.result && r.result.voteCount > 0 && (
              <>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="bg-brand"
                    style={{ width: `${r.result.aRatio}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
                  <span>
                    {r.question?.option_a ?? "A"} {Math.round(r.result.aRatio)}%
                  </span>
                  <span>回答数 {r.result.voteCount.toLocaleString("ja-JP")}</span>
                  <span>
                    {r.question?.option_b ?? "B"} {Math.round(r.result.bRatio)}%
                  </span>
                </div>
              </>
            )}
          </article>
        ))}
      </section>

      <Link href="/login" className="btn btn-primary w-full">
        サインイン
      </Link>
      <p className="text-center text-xs text-muted">
        お試しの回答は記録されません。サインイン後にあらためて回答してください。
      </p>
      <p className="text-center text-sm">
        <Link href="/about" className="text-brand underline">
          普通度とは？
        </Link>
      </p>
    </div>
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
