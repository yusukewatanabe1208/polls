import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, getBackend } from "./lib/config";

/**
 * Supabaseのセッション（アクセストークン）を更新して Cookie に書き戻す。
 * localバックエンドのときは何もしない。
 */
export async function middleware(request: NextRequest) {
  if (getBackend() !== "supabase") return NextResponse.next({ request });

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

  // getUser() を呼ぶことでトークンが更新される
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // 静的アセット以外の全パス
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
