/**
 * データバックエンドの選択。
 * - supabase … Supabase（認証・DB）
 * - local    … ローカルJSON（.data/db.json）＋モック認証
 *
 * DATA_BACKEND が未設定の場合、Supabaseの環境変数が揃っていれば supabase、
 * 無ければ local を使う。
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** 新形式(sb_publishable_...)と旧形式(anon key)の両方に対応 */
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function isSupabaseConfigured(): boolean {
  return (
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/.test(SUPABASE_URL.trim()) &&
    SUPABASE_KEY.trim().length > 0
  );
}

export type Backend = "supabase" | "local";

export function getBackend(): Backend {
  const explicit = process.env.DATA_BACKEND?.trim().toLowerCase();
  if (explicit === "local") return "local";
  if (explicit === "supabase") return "supabase";
  return isSupabaseConfigured() ? "supabase" : "local";
}

export const isSupabaseBackend = () => getBackend() === "supabase";
