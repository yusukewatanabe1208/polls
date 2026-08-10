import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { repo } from "@/lib/repo";
import { TRIAL_LIMIT } from "@/lib/trial";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await repo.getSession();
  if (session?.profile) redirect("/play");
  if (session && !session.profile) redirect("/onboarding");

  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="card p-8 text-center">
        <h1 className="text-xl font-bold">ログイン</h1>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-left text-sm text-red-700">
            ログインに失敗しました：{decodeURIComponent(error)}
          </p>
        )}

        <div className="mt-6">
          <GoogleLoginButton />
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        <Link href="/try" className="underline">
          まず{TRIAL_LIMIT}問ためす（ログイン不要）
        </Link>
      </p>
    </div>
  );
}
