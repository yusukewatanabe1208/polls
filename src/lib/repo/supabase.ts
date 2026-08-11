import "server-only";
import { after } from "next/server";
import { rankFromDeviation } from "../metrics";
import { createSupabaseServerClient } from "../supabase/server";
import type {
  Choice,
  CommentStatus,
  Profile,
  Question,
  QuestionStatus,
} from "../types";
import type {
  AdminComment,
  AuthoredQuestion,
  AdminQuestion,
  AdminReport,
  CommentView,
  DemoCountsView,
  MyCommentView,
  FavoriteItem,
  FeedItem,
  LikedCommentView,
  RankingView,
  RecentAnswerView,
  QuestionResult,
  QuestionWithAuthor,
  SessionInfo,
  TrialQuestion,
  TrialResult,
  UserMetrics,
  UserReportView,
} from "./shapes";

/** Supabaseバックエンド（Auth + PostgreSQL + RLS + RPC） */

const QUESTION_COLUMNS =
  "id, author_id, question_text, option_a, option_b, category_id, level, status, image_url, is_demo, created_at";

/** 質問画像のStorageバケット名 */
const IMAGE_BUCKET = "question-images";

type PublicProfileRow = {
  id: string;
  username: string;
  occupation: string;
  specialty_id: number;
  is_physician: boolean;
  is_admin: boolean;
  created_at: string;
};

/** 公開プロフィールを Profile 型に合わせる（work_prefecture は非公開なので空文字） */
function toProfile(row: PublicProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    specialty_id: row.specialty_id,
    work_prefecture: "",
    real_name: "",
    license_number: "",
    occupation: row.occupation ?? "医師",
    is_physician: row.is_physician,
    is_admin: row.is_admin,
    is_suspended: false,
    filter_category_ids: [],
    filter_levels: [],
    shuffle_questions: true,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

/**
 * ログイン中のユーザーとプロフィール。ほぼ全ページの入口で呼ばれる。
 *
 * getUser() ではなく getClaims() を使う。getUser() は毎回Authサーバーに
 * 問い合わせるため、画面を開くたびに往復が1つ増えていた。
 * getClaims() はJWTの署名をその場で検証するので、期限内ならネットワークに出ない
 * （検証している点は getUser() と同じで、Cookieを鵜呑みにはしていない）。
 */
export async function getSession(): Promise<SessionInfo> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .maybeSingle();

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    profile: (profile as Profile | null) ?? null,
  };
}

/** テーブルが作成済みか（マイグレーション未実行の検出） */
export async function checkSchemaReady(): Promise<{
  ready: boolean;
  message?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").select("id").limit(0);
  if (!error) return { ready: true };
  // PGRST205 = スキーマキャッシュにテーブルが無い（＝未作成）
  if (error.code === "PGRST205" || /schema cache/i.test(error.message)) {
    return { ready: false, message: error.message };
  }
  return { ready: true };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function getMinOtherVotes(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("app_settings")
    .select("min_other_votes")
    .eq("id", 1)
    .maybeSingle();
  return data?.min_other_votes ?? 20;
}

export async function getProfileByUsername(
  username: string,
): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("public_profiles")
    .select("id, username, occupation, specialty_id, is_physician, is_admin, created_at")
    .ilike("username", username)
    .maybeSingle();
  if (!data) return null;

  const profile = toProfile(data as PublicProfileRow);

  // 本人なら勤務都道府県も含めて返す（設定画面で使う）。
  // getUser() だとAuthサーバーへの往復が増えるので getClaims() を使う。
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.sub === profile.id) {
    const { data: own } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profile.id)
      .maybeSingle();
    if (own) return own as Profile;
  }
  return profile;
}

export async function isUsernameTaken(username: string, exceptId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("public_profiles")
    .select("id")
    .ilike("username", username);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.maybeSingle();
  return !!data;
}

export async function createProfile(input: {
  id: string;
  username: string;
  realName: string;
  licenseNumber: string;
  occupation: string;
  specialtyId: number;
  prefecture: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").insert({
    id: input.id,
    username: input.username,
    real_name: input.realName,
    license_number: input.licenseNumber,
    occupation: input.occupation,
    specialty_id: input.specialtyId,
    work_prefecture: input.prefecture,
    is_physician: true,
  });
  if (error) throw new Error(error.message);
}

/**
 * ユーザーネームは更新対象に含めない。
 * （DB側のトリガー profiles_lock_username でも変更を禁止している）
 */
export async function updateProfile(input: {
  id: string;
  realName: string;
  licenseNumber: string;
  occupation: string;
  specialtyId: number;
  prefecture: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      real_name: input.realName,
      license_number: input.licenseNumber,
      occupation: input.occupation,
      specialty_id: input.specialtyId,
      work_prefecture: input.prefecture,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

/** 出題の絞り込み設定を保存する */
export async function updateQuizPreferences(input: {
  id: string;
  categoryIds: number[];
  levels: string[];
  shuffle: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      filter_category_ids: input.categoryIds,
      filter_levels: input.levels,
      shuffle_questions: input.shuffle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

/**
 * フィード。絞り込み・並べ替え・コメント数までDB側で済ませて1往復にする
 * （supabase/migrations/0021_feed_rpc.sql）。
 * 以前は5回に分けて取得し、そのうちコメントは全件を運んでいた。
 */
export async function getFeed(_userId: string): Promise<FeedItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_feed", { p_limit: 100 });
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    question: {
      id: r.id as string,
      author_id: r.author_id as string,
      question_text: r.question_text as string,
      option_a: r.option_a as string,
      option_b: r.option_b as string,
      category_id: r.category_id as number,
      level: r.level as string,
      status: r.status as Question["status"],
      image_url: (r.image_url as string | null) ?? null,
      is_demo: Boolean(r.is_demo),
      created_at: r.created_at as string,
    },
    answered: Boolean(r.answered),
    authorUsername: (r.author_username as string) ?? "unknown",
    authorSpecialtyId: Number(r.author_specialty_id ?? 0),
    commentCount: Number(r.comment_count ?? 0),
  }));
}

/**
 * 次の未回答質問。
 * フィード全体を取らずにRPCで1回の問い合わせに収める（往復を減らすため）。
 */
export async function getNextUnansweredQuestionId(
  _userId: string,
  excludeId?: string,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_next_question", {
    p_exclude: excludeId ?? null,
  });
  if (error) return null;
  return (data as string | null) ?? null;
}

/**
 * 質問と投稿者。質問ページは必ずここを通るので1往復で済ませる（0023）。
 * 以前は「質問を取る」→「投稿者を取る」で必ず直列に2回待っていた。
 */
export async function getQuestion(
  id: string,
): Promise<QuestionWithAuthor | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_question_with_author", {
    p_id: id,
  });
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !r) return null;

  return {
    id: r.id as string,
    author_id: r.author_id as string,
    question_text: r.question_text as string,
    option_a: r.option_a as string,
    option_b: r.option_b as string,
    category_id: r.category_id as number,
    level: r.level as string,
    status: r.status as Question["status"],
    image_url: (r.image_url as string | null) ?? null,
    is_demo: Boolean(r.is_demo),
    created_at: r.created_at as string,
    authorUsername: (r.author_username as string) ?? "unknown",
    authorSpecialtyId: Number(r.author_specialty_id ?? 0),
  };
}

/**
 * ログインなしのお試しで出す質問。
 * anon でも呼べる RPC（0011_trial_without_login.sql）を使う。
 */
export async function getTrialQuestions(limit: number): Promise<TrialQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_trial_questions", { p_limit: limit });
  return (data ?? []) as TrialQuestion[];
}

/** お試しの分布（本人の回答はサーバーに保存しないので全体集計だけ） */
export async function getTrialResult(questionId: string): Promise<TrialResult | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .rpc("get_trial_result", { p_question_id: questionId })
    .maybeSingle();
  if (!data) return null;
  const row = data as { vote_count: number; a_count: number; b_count: number };
  const total = row.vote_count;
  if (total === 0) return null;
  return {
    voteCount: total,
    aCount: row.a_count,
    bCount: row.b_count,
    aRatio: (row.a_count / total) * 100,
    bRatio: (row.b_count / total) * 100,
  };
}

function toTrialResult(voteCount: number, aCount: number, bCount: number) {
  return {
    voteCount,
    aCount,
    bCount,
    aRatio: voteCount === 0 ? 0 : (aCount / voteCount) * 100,
    bRatio: voteCount === 0 ? 0 : (bCount / voteCount) * 100,
  };
}

/**
 * お試しの成績用に、複数の質問の分布をまとめて取る（0027）。
 * 途中で分布を見せなくなったので、必要なのは最後の1回だけ。
 *
 * 0027 がまだ適用されていないDBでも成績が出るよう、
 * 失敗したときは1問ずつ取る従来のRPCに切り替える。
 * コードのデプロイとSQLの適用には時間差が出るため、
 * その間もお試しが空振りしないようにしておく。
 */
export async function getTrialResults(
  ids: string[],
): Promise<Map<string, TrialResult>> {
  const map = new Map<string, TrialResult>();
  if (ids.length === 0) return map;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_trial_results", {
    p_ids: ids,
  });

  if (!error && data) {
    for (const r of data as Record<string, unknown>[]) {
      map.set(
        r.question_id as string,
        toTrialResult(
          Number(r.vote_count ?? 0),
          Number(r.a_count ?? 0),
          Number(r.b_count ?? 0),
        ),
      );
    }
    return map;
  }

  // 0027 未適用の場合はここに来る（1問ずつ・並行して取る）
  const each = await Promise.all(
    ids.map(async (id) => [id, await getTrialResult(id)] as const),
  );
  for (const [id, result] of each) {
    if (result) map.set(id, result);
  }
  return map;
}

export async function getQuestionResult(
  questionId: string,
  _userId: string,
): Promise<QuestionResult | null> {
  const supabase = await createSupabaseServerClient();
  // 未回答の場合、RPCは行を返さない（DB側で回答前の結果取得を禁止している）
  const { data, error } = await supabase.rpc("get_question_result", {
    p_question_id: questionId,
  });
  if (error || !data || (data as unknown[]).length === 0) return null;

  const r = (data as Record<string, unknown>[])[0];
  return {
    voteCount: Number(r.vote_count),
    aCount: Number(r.a_count),
    bCount: Number(r.b_count),
    aRatio: Number(r.a_ratio),
    bRatio: Number(r.b_ratio),
    myChoice: r.my_choice as Choice,
    otherCount: Number(r.other_count),
    agreementRate:
      r.agreement_rate === null ? null : Number(r.agreement_rate),
    otherMajorityChoice: (r.other_majority_choice as Choice | null) ?? null,
    eligible: Boolean(r.eligible),
  };
}

export async function hasVoted(questionId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("votes")
    .select("id")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function insertVote(
  questionId: string,
  userId: string,
  choice: Choice,
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("votes")
    .insert({ question_id: questionId, user_id: userId, choice });
  if (!error) return {};
  // unique(question_id, user_id) 違反 ＝ すでに回答済み
  if (error.code === "23505") return { error: "この質問にはすでに回答済みです。" };
  return { error: error.message };
}

export async function insertQuestion(input: {
  authorId: string;
  text: string;
  optionA: string;
  optionB: string;
  categoryId: number;
  level: string;
  imageUrl: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("questions")
    .insert({
      author_id: input.authorId,
      question_text: input.text,
      option_a: input.optionA,
      option_b: input.optionB,
      category_id: input.categoryId,
      level: input.level,
      image_url: input.imageUrl,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id as string };
}

/** Supabase Storage に画像を保存して公開URLを返す */
export async function uploadQuestionImage(
  file: File,
  userId: string,
): Promise<{ url?: string; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
  const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type || "image/png",
      upsert: false,
    });
  if (error) {
    return {
      error: `画像のアップロードに失敗しました（${error.message}）。Storageに「${IMAGE_BUCKET}」バケットを作成してください。`,
    };
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(objectPath);
  return { url: data.publicUrl };
}

/**
 * 投稿した質問と、その反響（0026）。
 * どこまで返すかはDB側が判断する（回答前に割れ方を見せないため）。
 */
export async function getQuestionsByAuthor(
  authorId: string,
): Promise<AuthoredQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_authored_questions", {
    p_author_id: authorId,
  });
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    author_id: r.author_id as string,
    question_text: r.question_text as string,
    option_a: r.option_a as string,
    option_b: r.option_b as string,
    category_id: r.category_id as number,
    level: r.level as string,
    status: r.status as Question["status"],
    image_url: (r.image_url as string | null) ?? null,
    is_demo: Boolean(r.is_demo),
    created_at: r.created_at as string,
    voteCount: r.vote_count === null ? null : Number(r.vote_count),
    aCount: r.a_count === null ? null : Number(r.a_count),
    bCount: r.b_count === null ? null : Number(r.b_count),
    commentCount: r.comment_count === null ? null : Number(r.comment_count),
    viewerAnswered: Boolean(r.viewer_answered),
  }));
}

export async function getComments(
  questionId: string,
  _viewerId: string,
): Promise<CommentView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_question_comments", {
    p_question_id: questionId,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((c) => ({
    id: c.id as string,
    question_id: c.question_id as string,
    user_id: c.user_id as string,
    parentId: (c.parent_id as string | null) ?? null,
    body: c.body as string,
    created_at: c.created_at as string,
    authorUsername: (c.author_username as string) ?? "unknown",
    authorSpecialtyId: (c.author_specialty_id as number) ?? 0,
    authorChoice: (c.author_choice as Choice | null) ?? null,
    likeCount: Number(c.like_count ?? 0),
    likedByMe: Boolean(c.liked_by_me),
  }));
}

/** いいねの付け外し。戻り値は押した後の状態 */
/**
 * いいねの切り替え。押した後の状態を返す。
 * 誰が押したかはDB側が auth.uid() から判断するため、往復は1回で済む
 * （supabase/migrations/0019_fast_toggles.sql）。
 */
export async function toggleCommentLike(commentId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("toggle_comment_like", {
    p_comment_id: commentId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getMyComments(
  userId: string,
  limit: number,
): Promise<MyCommentView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_user_comments", {
    p_user_id: userId,
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((c) => ({
    id: c.id as string,
    questionId: c.question_id as string,
    questionText: c.question_text as string,
    body: c.body as string,
    created_at: c.created_at as string,
    likeCount: Number(c.like_count ?? 0),
    isReply: Boolean(c.is_reply),
  }));
}

export async function getReceivedLikeCount(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_received_like_count", {
    p_user_id: userId,
  });
  if (error) return 0;
  return Number(data ?? 0);
}

export async function insertComment(input: {
  questionId: string;
  userId: string;
  body: string;
  parentId: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("comments").insert({
    question_id: input.questionId,
    user_id: input.userId,
    body: input.body,
    parent_id: input.parentId,
  });
  return error ? { error: error.message } : {};
}

export async function setCommentStatus(
  commentId: string,
  status: CommentStatus,
  _actor: { userId: string; isAdmin: boolean },
) {
  const supabase = await createSupabaseServerClient();
  // 権限はRLS（本人または管理者のみUPDATE可）で担保
  await supabase.from("comments").update({ status }).eq("id", commentId);
}

/**
 * 削除推奨。判定（管理者は即削除／3人で削除）はDBのトリガーが行う。
 */
export async function requestRemoval(
  questionId: string,
  userId: string,
): Promise<{ removed: boolean; count: number }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("removal_requests")
    .insert({ question_id: questionId, user_id: userId });
  // 23505 = すでに押している
  if (error && error.code !== "23505") throw new Error(error.message);

  const { data } = await supabase
    .from("questions")
    .select("status")
    .eq("id", questionId)
    .maybeSingle();

  const { count } = await supabase
    .from("removal_requests")
    .select("id", { count: "exact", head: true })
    .eq("question_id", questionId);

  return { removed: data?.status === "deleted", count: count ?? 0 };
}

export async function hasRequestedRemoval(questionId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("removal_requests")
    .select("id")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function insertReport(input: {
  reporterId: string;
  questionId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: input.reporterId,
    question_id: input.questionId,
    reason: input.reason,
  });
  return error ? { error: error.message } : {};
}

export async function getUserMetrics(userId: string): Promise<UserMetrics> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_user_ordinariness", {
    p_user_id: userId,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !row) {
    return {
      ordinariness: null,
      majority_agreement_rate: null,
      eligible_question_count: 0,
      answered_question_count: 0,
      posted_question_count: 0,
    };
  }
  return {
    ordinariness: row.ordinariness === null ? null : Number(row.ordinariness),
    majority_agreement_rate:
      row.majority_agreement_rate === null
        ? null
        : Number(row.majority_agreement_rate),
    eligible_question_count: Number(row.eligible_question_count ?? 0),
    answered_question_count: Number(row.answered_question_count ?? 0),
    posted_question_count: Number(row.posted_question_count ?? 0),
  };
}

export async function getAnsweredCount(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

export async function getRecentAnswers(
  userId: string,
  limit: number,
): Promise<RecentAnswerView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_recent_answers", {
    p_user_id: userId,
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    questionId: r.question_id as string,
    questionText: r.question_text as string,
    optionA: r.option_a as string,
    optionB: r.option_b as string,
    myChoice: r.my_choice as Choice,
    agreementRate: r.agreement_rate === null ? null : Number(r.agreement_rate),
    majorityMatched:
      r.majority_matched === null ? null : Boolean(r.majority_matched),
    eligible: Boolean(r.eligible),
  }));
}

/**
 * 成績表・プロフィール用の指標一式。
 * 以前は getUserMetrics と getRanking を両方呼び、どちらも自分の普通度を
 * 最初から計算し直していた。1回の問い合わせにまとめる（0022 / 重み付けは0025）。
 */
export async function getUserReport(userId: string): Promise<UserReportView> {
  const supabase = await createSupabaseServerClient();

  // 母集団の統計が古ければ、応答を返したあとに測り直す（0018）
  after(async () => {
    await supabase.rpc("refresh_ordinariness_snapshot_if_stale", {});
  });

  const { data, error } = await supabase.rpc("get_user_report", {
    p_user_id: userId,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];

  const empty: UserReportView = {
    ordinariness: null,
    majority_agreement_rate: null,
    eligible_question_count: 0,
    answered_question_count: 0,
    posted_question_count: 0,
    deviation: null,
    percentile: null,
    rankLevel: null,
    rankLabel: null,
    rankDescription: null,
    comparedUsers: 0,
  };
  if (error || !row) return empty;

  const ordinariness =
    row.ordinariness === null ? null : Number(row.ordinariness);
  const deviation = row.deviation === null ? null : Number(row.deviation);
  const band = deviation === null ? null : rankFromDeviation(deviation);

  return {
    ordinariness,
    majority_agreement_rate:
      row.majority_agreement_rate === null
        ? null
        : Number(row.majority_agreement_rate),
    eligible_question_count: Number(row.eligible_question_count ?? 0),
    answered_question_count: Number(row.answered_question_count ?? 0),
    posted_question_count: Number(row.posted_question_count ?? 0),
    deviation,
    percentile: row.percentile === null ? null : Number(row.percentile),
    rankLevel: band?.level ?? null,
    rankLabel: band?.label ?? null,
    rankDescription: band?.description ?? null,
    comparedUsers: Number(row.compared_users ?? 0),
  };
}

export async function getRanking(userId: string): Promise<RankingView> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_ordinariness_ranking", {
    p_user_id: userId,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  const ordinariness =
    row && row.ordinariness !== null ? Number(row.ordinariness) : null;
  if (error || !row || ordinariness === null) {
    return {
      ordinariness,
      deviation: null,
      percentile: null,
      rankLevel: null,
      rankLabel: null,
      rankDescription: null,
      comparedUsers: Number(row?.compared_users ?? 0),
    };
  }
  const deviation = Number(row.deviation);
  const band = rankFromDeviation(deviation);
  return {
    ordinariness,
    deviation,
    percentile: row.percentile === null ? null : Number(row.percentile),
    rankLevel: band.level,
    rankLabel: band.label,
    rankDescription: band.description,
    comparedUsers: Number(row.compared_users ?? 0),
  };
}

/* ---------------------------- お気に入り ---------------------------- */

export async function isFavorited(questionId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("favorites")
    .select("id")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** お気に入りの切り替え。いいねと同じく1往復で済ませる */
export async function toggleFavorite(questionId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("toggle_favorite", {
    p_question_id: questionId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** 自分がいいねしたコメント */
export async function getLikedComments(
  _userId: string,
  limit: number,
): Promise<LikedCommentView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_liked_comments", {
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((c) => ({
    id: c.id as string,
    questionId: c.question_id as string,
    questionText: c.question_text as string,
    body: c.body as string,
    authorUsername: (c.author_username as string) ?? "unknown",
    likeCount: Number(c.like_count ?? 0),
  }));
}

export async function getFavorites(userId: string): Promise<FavoriteItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data: favorites } = await supabase
    .from("favorites")
    .select("question_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const ids = (favorites ?? []).map((f) => f.question_id as string);
  if (ids.length === 0) return [];

  const [{ data: questions }, { data: myVotes }] = await Promise.all([
    supabase.from("questions").select(QUESTION_COLUMNS).in("id", ids),
    supabase.from("votes").select("question_id").eq("user_id", userId).in("question_id", ids),
  ]);

  const list = (questions ?? []) as Question[];
  const answered = new Set((myVotes ?? []).map((v) => v.question_id as string));

  const authorIds = [...new Set(list.map((q) => q.author_id))];
  const { data: authors } = authorIds.length
    ? await supabase.from("public_profiles").select("id, username").in("id", authorIds)
    : { data: [] };
  const names = new Map(
    (authors ?? []).map((a) => [a.id as string, a.username as string]),
  );

  // お気に入り登録順を保つ
  return ids
    .map((id) => list.find((q) => q.id === id))
    .filter((q): q is Question => !!q)
    .map((question) => ({
      question,
      authorUsername: names.get(question.author_id) ?? "unknown",
      answered: answered.has(question.id),
    }));
}

/* ------------------------------ 管理 ------------------------------ */

export async function adminGetQuestions(): Promise<AdminQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("questions")
    .select(QUESTION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  const list = (data ?? []) as Question[];

  const authorIds = [...new Set(list.map((q) => q.author_id))];
  const { data: authors } = authorIds.length
    ? await supabase
        .from("public_profiles")
        .select("id, username")
        .in("id", authorIds)
    : { data: [] };
  const names = new Map(
    (authors ?? []).map((a) => [a.id as string, a.username as string]),
  );

  return list.map((q) => ({
    ...q,
    authorUsername: names.get(q.author_id) ?? "unknown",
    voteCount: null, // 件数は管理者でもRLS越しの集計になるため未取得
    reportCount: null,
  }));
}

export async function adminGetReports(): Promise<AdminReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const reports = (data ?? []) as AdminReport[];
  if (reports.length === 0) return [];

  const [{ data: questions }, { data: reporters }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, question_text")
      .in("id", [...new Set(reports.map((r) => r.question_id))]),
    supabase
      .from("public_profiles")
      .select("id, username")
      .in("id", [...new Set(reports.map((r) => r.reporter_id))]),
  ]);

  const qMap = new Map(
    (questions ?? []).map((q) => [q.id as string, q.question_text as string]),
  );
  const uMap = new Map(
    (reporters ?? []).map((u) => [u.id as string, u.username as string]),
  );

  return reports.map((r) => ({
    ...r,
    questionText: qMap.get(r.question_id) ?? null,
    reporterUsername: uMap.get(r.reporter_id) ?? "unknown",
  }));
}

export async function adminGetProfiles(): Promise<Profile[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("username")
    .limit(200);
  return (data ?? []) as Profile[];
}

export async function adminGetComments(): Promise<AdminComment[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("comments")
    .select("id, question_id, body, status, user_id")
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (data ?? []) as Record<string, unknown>[];
  if (list.length === 0) return [];

  const { data: authors } = await supabase
    .from("public_profiles")
    .select("id, username")
    .in("id", [...new Set(list.map((c) => c.user_id as string))]);
  const names = new Map(
    (authors ?? []).map((a) => [a.id as string, a.username as string]),
  );

  return list.map((c) => ({
    id: c.id as string,
    question_id: c.question_id as string,
    body: c.body as string,
    status: c.status as string,
    authorUsername: names.get(c.user_id as string) ?? "unknown",
  }));
}

export async function adminSetQuestionStatus(
  questionId: string,
  status: QuestionStatus,
) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("questions").update({ status }).eq("id", questionId);
}

export async function adminResolveReport(reportId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId);
}

export async function adminToggleSuspend(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_suspended, is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.is_admin) return;
  await supabase
    .from("profiles")
    .update({ is_suspended: !data.is_suspended })
    .eq("id", userId);
}

export async function adminSetMinVotes(value: number) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("app_settings")
    .update({ min_other_votes: value })
    .eq("id", 1);
}

export async function getDemoCounts(): Promise<DemoCountsView> {
  const supabase = await createSupabaseServerClient();
  const count = async (table: string, demo: boolean) => {
    const { count: n } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_demo", demo);
    return n ?? 0;
  };
  const [
    demoUsers,
    demoQuestions,
    demoVotes,
    demoComments,
    realQuestions,
    realVotes,
  ] = await Promise.all([
    count("profiles", true),
    count("questions", true),
    count("votes", true),
    count("comments", true),
    count("questions", false),
    count("votes", false),
  ]);
  return {
    demoUsers,
    demoQuestions,
    demoVotes,
    demoComments,
    realQuestions,
    realVotes,
    realVotesOnDemoQuestions: 0,
  };
}

export async function purgeDemo(mode: "votes" | "all") {
  const supabase = await createSupabaseServerClient();
  await supabase.from("comments").delete().eq("is_demo", true);
  await supabase.from("votes").delete().eq("is_demo", true);
  if (mode === "all") {
    await supabase.from("questions").delete().eq("is_demo", true);
    // アカウント(auth.users)の削除には service_role が必要なため、
    // supabase/purge_demo.sql をSQL Editorで実行する
  }
}
