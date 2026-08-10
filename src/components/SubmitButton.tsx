"use client";

import { useFormStatus } from "react-dom";

/**
 * 送信中がひと目で分かる送信ボタン。
 *
 * サーバーアクションを直接指定したフォームは、押しても応答が返るまで
 * 見た目が変わらず「反応していない」ように見える。二度押しも起きやすい。
 * useFormStatus で送信中を拾い、文言を変えて押せないようにする。
 */
export function SubmitButton({
  children,
  pendingLabel = "送信中…",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} transition active:scale-[0.98] disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
