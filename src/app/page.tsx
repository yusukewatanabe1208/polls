import Link from "next/link";
import { redirect } from "next/navigation";
import { repo } from "@/lib/repo";
import { TRIAL_LIMIT } from "@/lib/trial";

/**
 * 最初の画面。
 * ログインを前面に出さず、まず{TRIAL_LIMIT}問をログインなしで試してもらう。
 */
export default async function LandingPage() {
  const session = await repo.getSession();
  if (session?.profile) redirect("/play");
  if (session) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <section className="card p-8 text-center">
        <h1 className="text-3xl font-bold leading-snug">
          あなたの診療は、
          <br />
          どれくらい普通？
        </h1>
        <p className="mt-4 text-muted">
          医師の2択に答えて、
          <br />
          他の医師の判断と比べてみる。
        </p>

        <Link href="/try" className="btn btn-primary mt-7 w-full">
          {TRIAL_LIMIT}問ためす（ログイン不要）
        </Link>
        <Link href="/login" className="btn btn-ghost mt-3 w-full">
          ログイン
        </Link>
      </section>

      <p className="text-center text-xs text-muted">
        医学的な正解を決めるサービスではありません。
        <br />
        <Link href="/about" className="underline">
          普通度とは？
        </Link>
      </p>
    </div>
  );
}
