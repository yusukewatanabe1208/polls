import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBadge } from "@/components/DemoBadge";
import { categoryName, levelLabel } from "@/lib/master";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");

  const [favorites, likedComments] = await Promise.all([
    repo.getFavorites(session.profile.id),
    repo.getLikedComments(session.profile.id, 50),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">お気に入り</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          いいねしたコメント
          <span className="ml-2 text-sm font-normal text-muted">
            {likedComments.length}件
          </span>
        </h2>
        {likedComments.length === 0 ? (
          <p className="card p-5 text-sm text-muted">
            まだいいねしたコメントはありません。
            回答後のコメント欄で♡を押すとここに集まります。
          </p>
        ) : (
          likedComments.map((c) => (
            <Link
              key={c.id}
              href={`/play/${c.questionId}`}
              className="card block p-4"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">@{c.authorUsername}</span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-600">
                  ♥ {c.likeCount}
                </span>
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

      <h2 className="text-lg font-bold">お気に入りの質問</h2>

      {favorites.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-3xl">★</p>
          <p className="mt-2 font-bold">まだお気に入りがありません</p>
          <p className="mt-1 text-sm text-muted">
            質問画面の右上にある★を押すと、あとから見返せます。
          </p>
          <Link href="/play" className="btn btn-primary mt-5 w-full">
            質問に答える
          </Link>
        </div>
      ) : (
        favorites.map((f) => (
          <Link
            key={f.question.id}
            href={`/play/${f.question.id}`}
            className="card block p-4"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">
                {categoryName(f.question.category_id)}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                {levelLabel(f.question.level)}
              </span>
              <span className="text-muted">@{f.authorUsername}</span>
              <DemoBadge show={f.question.is_demo} />
              {f.answered ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-muted">
                  回答済み
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                  未回答
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap">
              {f.question.question_text}
            </p>
          </Link>
        ))
      )}
    </div>
  );
}
