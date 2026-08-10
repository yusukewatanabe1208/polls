"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/config";
import { getDb, newId, mutateDb } from "@/lib/db";
import {
  CHOICE_A_LABEL,
  CHOICE_B_LABEL,
  COMMENT_TEXT_MAX,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  QUESTION_TEXT_MAX,
  REPORT_INTERVAL,
} from "@/lib/limits";
import {
  CATEGORIES,
  METRIC_OCCUPATION,
  QUESTION_LEVELS,
  PREFECTURES,
  SPECIALTIES,
  isOccupation,
  isQuestionLevel,
} from "@/lib/master";
import { repo } from "@/lib/repo";
import { setSessionUser } from "@/lib/session";
import { TRIAL_LIMIT, addTrialAnswer, clearTrialAnswers } from "@/lib/trial";
import {
  REPORT_REASONS,
  type Choice,
  type CommentStatus,
  type Profile,
  type QuestionStatus,
} from "@/lib/types";

export type FormState = { error?: string; success?: string };

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** 救急カテゴリー（医師以外の既定の出題範囲） */
const EMERGENCY_CATEGORY_ID = 8;

async function currentProfile(): Promise<Profile | null> {
  const session = await repo.getSession();
  return session?.profile ?? null;
}

async function requireAdmin(): Promise<Profile> {
  const profile = await currentProfile();
  if (!profile?.is_admin) redirect("/feed");
  return profile;
}

/* ------------------------------------------------------------------ */
/* 認証                                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* ログインなしのお試し（5問）                                            */
/* ------------------------------------------------------------------ */

/**
 * お試しの回答。votes には保存せず Cookie に持つ。
 * 5問に達したらログインを促す画面に送る。
 */
export async function submitTrialAnswer(formData: FormData) {
  const questionId = String(formData.get("question_id") ?? "");
  const choice = String(formData.get("choice") ?? "") as Choice;
  if (choice !== "A" && choice !== "B") redirect("/try");

  // 実在する（お試し対象の）質問か確認する
  const trialQuestions = await repo.getTrialQuestions(TRIAL_LIMIT);
  if (!trialQuestions.some((q) => q.id === questionId)) redirect("/try");

  const answers = await addTrialAnswer(questionId, choice);
  if (!answers.some((a) => a.id === questionId)) redirect("/try");

  redirect(`/try?show=${questionId}`);
}

/** ローカルモック認証：既存のデモアカウントでログイン */
export async function loginAsDemoUser(formData: FormData) {
  if (getBackend() !== "local") redirect("/login");
  const userId = String(formData.get("user_id") ?? "");
  const user = getDb().auth_users.find((u) => u.id === userId);
  if (!user) redirect("/login?error=notfound");
  await setSessionUser(user.id);
  await clearTrialAnswers();
  const profile = getDb().profiles.find((p) => p.id === user.id);
  redirect(profile ? "/play" : "/onboarding");
}

/** ローカルモック認証：新規アカウント作成 */
export async function loginAsNewAccount() {
  if (getBackend() !== "local") redirect("/login");
  const id = newId("user");
  const suffix = id.slice(-6);
  mutateDb((db) => {
    db.auth_users.push({
      id,
      email: `new_${suffix}@example.com`,
      display_name: `新規ユーザー ${suffix}`,
      provider: "google",
      created_at: new Date().toISOString(),
    });
  });
  await setSessionUser(id);
  await clearTrialAnswers();
  redirect("/onboarding");
}

export async function logout() {
  await repo.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function resetDemoData() {
  if (getBackend() !== "local") redirect("/settings");
  await repo.resetLocalData();
  revalidatePath("/", "layout");
  redirect("/");
}

/* ------------------------------------------------------------------ */
/* 初回プロフィール登録・設定                                             */
/* ------------------------------------------------------------------ */

/**
 * プロフィール入力の検証。
 * ユーザーネームは新規登録時のみ受け取る（登録後は変更できない）。
 */
function validateProfileInput(formData: FormData, options: { requireUsername: boolean }) {
  const username = String(formData.get("username") ?? "").trim();
  const realName = String(formData.get("real_name") ?? "").trim();
  const licenseNumber = String(formData.get("license_number") ?? "")
    .normalize("NFKC")
    .trim();
  const occupation = String(formData.get("occupation") ?? "");
  const specialtyId = Number(formData.get("specialty_id"));
  const prefecture = String(formData.get("work_prefecture") ?? "");

  if (options.requireUsername && !USERNAME_RE.test(username)) {
    return {
      error:
        "ユーザーネームは半角英小文字・数字・アンダースコアの3〜20文字で入力してください。",
    } as const;
  }
  if (realName.length === 0) {
    return { error: "本名を入力してください。" } as const;
  }
  if (realName.length > 50) {
    return { error: "本名は50文字以内で入力してください。" } as const;
  }
  // 医籍登録番号は任意。入力された場合のみ形式を確認する
  if (licenseNumber !== "" && !/^[0-9]{1,20}$/.test(licenseNumber)) {
    return {
      error: "医籍登録番号は半角数字で入力してください（未入力でも登録できます）。",
    } as const;
  }
  if (!isOccupation(occupation)) {
    return { error: "職業を選択してください。" } as const;
  }
  if (!SPECIALTIES.some((s) => s.id === specialtyId)) {
    return { error: "専門科を選択してください。" } as const;
  }
  if (!PREFECTURES.includes(prefecture)) {
    return { error: "勤務都道府県を選択してください。" } as const;
  }
  return {
    username,
    realName,
    licenseNumber,
    occupation,
    specialtyId,
    prefecture,
  } as const;
}

export async function completeOnboarding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await repo.getSession();
  if (!session) return { error: "ログインが必要です。" };
  if (session.profile) redirect("/play");

  const parsed = validateProfileInput(formData, { requireUsername: true });
  if ("error" in parsed) return { error: parsed.error };

  if (formData.get("is_physician") !== "on") {
    return { error: "医療者であることの確認にチェックしてください。" };
  }
  if (formData.get("agree_terms") !== "on") {
    return { error: "利用規約への同意が必要です。" };
  }
  if (await repo.isUsernameTaken(parsed.username)) {
    return { error: "このユーザーネームはすでに使われています。" };
  }

  try {
    await repo.createProfile({
      id: session.userId,
      username: parsed.username,
      realName: parsed.realName,
      licenseNumber: parsed.licenseNumber,
      occupation: parsed.occupation,
      specialtyId: parsed.specialtyId,
      prefecture: parsed.prefecture,
    });

    // 出題の既定：医師はシャッフル、それ以外は救急×研修医レベル
    const isDoctor = parsed.occupation === METRIC_OCCUPATION;
    await repo.updateQuizPreferences({
      id: session.userId,
      categoryIds: isDoctor ? [] : [EMERGENCY_CATEGORY_ID],
      levels: isDoctor ? [] : ["resident"],
      shuffle: isDoctor,
    });
  } catch (e) {
    return { error: `登録に失敗しました: ${(e as Error).message}` };
  }

  revalidatePath("/", "layout");
  redirect("/play");
}

export async function updateSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await currentProfile();
  if (!profile) return { error: "ログインが必要です。" };

  const parsed = validateProfileInput(formData, { requireUsername: false });
  if ("error" in parsed) return { error: parsed.error };

  try {
    // ユーザーネーム・本名・職業は変更できない。
    // 送信内容に関わらず既存の値を使う（本名が未入力の場合のみ後から入力できる）。
    await repo.updateProfile({
      id: profile.id,
      realName: profile.real_name ? profile.real_name : parsed.realName,
      licenseNumber: parsed.licenseNumber,
      occupation: profile.occupation ?? parsed.occupation,
      specialtyId: parsed.specialtyId,
      prefecture: parsed.prefecture,
    });
  } catch (e) {
    return { error: `保存に失敗しました: ${(e as Error).message}` };
  }

  revalidatePath("/", "layout");
  return { success: "設定を保存しました。" };
}

/** 出題の絞り込み（診療科・レベル・シャッフル）を保存する */
export async function updateQuizFilter(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const shuffleAll = formData.get("shuffle_all") === "1";

  // 診療科・レベルとも複数選択。すべて選ばれている＝絞り込みなしとして空配列にする
  const pickedCategories = [
    ...new Set(
      formData
        .getAll("filter_category_ids")
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  const categoryIds =
    shuffleAll ||
    pickedCategories.length === 0 ||
    pickedCategories.length === CATEGORIES.length
      ? []
      : pickedCategories;

  const pickedLevels = [
    ...new Set(
      formData
        .getAll("filter_levels")
        .map((v) => String(v))
        .filter((v) => isQuestionLevel(v)),
    ),
  ];
  const levels =
    shuffleAll ||
    pickedLevels.length === 0 ||
    pickedLevels.length === QUESTION_LEVELS.length
      ? []
      : pickedLevels;

  await repo.updateQuizPreferences({
    id: profile.id,
    categoryIds,
    levels,
    // 「すべてをシャッフル」は絞り込みを外してシャッフルON
    shuffle: shuffleAll ? true : formData.get("shuffle_questions") === "on",
  });

  revalidatePath("/", "layout");
  redirect(shuffleAll ? "/settings?shuffled=1" : "/settings?saved=1");
}

/* ------------------------------------------------------------------ */
/* 投票                                                                */
/* ------------------------------------------------------------------ */

export async function submitVote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await currentProfile();
  if (!profile) return { error: "ログインが必要です。" };
  if (profile.is_suspended) return { error: "アカウントが利用停止中です。" };

  const questionId = String(formData.get("question_id") ?? "");
  const choice = String(formData.get("choice") ?? "") as Choice;
  if (choice !== "A" && choice !== "B") {
    return { error: "AまたはBを選択してください。" };
  }

  const result = await repo.insertVote(questionId, profile.id, choice);
  if (result.error) return { error: result.error };

  revalidatePath(`/questions/${questionId}`);
  revalidatePath(`/play/${questionId}`);
  revalidatePath("/feed");
  return {};
}

/* ------------------------------------------------------------------ */
/* 質問投稿                                                             */
/* ------------------------------------------------------------------ */

export async function createQuestion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await currentProfile();
  if (!profile) return { error: "ログインが必要です。" };
  if (profile.is_suspended) return { error: "アカウントが利用停止中です。" };

  const text = String(formData.get("question_text") ?? "").trim();
  // 選択肢は「そう思う／そう思わない」に固定（投稿者は質問文だけを考える）
  const optionA = CHOICE_A_LABEL;
  const optionB = CHOICE_B_LABEL;
  const categoryId = Number(formData.get("category_id"));
  const level = String(formData.get("level") ?? "");

  if (text.length < 10) return { error: "質問本文を10文字以上で入力してください。" };
  if (text.length > QUESTION_TEXT_MAX) {
    return { error: `質問本文は${QUESTION_TEXT_MAX}文字以内で入力してください。` };
  }
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    return { error: "カテゴリーを選択してください。" };
  }
  if (!isQuestionLevel(level)) {
    return { error: "対象レベル（研修医／非専門医／専門医）を選択してください。" };
  }
  if (formData.get("no_phi") !== "on") {
    return { error: "患者を特定できる情報を含まないことの確認が必要です。" };
  }

  // 画像（1枚まで・10MBまで）
  let imageUrl: string | null = null;
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    if (image.size > IMAGE_MAX_BYTES) {
      return { error: "画像は10MB以内にしてください。" };
    }
    if (!IMAGE_MIME_TYPES.includes(image.type)) {
      return { error: "画像はPNG / JPEG / WebP / GIF のいずれかにしてください。" };
    }
    const uploaded = await repo.uploadQuestionImage(image, profile.id);
    if (uploaded.error || !uploaded.url) {
      return { error: uploaded.error ?? "画像のアップロードに失敗しました。" };
    }
    imageUrl = uploaded.url;
  }

  const { id, error } = await repo.insertQuestion({
    authorId: profile.id,
    text,
    optionA,
    optionB,
    categoryId,
    level,
    imageUrl,
  });
  if (error || !id) return { error: error ?? "投稿に失敗しました。" };

  revalidatePath("/feed");
  revalidatePath("/play");

  // 「投稿して次の問題へ進む」から呼ばれた場合は、投稿した質問ではなく次の未回答へ
  if (formData.get("after") === "next") {
    const next = await repo.getNextUnansweredQuestionId(profile.id, id);
    redirect(next ? `/play/${next}` : "/play?done=1");
  }

  redirect(`/play/${id}`);
}

/* ------------------------------------------------------------------ */
/* 通報                                                                */
/* ------------------------------------------------------------------ */

export async function reportQuestion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await currentProfile();
  if (!profile) return { error: "ログインが必要です。" };

  const questionId = String(formData.get("question_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    return { error: "理由を選択してください。" };
  }

  const result = await repo.insertReport({
    reporterId: profile.id,
    questionId,
    reason,
  });
  if (result.error) return { error: result.error };

  return { success: "報告を受け付けました。ご協力ありがとうございます。" };
}

/**
 * 不適切につき削除推奨。
 * 管理者が押した場合は即削除、一般ユーザーは規定人数に達した時点で削除される。
 * 押したあとは次の質問へ進む。
 */
export async function requestRemoval(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const questionId = String(formData.get("question_id") ?? "");
  const { removed } = await repo.requestRemoval(questionId, profile.id);

  revalidatePath("/", "layout");

  const next = await repo.getNextUnansweredQuestionId(profile.id, questionId);
  redirect(
    next
      ? `/play/${next}?removed=${removed ? "1" : "requested"}`
      : `/play?done=1`,
  );
}

/* ------------------------------------------------------------------ */
/* コメント                                                             */
/* ------------------------------------------------------------------ */

export async function addComment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await currentProfile();
  if (!profile) return { error: "ログインが必要です。" };
  if (profile.is_suspended) return { error: "アカウントが利用停止中です。" };

  const questionId = String(formData.get("question_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: "コメントを入力してください。" };
  if (body.length > COMMENT_TEXT_MAX) {
    return { error: `コメントは${COMMENT_TEXT_MAX}文字以内で入力してください。` };
  }

  // 回答前にコメント欄を見せない設計のため、投票済みであることを必須にする
  if (!(await repo.hasVoted(questionId, profile.id))) {
    return { error: "コメントするには先に回答してください。" };
  }

  const parentId = String(formData.get("parent_id") ?? "") || null;

  const result = await repo.insertComment({
    questionId,
    userId: profile.id,
    body,
    parentId,
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/questions/${questionId}`);
  revalidatePath(`/play/${questionId}`);
  return { success: "コメントを投稿しました。" };
}

/** コメントへのいいね（もう一度押すと取り消し） */
export async function toggleCommentLike(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const commentId = String(formData.get("comment_id") ?? "");
  const questionId = String(formData.get("question_id") ?? "");
  await repo.toggleCommentLike(commentId, profile.id);

  revalidatePath(`/play/${questionId}`);
  revalidatePath("/", "layout");
}

/** 投稿者本人または管理者による削除 */
export async function deleteComment(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const commentId = String(formData.get("comment_id") ?? "");
  const questionId = String(formData.get("question_id") ?? "");

  await repo.setCommentStatus(commentId, "deleted", {
    userId: profile.id,
    isAdmin: profile.is_admin,
  });

  revalidatePath(`/questions/${questionId}`);
  revalidatePath(`/play/${questionId}`);
  revalidatePath("/admin");
}

/* ------------------------------------------------------------------ */
/* 管理者                                                              */
/* ------------------------------------------------------------------ */

export async function adminSetQuestionStatus(formData: FormData) {
  await requireAdmin();
  const questionId = String(formData.get("question_id") ?? "");
  const status = String(formData.get("status") ?? "") as QuestionStatus;
  if (!["active", "hidden", "deleted"].includes(status)) return;

  await repo.adminSetQuestionStatus(questionId, status);
  revalidatePath("/admin");
  revalidatePath("/feed");
}

export async function adminResolveReport(formData: FormData) {
  await requireAdmin();
  await repo.adminResolveReport(String(formData.get("report_id") ?? ""));
  revalidatePath("/admin");
}

export async function adminToggleSuspend(formData: FormData) {
  await requireAdmin();
  await repo.adminToggleSuspend(String(formData.get("user_id") ?? ""));
  revalidatePath("/admin");
}

export async function adminUpdateMinVotes(formData: FormData) {
  await requireAdmin();
  const value = Number(formData.get("min_other_votes"));
  if (!Number.isFinite(value) || value < 1 || value > 1000) return;
  await repo.adminSetMinVotes(Math.floor(value));
  revalidatePath("/", "layout");
}

export async function adminSetCommentStatus(formData: FormData) {
  const admin = await requireAdmin();
  const commentId = String(formData.get("comment_id") ?? "");
  const status = String(formData.get("status") ?? "") as CommentStatus;
  if (!["visible", "hidden", "deleted"].includes(status)) return;

  await repo.setCommentStatus(commentId, status, {
    userId: admin.id,
    isAdmin: true,
  });
  revalidatePath("/admin");
}

/* ------------------------------------------------------------------ */
/* ダミーデータの削除                                                    */
/* ------------------------------------------------------------------ */

export async function purgeDemoVotesAction() {
  await requireAdmin();
  await repo.purgeDemo("votes");
  revalidatePath("/", "layout");
}

export async function purgeAllDemoDataAction() {
  const admin = await requireAdmin();
  const wasDemoAccount = !!admin.is_demo;
  await repo.purgeDemo("all");
  revalidatePath("/", "layout");
  if (wasDemoAccount) {
    await repo.signOut();
    redirect("/");
  }
  redirect("/admin");
}

/* ------------------------------------------------------------------ */
/* お気に入り                                                           */
/* ------------------------------------------------------------------ */

export async function toggleFavorite(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  const questionId = String(formData.get("question_id") ?? "");
  await repo.toggleFavorite(questionId, profile.id);
  revalidatePath(`/questions/${questionId}`);
  revalidatePath(`/play/${questionId}`);
  revalidatePath("/play");
  revalidatePath("/favorites");
}

/** 次の未回答質問へ。5問ごとに成績表を挟む */
export async function goToNextQuestion(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const currentId = String(formData.get("current_id") ?? "");
  const answered = await repo.getAnsweredCount(profile.id);
  const skipReport = formData.get("skip_report") === "1";

  if (!skipReport && answered > 0 && answered % REPORT_INTERVAL === 0) {
    redirect(`/report?after=${answered}`);
  }

  const next = await repo.getNextUnansweredQuestionId(profile.id, currentId);
  redirect(next ? `/play/${next}` : "/play?done=1");
}
