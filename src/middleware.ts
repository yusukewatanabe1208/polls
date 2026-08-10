import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./lib/config";

/**
 * Supabaseのセッション（アクセストークン）を更新して Cookie に書き戻す。
 *
 * getClaims() はJWTをその場で検証するだけなので、期限内ならネットワークに出ない。
 * 期限切れのときだけ Auth サーバーに問い合わせて更新される。
 * （以前は getUser() を使っていたため、いいね1回ごとに往復が1つ増えていた）
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // 静的アセット以外の全パス
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
