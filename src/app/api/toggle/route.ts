import { NextResponse } from "next/server";
import { repo } from "@/lib/repo";

/**
 * いいね・お気に入りの切り替え専用の軽い口。
 *
 * サーバーアクションは React が1つずつ順番に送るため、続けて押すと待ち行列ができる。
 * また応答としてページの再描画データ（Flight）が返るので、本文も大きい。
 * ここは JSON を1つ返すだけで、複数同時に飛ばせる。
 *
 * 押した人の判定と権限チェックはDB側（auth.uid() とRLS）が行うので、
 * ここでセッションを取り直さない（往復を1つ増やさないため）。
 * 未ログインや権限の無い操作はDB側で例外になり、403 を返す。
 * 回数の上限は設けていない。
 */
export async function POST(request: Request) {
  let body: { kind?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const kind =
    body.kind === "like" || body.kind === "favorite" ? body.kind : null;
  if (!id || !kind) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const on =
      kind === "like"
        ? await repo.toggleCommentLike(id)
        : await repo.toggleFavorite(id);
    return NextResponse.json({ on });
  } catch {
    // 未ログイン、または未回答のコメントへのいいねなどはRLSで弾かれる
    return NextResponse.json({ error: "rejected" }, { status: 403 });
  }
}
