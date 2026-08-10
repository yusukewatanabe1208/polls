"use client";

import { useRef, useState } from "react";

/**
 * いいね・お気に入りのような「押すたびに裏返る」ボタンの共通処理。
 *
 * 押した瞬間に見た目を裏返し、通信は裏で走らせる（待たない）。
 * サーバーアクションではなく /api/toggle を叩くのは、
 * サーバーアクションが1つずつ順番にしか飛ばず、連打すると待ち行列になるため。
 * 失敗したときは見た目を元に戻す。
 */
export function useToggle(
  kind: "like" | "favorite",
  id: string,
  initial: boolean,
) {
  const [on, setOn] = useState(initial);
  // 通信中はサーバーから来た古い値で上書きしないための目印
  const pending = useRef(0);
  const [seenInitial, setSeenInitial] = useState(initial);

  // 画面が新しいデータで描き直されたら、それに合わせる（通信中は触らない）
  if (seenInitial !== initial && pending.current === 0) {
    setSeenInitial(initial);
    setOn(initial);
  }

  function toggle(event: React.FormEvent) {
    // JSが動いているのでフォーム送信は使わない（動かない環境では通常送信になる）
    event.preventDefault();

    const next = !on;
    setOn(next);
    pending.current += 1;

    fetch("/api/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("ng"))))
      .then((data: { on?: boolean }) => {
        if (typeof data.on === "boolean") setOn(data.on);
      })
      .catch(() => setOn(!next))
      .finally(() => {
        pending.current -= 1;
      });
  }

  return { on, toggle };
}
