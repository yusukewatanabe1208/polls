import Link from "next/link";
import { categoryName, levelLabel, specialtyName } from "@/lib/master";
import type { FeedItem } from "@/lib/repo/shapes";
import { DemoBadge } from "./DemoBadge";
import { ReportMenu } from "./ReportMenu";

export function QuestionCard({ item }: { item: FeedItem }) {
  const { question, answered } = item;
  return (
    <article className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">
            {categoryName(question.category_id)}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
            {levelLabel(question.level)}
          </span>
          <Link
            href={`/profile/${item.authorUsername}`}
            className="text-muted hover:underline"
          >
            投稿者 @{item.authorUsername}
          </Link>
          <span className="text-muted">
            {specialtyName(item.authorSpecialtyId)}
          </span>
          <DemoBadge show={question.is_demo} />
          {answered && (
            <>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-muted">
                回答済み
              </span>
              {/* コメント数も回答前には出さない（活発さから傾向を推測させないため） */}
              <span className="text-muted">コメント{item.commentCount}</span>
            </>
          )}
        </div>
        <ReportMenu questionId={question.id} />
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7">
        {question.question_text}
      </p>

      {/* 回答前は分布・回答数を一切表示しない（要件定義 §13） */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-line px-3 py-2 text-sm">
          <span className="font-semibold text-brand">A</span>　{question.option_a}
        </div>
        <div className="rounded-lg border border-line px-3 py-2 text-sm">
          <span className="font-semibold text-brand">B</span>　{question.option_b}
        </div>
      </div>

      <Link
        href={`/play/${question.id}`}
        className="btn btn-primary mt-4 w-full sm:w-auto"
      >
        {answered ? "結果を見る" : "回答する"}
      </Link>
    </article>
  );
}
