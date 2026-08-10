"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";

/** ブラウザ用のSupabaseクライアント（Googleログインの開始に使用） */
export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
