import Link from "next/link";
import { redirect } from "next/navigation";
import {
  adminResolveFeedback,
  adminResolveReport,
  adminSetCommentStatus,
  adminSetQuestionStatus,
  adminToggleSuspend,
  adminUpdateMinVotes,
  purgeAllDemoDataAction,
  purgeDemoVotesAction,
} from "@/app/actions";
import { specialtyName } from "@/lib/master";
import { repo } from "@/lib/repo";

export default async function AdminPage() {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");
  if (!session.profile.is_admin) redirect("/feed");

  const [reports, questions, profiles, comments, min, demo, feedback] =
    await Promise.all([
    repo.adminGetReports(),
    repo.adminGetQuestions(),
    repo.adminGetProfiles(),
    repo.adminGetComments(),
    repo.getMinOtherVotes(),
    repo.getDemoCounts(),
    repo.getFeedback(100),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">管理画面</h1>

      <section className="card p-5">
        <h2 className="font-semibold">指標設定</h2>
        <form action={adminUpdateMinVotes} className="mt-3 flex items-end gap-3">
          <div>
            <label className="label" htmlFor="min_other_votes">
              普通度の計算対象とする最低回答数（本人以外）
            </label>
            <input
              id="min_other_votes"
              name="min_other_votes"
              type="number"
              min={1}
              max={1000}
              defaultValue={min}
              className="field w-32"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            更新
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">ダミーデータの削除</h2>
        <p className="mt-1 text-sm text-muted">
          ローカル開発用に投入したダミーデータには <code>is_demo</code>{" "}
          フラグが付いています。実データ（実際に登録・投稿・回答されたもの）には付かないため、ダミーだけを削除できます。
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["ダミー医師", demo.demoUsers],
            ["ダミー質問", demo.demoQuestions],
            ["ダミー投票", demo.demoVotes],
            ["ダミーコメント", demo.demoComments],
            ["実データの質問", demo.realQuestions],
            ["実データの投票", demo.realVotes],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-line p-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-line p-3">
            <p className="text-sm font-semibold">ダミー医師の投票・コメントのみ削除</p>
            <p className="mt-1 text-xs text-muted">
              質問とアカウントは残したまま、ダミー医師の投票{demo.demoVotes}件とコメント
              {demo.demoComments}件を削除します。実ユーザーの回答はそのまま残ります。
            </p>
            <form action={purgeDemoVotesAction} className="mt-2">
              <button className="btn btn-ghost !py-1 text-xs" type="submit">
                ダミー投票を削除する
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-800">
              ダミーデータをすべて削除
            </p>
            <p className="mt-1 text-xs text-red-700">
              ダミーの質問・投票・コメントをすべて削除します。ダミー質問に付いた実ユーザーの回答も質問ごと消えます。
              アカウント(auth.users)の削除には service_role が必要なため、supabase/purge_demo.sql をSQL Editorで実行してください。
            </p>
            <form action={purgeAllDemoDataAction} className="mt-2">
              <button className="btn btn-ghost !py-1 text-xs text-red-700" type="submit">
                すべてのダミーデータを削除する
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">
          運営への要望（{feedback.filter((f) => f.status === "open").length}件 未対応
          / 全{feedback.length}件）
        </h2>
        {feedback.length === 0 ? (
          <p className="mt-2 text-sm text-muted">要望はまだありません。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {feedback.map((f) => (
              <li
                key={f.id}
                className={`rounded-xl border p-3 ${
                  f.status === "open"
                    ? "border-line bg-white"
                    : "border-line bg-slate-50 opacity-70"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-slate-700">
                    @{f.authorUsername}
                  </span>
                  <span>{new Date(f.created_at).toLocaleString("ja-JP")}</span>
                  {f.status === "resolved" && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5">
                      対応済み
                    </span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                  {f.body}
                </p>
                {f.status === "open" && (
                  <form action={adminResolveFeedback} className="mt-2">
                    <input type="hidden" name="feedback_id" value={f.id} />
                    <button
                      className="btn btn-ghost !py-1 text-xs"
                      type="submit"
                    >
                      対応済みにする
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">通報一覧（{reports.length}件）</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">通報はありません。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.reason}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      r.status === "open"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-muted"
                    }`}
                  >
                    {r.status === "open" ? "未対応" : "対応済み"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  報告者 @{r.reporterUsername}
                </p>
                {r.questionText && (
                  <Link
                    href={`/play/${r.question_id}`}
                    className="mt-1 block line-clamp-2 whitespace-pre-wrap text-xs underline"
                  >
                    {r.questionText}
                  </Link>
                )}
                {r.status === "open" && (
                  <form action={adminResolveReport} className="mt-2">
                    <input type="hidden" name="report_id" value={r.id} />
                    <button className="btn btn-ghost !py-1 text-xs" type="submit">
                      対応済みにする
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">質問一覧（{questions.length}件）</h2>
        <ul className="mt-3 space-y-3">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>@{q.authorUsername}</span>
                {q.voteCount !== null && <span>· {q.voteCount}票</span>}
                {q.reportCount !== null && <span>· 通報{q.reportCount}件</span>}
                <span
                  className={`rounded px-2 py-0.5 ${
                    q.status === "active"
                      ? "bg-brand-soft text-brand"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {q.status}
                </span>
              </div>
              <Link
                href={`/play/${q.id}`}
                className="mt-1 block line-clamp-2 whitespace-pre-wrap"
              >
                {q.question_text}
              </Link>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["active", "hidden", "deleted"] as const)
                  .filter((s) => s !== q.status)
                  .map((s) => (
                    <form key={s} action={adminSetQuestionStatus}>
                      <input type="hidden" name="question_id" value={q.id} />
                      <input type="hidden" name="status" value={s} />
                      <button className="btn btn-ghost !py-1 text-xs" type="submit">
                        {s === "active"
                          ? "公開に戻す"
                          : s === "hidden"
                            ? "非公開にする"
                            : "削除する"}
                      </button>
                    </form>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">コメント（{comments.length}件）</h2>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-muted">コメントはありません。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>@{c.authorUsername}</span>
                  <Link href={`/play/${c.question_id}`} className="underline">
                    {c.question_id}
                  </Link>
                  {c.status === "hidden" && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                      非表示
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                <div className="mt-2 flex gap-2">
                  {(["visible", "hidden", "deleted"] as const)
                    .filter((s) => s !== c.status)
                    .map((s) => (
                      <form key={s} action={adminSetCommentStatus}>
                        <input type="hidden" name="comment_id" value={c.id} />
                        <input type="hidden" name="status" value={s} />
                        <button className="btn btn-ghost !py-1 text-xs" type="submit">
                          {s === "visible"
                            ? "表示に戻す"
                            : s === "hidden"
                              ? "非表示にする"
                              : "削除する"}
                        </button>
                      </form>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">ユーザー（{profiles.length}人）</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <Link href={`/profile/${p.username}`} className="hover:underline">
                  @{p.username}
                </Link>
                <span className="ml-2 text-xs text-muted">
                  {specialtyName(p.specialty_id)}
                </span>
                {p.is_suspended && (
                  <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                    利用停止中
                  </span>
                )}
              </span>
              {!p.is_admin && (
                <form action={adminToggleSuspend}>
                  <input type="hidden" name="user_id" value={p.id} />
                  <button className="btn btn-ghost !py-1 text-xs" type="submit">
                    {p.is_suspended ? "停止解除" : "利用停止"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
