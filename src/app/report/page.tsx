import Link from "next/link";
import { redirect } from "next/navigation";
import { displayScore } from "@/lib/metrics";
import { repo, type DistributionBand } from "@/lib/repo";

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

  // 指標は1回の問い合わせでまとめて取る（0022）。
  // 以前は普通度の集計を2回していた。
  const [report, answers, minOtherVotes, distribution] = await Promise.all([
    repo.getUserReport(me.id),
    // 次があるか判定するため1件多く取る
    repo.getRecentAnswers(me.id, limit + 1),
    repo.getMinOtherVotes(),
    repo.getOrdinarinessDistribution(),
  ]);
  const metrics = report;
  const ranking = report;

  const hasMore = answers.length > limit;
  const recent = answers.slice(0, limit);

  const level = ranking.rankLevel;

  return (
    <div className="space-y-5">
      <header className="text-center">
        <h1 className="text-2xl font-bold">成績表</h1>
        <p className="mt-1 text-sm text-muted">
          {after
            ? `${after}問回答しました。ここまでの成績です。`
            : `これまでに${metrics.answered_question_count}問回答しています。`}
        </p>
      </header>

      {/* ランク */}
      <section className="card p-6 text-center">
        {level ? (
          <>
            {/* 称号のカード（画像はレベルごとに用意） */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/ranks/level-${level}.webp`}
              alt={`${ranking.rankLabel}のカード`}
              width={180}
              height={307}
              className="mx-auto w-[180px] rounded-xl shadow-sm"
            />
            <p className="mt-3 text-3xl font-bold leading-tight">
              {ranking.rankLabel}
            </p>
            <p className="mt-1 text-sm text-muted">{ranking.rankDescription}</p>

            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm text-muted">普通度の偏差値</p>
              <p className="text-6xl font-bold leading-none tracking-tight">
                {displayScore(ranking.deviation)}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted">
              {ranking.comparedUsers}人の医師と比較しています。
              偏差値は普通度の分布を平均50・標準偏差10に換算した値で、
              高いほど他の医師と同じ判断をしていることを表します。
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl">📋</p>
            <p className="mt-3 font-bold">まだ成績を計算できません</p>
            <p className="mt-1 text-sm text-muted">
              あなた以外の回答が{minOtherVotes}人以上集まった質問に回答すると、
              普通度・偏差値・ランクが表示されます。
            </p>
          </>
        )}
      </section>

      {/* 普通度の分布と自分の位置 */}
      {level && distribution.length > 0 && (
        <DistributionChart
          bands={distribution}
          myLevel={level}
          comparedUsers={ranking.comparedUsers}
        />
      )}

      {/* 回答履歴 */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">これまで回答した質問</h2>
          <span className="text-sm text-muted">
            {recent.length} / {metrics.answered_question_count}問
          </span>
        </div>
        {recent.length === 0 ? (
          <p className="card p-5 text-sm text-muted">まだ回答がありません。</p>
        ) : (
          recent.map((r) => (
            <Link
              key={r.questionId}
              href={`/play/${r.questionId}`}
              className="card block p-4"
            >
              <p className="line-clamp-2 whitespace-pre-wrap text-sm">
                {r.questionText}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand">
                  あなた：{r.myChoice}
                  {r.myChoice === "A" ? `（${r.optionA}）` : `（${r.optionB}）`}
                </span>
                {r.eligible ? (
                  <>
                    <span className="font-semibold tabular-nums">
                      同じ回答 {displayScore(r.agreementRate)}%
                    </span>
                    {r.majorityMatched === null ? (
                      <span className="text-muted">同数（対象外）</span>
                    ) : r.majorityMatched ? (
                      <span className="text-emerald-700">多数派</span>
                    ) : (
                      <span className="text-amber-700">少数派</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">回答募集中（指標に未反映）</span>
                )}
              </div>
            </Link>
          ))
        )}

        {hasMore && (
          <Link
            href={`/report?shown=${limit + PAGE_SIZE}${after ? `&after=${after}` : ""}`}
            className="btn btn-ghost w-full"
            scroll={false}
          >
            さらに{PAGE_SIZE}問を見る
          </Link>
        )}
      </section>

      <p className="text-center text-xs text-muted">
        回答数 {metrics.answered_question_count}問（うち指標の対象は
        {metrics.eligible_question_count}問）。
        普通度・多数派一致率はプロフィールで確認できます。
      </p>

      <div className="space-y-3">
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

      <p className="text-center text-xs text-muted">
        多数派＝正解ではありません。ランクは判断の傾向を表すもので、
        診療の正しさを評価するものではありません。
      </p>
    </div>
  );
}

/**
 * 普通度の分布と自分の位置。
 *
 * 10段階（偏差値5きざみ）ごとの人数を縦棒で出し、自分の段だけを強調する。
 * 左が独創的（レベル1）、右が普通（レベル10）で、成績表のスケールと向きを揃える。
 *
 * 色は2色だけ。棒はすべて同じ意味（人数）なので同一色にし、
 * 自分の段だけをブランド色にする。系列が複数あるわけではないので凡例は置かない。
 * 灰色(#94a3b8)は背景とのコントラストが3:1に届かないため、
 * その埋め合わせとして「あなた」の直接ラベルと表形式を併せて置いている。
 */
function DistributionChart({
  bands,
  myLevel,
  comparedUsers,
}: {
  bands: DistributionBand[];
  myLevel: number;
  comparedUsers: number;
}) {
  const ascending = [...bands].sort((a, b) => a.level - b.level);
  const max = Math.max(...ascending.map((b) => b.userCount), 1);
  const total = ascending.reduce((s, b) => s + b.userCount, 0);

  return (
    <section className="card p-5">
      <h2 className="text-base font-bold">普通度の分布とあなたの位置</h2>
      <p className="mt-1 text-xs text-muted">
        医師{comparedUsers}人を偏差値5きざみの10段階に分けた人数です。
      </p>

      {/* 棒グラフ本体。高さは人数に比例させる。
          ラベルの行は全列に確保する。自分の段にだけ足す作りにすると、
          その段が最大値のとき棒とラベルの合計が枠を超えてはみ出す。 */}
      <div className="mt-4 flex h-36 gap-[2px]" role="presentation">
        {ascending.map((b) => {
          const mine = b.level === myLevel;
          // 0人の段も存在が分かるよう、床として2pxだけ残す
          const heightPct = b.userCount === 0 ? 0 : (b.userCount / max) * 100;
          return (
            <div
              key={b.level}
              className="flex h-full flex-1 flex-col"
              title={`レベル${b.level}：${b.userCount}人`}
            >
              {/* ラベル用の固定枠（全列共通なので棒の基準が揃う） */}
              <div className="flex h-4 items-end justify-center">
                {mine && (
                  <span className="text-[0.65rem] font-bold leading-none text-brand">
                    あなた
                  </span>
                )}
              </div>
              {/* 棒を描く領域 */}
              <div className="flex flex-1 items-end">
                <div
                  className={`w-full rounded-t-[4px] ${
                    mine ? "bg-brand" : "bg-slate-400"
                  }`}
                  style={{ height: `${heightPct}%`, minHeight: "2px" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 目盛り。両端だけ言葉にして、間はレベル番号 */}
      <div className="mt-1.5 flex gap-[2px]">
        {ascending.map((b) => (
          <span
            key={b.level}
            className={`flex-1 text-center text-[0.65rem] tabular-nums ${
              b.level === myLevel ? "font-bold text-brand" : "text-muted"
            }`}
          >
            {b.level}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>← 独創的</span>
        <span>普通 →</span>
      </div>

      {/* 色だけに頼らないための表。コントラストの補償も兼ねる */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-brand">
          数値で見る
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="py-1 text-left font-normal">レベル</th>
              <th className="py-1 text-right font-normal">人数</th>
              <th className="py-1 text-right font-normal">割合</th>
            </tr>
          </thead>
          <tbody>
            {[...ascending].reverse().map((b) => (
              <tr
                key={b.level}
                className={`border-t border-line ${
                  b.level === myLevel ? "font-bold text-brand" : ""
                }`}
              >
                <td className="py-1">
                  {b.level}
                  {b.level === myLevel && "（あなた）"}
                </td>
                <td className="py-1 text-right tabular-nums">{b.userCount}</td>
                <td className="py-1 text-right tabular-nums">
                  {total === 0 ? "—" : `${Math.round((b.userCount / total) * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
