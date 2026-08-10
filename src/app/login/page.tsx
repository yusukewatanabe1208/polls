import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { getBackend } from "@/lib/config";
import { getDb } from "@/lib/db";
import { specialtyName } from "@/lib/master";
import { repo } from "@/lib/repo";
import { TRIAL_LIMIT } from "@/lib/trial";
import { loginAsDemoUser, loginAsNewAccount } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await repo.getSession();
  if (session?.profile) redirect("/play");
  if (session && !session.profile) redirect("/onboarding");

  const { error } = await searchParams;
  const backend = getBackend();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="card p-8 text-center">
        <h1 className="text-xl font-bold">ログイン</h1>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-left text-sm text-red-700">
            ログインに失敗しました：{decodeURIComponent(error)}
          </p>
        )}

        {backend === "supabase" ? (
          <div className="mt-6">
            <GoogleLoginButton />
          </div>
        ) : (
          <form action={loginAsNewAccount} className="mt-6">
            <button type="submit" className="btn btn-primary w-full">
              Googleで続ける（モック）
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-muted">
        <Link href="/try" className="underline">
          まず{TRIAL_LIMIT}問ためす（ログイン不要）
        </Link>
      </p>

      {backend === "local" && <DemoAccounts />}
    </div>
  );
}

/** ローカル開発時だけ出すデモアカウント（既定では折りたたむ） */
function DemoAccounts() {
  const demoAccounts = getDb().profiles.slice(0, 4);
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        デモアカウントでログイン（ローカル）
      </summary>
      <ul className="mt-3 space-y-2">
        {demoAccounts.map((p) => (
          <li key={p.id}>
            <form action={loginAsDemoUser}>
              <input type="hidden" name="user_id" value={p.id} />
              <button
                type="submit"
                className="btn btn-ghost w-full justify-between text-left"
              >
                <span>
                  <span className="font-semibold">@{p.username}</span>
                  <span className="ml-2 text-xs text-muted">
                    {specialtyName(p.specialty_id)}
                  </span>
                </span>
                {p.is_admin && (
                  <span className="rounded bg-brand-soft px-2 py-0.5 text-xs text-brand">
                    管理者
                  </span>
                )}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs text-muted">
        <Link href="/setup" className="underline">
          接続状態を確認する
        </Link>
      </p>
    </details>
  );
}
