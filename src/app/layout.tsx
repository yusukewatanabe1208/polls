import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { HeaderMenu } from "@/components/HeaderMenu";
import { repo } from "@/lib/repo";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "診療スタイル診断 | 医師向け2択診療判断サービス",
  description:
    "医師の2択に答えて、自分の診療スタイルを知るサービス。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0e7490",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await repo.getSession();
  const profile = session?.profile ?? null;

  return (
    <html lang="ja">
      <body>
        {/*
          backdrop-blur / transform / filter は position:fixed の基準になり、
          メニューのドロワーがヘッダー内に閉じ込められるため使わない。
        */}
        <header className="sticky top-0 z-40 border-b border-line bg-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
            <Link href={profile ? "/play" : "/"} className="text-lg font-bold text-brand">
              診療スタイル診断
            </Link>
            {session ? (
              // ログイン済みなら、プロフィール未登録でもメニューを出す
              // （未登録のときは登録に必要な項目だけに絞る）
              <HeaderMenu
                username={profile?.username ?? null}
                isAdmin={profile?.is_admin ?? false}
                registered={!!profile}
                logout={
                  <form action={logout}>
                    <button className="btn btn-ghost w-full" type="submit">
                      ログアウト
                    </button>
                  </form>
                }
              />
            ) : (
              <Link href="/login" className="btn btn-primary btn-sm">
                ログイン
              </Link>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>

        <footer className="mx-auto max-w-2xl px-4 pb-10 pt-4 text-xs text-muted">
          <p className="rounded-xl bg-white p-3 ring-1 ring-line">
            このサービスは診療判断の正しさを評価するものではありません。
            多数派＝正解ではなく、<strong>実際の診療の判断に直接用いないでください。</strong>
            患者を特定できる情報は投稿しないでください。
          </p>
          <p className="mt-3">
            <Link href="/terms" className="underline">
              利用規約
            </Link>
            <span className="mx-2">·</span>
            <Link href="/about" className="underline">
              普通度とは？
            </Link>
            <span className="mx-2">·</span>
            <Link href="/setup" className="underline">
              接続状態
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
