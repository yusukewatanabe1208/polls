"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * ページ遷移したらメニューを閉じる。
 * 開閉自体はCSSで動くので、この処理が失敗してもメニューは使える。
 */
export function MenuAutoClose({ toggleId }: { toggleId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const el = document.getElementById(toggleId);
    if (el instanceof HTMLInputElement) el.checked = false;
  }, [pathname, toggleId]);

  return null;
}
