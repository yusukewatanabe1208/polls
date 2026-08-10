import Link from "next/link";
import { redirect } from "next/navigation";
import { TrialVoteForm } from "@/components/TrialVoteForm";
import { categoryName } from "@/lib/master";
import { repo, type TrialQuestion, type TrialResult } from "@/lib/repo";
import { TRIAL_LIMIT, getTrialAnswers, type TrialAnswer } from "@/lib/trial";
import type { Choice } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * ログインなしのお試し（5問）。
 * 回答はCookieにだけ持ち、5問終わったらログインしてもらう。
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
      <Wall
        answers={[]}
        questions={[]}
        results={[]}
        message="いま出せる質問がありません。ログインすると全ての質問に回答できます。"
      />
    );
  }

  // 回答直後：その質問の分布を見せる
  const shown = show ? questions.find((q) => q.id === show) : undefined;
  const shownAnswer = shown ? answers.find((a) => a.id === shown.id) : undefined;
  if (shown && shownAnswer) {
    const result = await repo.getTrialResult(shown.id);
    const done = answers.length >= Math.min(TRIAL_LIMIT, questions.length);
    return (
      <div className="space-y-4">
        <Progress done={answers.length} total={questions.length} />
        <article className="card p-5">
          <QuestionBody question={shown} />
          {result ? (
            <Distribution question={shown} result={result} myChoice={shownAnswer.choice} />
          ) : (
            <p className="mt-4 text-sm text-muted">分布を取得できませんでした。</p>
          )}
        </article>

        <p className="px-1 text-center text-sm text-muted">
          ログインすると、あなたの「普通度」と他の医師のコメントが見られます。
        </p>

        <Link href="/try" className="btn btn-primary w-full">
          {done ? "結果を見る →" : "次の質問へ →"}
        </Link>
      </div>
    );
  }

  // 5問終わったらログインへ
  const total = Math.min(TRIAL_LIMIT, questions.length);
  if (answers.length >= total) {
    const results = await Promise.all(
      answers.map((a) => repo.getTrialResult(a.id)),
    );
    return <Wall answers={answers} questions={questions} results={results} />;
  }

  // 次の未回答の質問
  const current = questions.find((q) => !answers.some((a) => a.id === q.id));
  if (!current) redirect("/try?show=" + answers[answers.length - 1].id);

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
        ログインなしで{total}問まで試せます。回答すると他の医師の選択が表示されます。
      </p>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <section>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>お試し {Math.min(done, total)}/{total}問</span>
        <span>ログイン不要</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-brand"
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
    { key: "A" as const, text: question.option_a, ratio: result.aRatio, count: result.aCount },
    { key: "B" as const, text: question.option_b, ratio: result.bRatio, count: result.bCount },
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

/** 5問終わり（またはお試しできない）ときのログイン案内 */
function Wall({
  answers,
  questions,
  results,
  message,
}: {
  answers: TrialAnswer[];
  questions: TrialQuestion[];
  results: (TrialResult | null)[];
  message?: string;
}) {
  const majorityMatched = answers.filter((a, i) => {
    const r = results[i];
    if (!r || r.aCount === r.bCount) return false;
    return (r.aCount > r.bCount ? "A" : "B") === a.choice;
  }).length;

  return (
    <div className="space-y-5">
      <section className="card p-6 text-center">
        {answers.length > 0 ? (
          <>
            <h1 className="text-xl font-bold">
              お試しの{answers.length}問が終わりました
            </h1>
            <p className="mt-3 text-muted">
              多数派と同じ判断だったのは
              <span className="mx-1 text-2xl font-bold text-brand">
                {majorityMatched}
              </span>
              /{answers.length}問でした。
            </p>
            <p className="mt-3 text-sm text-muted">
              ログインすると、すべての質問に回答できます。普通度・成績表・他の医師のコメントも見られます。
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">ログインして続ける</h1>
            <p className="mt-3 text-sm text-muted">
              {message ?? "ログインすると全ての質問に回答できます。"}
            </p>
          </>
        )}

        <Link href="/login" className="btn btn-primary mt-6 w-full">
          ログインして続ける
        </Link>
        <p className="mt-3 text-xs text-muted">
          お試しの回答は記録されません。ログイン後にあらためて回答してください。
        </p>
      </section>

      <p className="text-center text-sm">
        <Link href="/about" className="text-brand underline">
          普通度とは？
        </Link>
      </p>
    </div>
  );
}
