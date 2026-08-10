import "server-only";
import { cookies } from "next/headers";
import { getDb } from "./db";
import type { AuthUser, Profile } from "./types";

/**
 * モックのSNS認証セッション。
 * Supabase Auth 導入後は supabase.auth.getUser() に置き換える。
 */

const COOKIE_NAME = "tasuuketu_uid";

export async function setSessionUser(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const uid = store.get(COOKIE_NAME)?.value;
  if (!uid) return null;
  return getDb().auth_users.find((u) => u.id === uid) ?? null;
}

export type Session = {
  authUser: AuthUser;
  profile: Profile | null;
};

export async function getSession(): Promise<Session | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;
  const profile = getDb().profiles.find((p) => p.id === authUser.id) ?? null;
  return { authUser, profile };
}

/** プロフィール登録済みのユーザーのみ通す */
export async function getCurrentProfile(): Promise<Profile | null> {
  const session = await getSession();
  return session?.profile ?? null;
}
