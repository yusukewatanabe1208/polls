import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";

/**
 * Server Component / Server Action / Route Handler 用のSupabaseクライアント。
 * Cookieにセッションを保持する（@supabase/ssr）。
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からは Cookie を書けない。
          // middleware がセッションを更新するため無視してよい。
        }
      },
    },
  });
}
