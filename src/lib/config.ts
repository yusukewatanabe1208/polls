/**
 * Supabaseへの接続設定。
 * データの保存先はSupabaseのみ（認証・DB・画像ストレージ）。
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
