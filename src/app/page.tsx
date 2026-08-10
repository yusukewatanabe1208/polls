import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/config";
import { repo } from "@/lib/repo";

export default async function LandingPage() {
  const session = await repo.getSession();
  if (session?.profile) redirect("/play");
  const backend = getBackend();

  return (
    <div className="space-y-8">
      <section className="card p-8 text-center">
        <h1 className="text-3xl font-bold leading-snug">
          あなたの診療は、
          <br />
          どれくらい普通？
        </h1>
        <p className="mt-4 text-muted">
          医師の2択に答えて、
          <br />
          自分の「普通度」を知ろう。
        </p>
        <Link href="/login" className="btn btn-primary mt-6 w-full sm:w-auto">
          Googleで始める
        </Link>
        {backend === "local" && (
          <p className="mt-3 text-xs text-muted">
            ※ ローカルモードのため、モックのSNS認証で動作します。
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "2択に答える",
            body: "実臨床で迷う判断を、AかBで回答します。回答前に他の人の結果は見えません。",
          },
          {
            title: "分布を見る",
            body: "回答を確定すると、他の医師がどちらを選んだかが初めて表示されます。",
          },
          {
            title: "普通度を知る",
            body: "自分が選んだ選択肢を他の回答者の何％が選んでいたか。その平均が普通度です。",
          },
        ].map((f) => (
          <div key={f.title} className="card p-5">
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">医学的な正解を決めるサービスではありません</h2>
        <p className="mt-2 text-sm text-muted">
          本サービスは診療判断の正しさを評価するものではなく、他の医師との判断傾向を比較するためのものです。
          多数派であることは正しさを意味しません。
        </p>
        <Link href="/about" className="mt-4 inline-block text-sm text-brand underline">
          普通度とは？
        </Link>
      </section>
    </div>
  );
}
