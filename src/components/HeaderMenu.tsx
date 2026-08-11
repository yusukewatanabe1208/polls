import Link from "next/link";
import { MenuAutoClose } from "./MenuAutoClose";

type Item = { href: string; label: string };

/**
 * ハンバーガーメニュー。
 *
 * チェックボックス＋CSSだけで開閉するため、JavaScriptが読み込まれる前でも
 * 失敗しても必ず開ける。ページ遷移時の自動クローズだけを
 * MenuAutoClose（クライアント側）で補っている。
 *
 * 注意：この要素の祖先に backdrop-filter / transform / filter を付けないこと。
 * それらは position:fixed の基準になり、ドロワーがヘッダー内に閉じ込められる。
 */
export const MENU_TOGGLE_ID = "app-menu-toggle";

export function HeaderMenu({
  username,
  isAdmin,
  registered = true,
  logout,
}: {
  username: string | null;
  isAdmin: boolean;
  /** プロフィール登録が済んでいるか。未登録なら項目を絞る */
  registered?: boolean;
  logout: React.ReactNode;
}) {
  const items: Item[] = registered
    ? [
        // go=question で必ず質問画面へ入る（左上のロゴは従来どおり /play）
        { href: "/play?go=question", label: "診療スタイル診断" },
        { href: "/questions/new", label: "質問を投稿" },
        { href: "/report", label: "成績表" },
        ...(username
          ? [{ href: `/profile/${username}`, label: "プロフィール" }]
          : []),
        { href: "/settings", label: "設定" },
        { href: "/feedback", label: "運営への要望" },
        // 管理画面は管理者のみ
        ...(isAdmin ? [{ href: "/admin", label: "管理画面" }] : []),
      ]
    : [
        { href: "/onboarding", label: "プロフィール登録" },
        { href: "/about", label: "普通度とは？" },
      ];

  return (
    <>
      {/* 開閉状態。以降の兄弟要素から peer-checked: で参照する */}
      <input
        type="checkbox"
        id={MENU_TOGGLE_ID}
        className="peer sr-only"
        aria-label="メニュー"
      />

      {/* ハンバーガーボタン */}
      <label
        htmlFor={MENU_TOGGLE_ID}
        className="flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-white active:bg-slate-100"
      >
        <span className="sr-only">メニューを開く</span>
        <span aria-hidden className="block h-0.5 w-5 rounded bg-ink" />
        <span aria-hidden className="block h-0.5 w-5 rounded bg-ink" />
        <span aria-hidden className="block h-0.5 w-5 rounded bg-ink" />
      </label>

      {/* 背景（タップで閉じる） */}
      <label
        htmlFor={MENU_TOGGLE_ID}
        aria-hidden
        className="invisible fixed inset-0 z-50 bg-black/40 opacity-0 transition-opacity duration-150 peer-checked:visible peer-checked:opacity-100"
      />

      {/* ドロワー */}
      <nav className="fixed right-0 top-0 z-50 flex h-[100dvh] w-[84%] max-w-xs translate-x-full flex-col overflow-y-auto bg-white shadow-2xl transition-transform duration-200 peer-checked:translate-x-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-bold">
            {username ? `@${username}` : "メニュー"}
            {!registered && (
              <span className="ml-2 text-xs font-normal text-muted">登録前</span>
            )}
          </span>
          <label
            htmlFor={MENU_TOGGLE_ID}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-line text-xl active:bg-slate-100"
          >
            <span className="sr-only">メニューを閉じる</span>
            <span aria-hidden>×</span>
          </label>
        </div>

        <ul className="flex-1 p-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-xl px-4 py-4 text-[1.05rem] font-semibold active:bg-slate-100"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-line p-4">{logout}</div>
      </nav>

      <MenuAutoClose toggleId={MENU_TOGGLE_ID} />
    </>
  );
}
