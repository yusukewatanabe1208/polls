import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { getBackend } from "@/lib/config";
import { getDb } from "@/lib/db";
import { specialtyName } from "@/lib/master";
import { repo } from "@/lib/repo";
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
    <div className="mx-auto max-w-md space-y-6">
      <div className="card p-6 text-center">
        <h1 className="text-xl font-bold">ログイン</h1>
        <p className="mt-2 text-sm text-muted">
          医師向けの2択診療判断サービスです。
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-left text-sm text-red-700">
            ログインに失敗しました：{decodeURIComponent(error)}
          </p>
        )}

        {backend === "supabase" ? (
          <>
            <GoogleLoginButton />
            <p className="mt-3 text-xs text-muted">
              Supabase Auth のGoogleログインを使用します。
            </p>
          </>
        ) : (
          <>
            <form action={loginAsNewAccount} className="mt-5">
              <button type="submit" className="btn btn-primary w-full">
                Googleで始める（モック / 新規登録）
              </button>
            </form>
            <p className="mt-3 text-xs text-muted">
              ローカルモードのためモック認証で動作します。
            </p>
          </>
        )}
      </div>

      {backend === "local" && <DemoAccounts />}

      <p className="text-center text-xs text-muted">
        <Link href="/setup" className="underline">
          接続状態を確認する
        </Link>
      </p>
    </div>
  );
}

function DemoAccounts() {
  const demoAccounts = getDb().profiles.slice(0, 4);
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold">デモアカウントでログイン</h2>
      <p className="mt-1 text-xs text-muted">
        回答済みデータが入っているため、普通度の表示をすぐ確認できます。
      </p>
      <ul className="mt-4 space-y-2">
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
    </div>
  );
}
