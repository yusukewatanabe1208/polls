import "server-only";
import { cookies } from "next/headers";
import type { Choice } from "./types";

/**
 * ログインなしのお試し（5問）の状態。
 *
 * 回答はサーバー（votes）には保存せず、Cookieにだけ持つ。
 *   ・普通度や他の医師との比較は「実際に回答した医師」だけで集計したいため
 *   ・5問終わったらログインしてもらう導線にするため
 * ログイン後は使わないので、ログイン時にクリアする。
 */

/** ログインなしで解ける問題数 */
export const TRIAL_LIMIT = 5;

const COOKIE_NAME = "tasuuketu_trial";

export type TrialAnswer = { id: string; choice: Choice };

export async function getTrialAnswers(): Promise<TrialAnswer[]> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is TrialAnswer =>
          !!a &&
          typeof (a as TrialAnswer).id === "string" &&
          ((a as TrialAnswer).choice === "A" || (a as TrialAnswer).choice === "B"),
      )
      .slice(0, TRIAL_LIMIT);
  } catch {
    return [];
  }
}

/** 同じ質問への回答は上書きしない（先に答えたものを残す） */
export async function addTrialAnswer(id: string, choice: Choice) {
  const answers = await getTrialAnswers();
  if (answers.some((a) => a.id === id)) return answers;
  if (answers.length >= TRIAL_LIMIT) return answers;

  const next = [...answers, { id, choice }];
  (await cookies()).set(COOKIE_NAME, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return next;
}

export async function clearTrialAnswers() {
  (await cookies()).delete(COOKIE_NAME);
}
