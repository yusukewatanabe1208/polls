import "server-only";
import { getDb, mutateDb, newId, resetDb } from "../db";
import { countDemoData, purgeAllDemoData, purgeDemoVotes } from "../demo";
import { DEMO_PRUNE_THRESHOLD, REMOVAL_THRESHOLD } from "../limits";
import { computeRanking } from "../metrics";
import { applyQuizPreferences } from "../quizFilter";
import * as q from "../queries";
import { clearSession, getSession as getMockSession } from "../session";
import type {
  Choice,
  CommentStatus,
  Profile,
  Question,
  QuestionStatus,
} from "../types";
import type {
  AdminComment,
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
  UserMetrics,
} from "./shapes";

/** ローカルJSON＋モック認証のバックエンド（Supabase未設定でも動く） */

export async function getSession(): Promise<SessionInfo> {
  const s = await getMockSession();
  if (!s) return null;
  return { userId: s.authUser.id, email: s.authUser.email, profile: s.profile };
}

export async function checkSchemaReady(): Promise<{
  ready: boolean;
  message?: string;
}> {
  return { ready: true };
}

export async function signOut() {
  await clearSession();
}

export async function getMinOtherVotes(): Promise<number> {
  return q.getMinOtherVotes();
}

export async function getProfileByUsername(
  username: string,
): Promise<Profile | null> {
  return q.getProfileByUsername(username);
}

export async function isUsernameTaken(username: string, exceptId?: string) {
  return q.isUsernameTaken(username, exceptId);
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
  const now = new Date().toISOString();
  mutateDb((db) => {
    db.profiles.push({
      id: input.id,
      username: input.username,
      real_name: input.realName,
      license_number: input.licenseNumber,
      occupation: input.occupation,
      specialty_id: input.specialtyId,
      work_prefecture: input.prefecture,
      is_physician: true,
      is_admin: false,
      is_suspended: false,
      filter_category_ids: [],
      filter_levels: [],
      shuffle_questions: true,
      created_at: now,
      updated_at: now,
    });
  });
}

/** ユーザーネームは変更できないため受け取らない */
export async function updateProfile(input: {
  id: string;
  realName: string;
  licenseNumber: string;
  occupation: string;
  specialtyId: number;
  prefecture: string;
}) {
  mutateDb((db) => {
    const p = db.profiles.find((x) => x.id === input.id);
    if (!p) return;
    p.real_name = input.realName;
    p.license_number = input.licenseNumber;
    p.occupation = input.occupation;
    p.specialty_id = input.specialtyId;
    p.work_prefecture = input.prefecture;
    p.updated_at = new Date().toISOString();
  });
}

/** 出題の絞り込み設定を保存する */
export async function updateQuizPreferences(input: {
  id: string;
  categoryIds: number[];
  levels: string[];
  shuffle: boolean;
}) {
  mutateDb((db) => {
    const p = db.profiles.find((x) => x.id === input.id);
    if (!p) return;
    p.filter_category_ids = input.categoryIds;
    p.filter_levels = input.levels;
    p.shuffle_questions = input.shuffle;
    p.updated_at = new Date().toISOString();
  });
}

export async function getFeed(userId: string): Promise<FeedItem[]> {
  const items = q.getFeed(userId).map((f) => ({
    question: f.question,
    answered: f.answered,
    authorUsername: f.authorUsername,
    authorSpecialtyId: f.authorSpecialtyId,
    commentCount: f.commentCount,
  }));
  const profile = q.getProfileById(userId);
  return profile ? applyQuizPreferences(items, profile) : items;
}

export async function getNextUnansweredQuestionId(
  userId: string,
  excludeId?: string,
) {
  return q.getNextUnansweredQuestionId(userId, excludeId);
}

export async function getQuestion(
  id: string,
): Promise<QuestionWithAuthor | null> {
  const question = q.getQuestionById(id);
  if (!question) return null;
  const author = q.getProfileById(question.author_id);
  return {
    ...question,
    authorUsername: author?.username ?? "unknown",
    authorSpecialtyId: author?.specialty_id ?? 0,
  };
}

export async function getQuestionResult(
  questionId: string,
  userId: string,
): Promise<QuestionResult | null> {
  const vote = q.getUserVote(questionId, userId);
  if (!vote) return null;
  const stats = q.getQuestionStats(questionId);
  const self = q.getSelfExcluded(questionId, userId, vote.choice);
  return {
    voteCount: stats.vote_count,
    aCount: stats.a_count,
    bCount: stats.b_count,
    aRatio: stats.a_ratio,
    bRatio: stats.b_ratio,
    myChoice: vote.choice,
    otherCount: self.otherCount,
    agreementRate: self.agreementRate,
    otherMajorityChoice: self.majorityChoice,
    eligible: self.eligible,
  };
}

export async function hasVoted(questionId: string, userId: string) {
  return !!q.getUserVote(questionId, userId);
}

export async function insertVote(
  questionId: string,
  userId: string,
  choice: Choice,
): Promise<{ error?: string }> {
  const db = getDb();
  const question = db.questions.find((x) => x.id === questionId);
  if (!question || question.status !== "active") {
    return { error: "この質問には回答できません。" };
  }
  if (db.votes.some((v) => v.question_id === questionId && v.user_id === userId)) {
    return { error: "この質問にはすでに回答済みです。" };
  }
  mutateDb((d) => {
    d.votes.push({
      id: newId("v"),
      question_id: questionId,
      user_id: userId,
      choice,
      created_at: new Date().toISOString(),
    });

    // 実ユーザーの回答が規定数に達したら、デモ医師の回答を取り除く
    const realVotes = d.votes.filter(
      (v) => v.question_id === questionId && !v.is_demo,
    ).length;
    if (realVotes >= DEMO_PRUNE_THRESHOLD) {
      d.votes = d.votes.filter(
        (v) => !(v.question_id === questionId && v.is_demo),
      );
      d.comments = d.comments.filter(
        (c) => !(c.question_id === questionId && c.is_demo),
      );
    }
  });
  return {};
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
  const id = newId("q");
  mutateDb((db) => {
    db.questions.push({
      id,
      author_id: input.authorId,
      question_text: input.text,
      option_a: input.optionA,
      option_b: input.optionB,
      category_id: input.categoryId,
      level: input.level,
      status: "active",
      image_url: input.imageUrl,
      created_at: new Date().toISOString(),
    });
  });
  return { id };
}

/** 画像を .data/uploads に保存し、配信用URLを返す */
export async function uploadQuestionImage(
  file: File,
  userId: string,
): Promise<{ url?: string; error?: string }> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), ".data", "uploads");
  fs.mkdirSync(dir, { recursive: true });

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
  const name = `${userId.slice(0, 8)}-${newId("img").slice(4)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, name), buffer);

  return { url: `/api/uploads/${name}` };
}

export async function getQuestionsByAuthor(
  authorId: string,
): Promise<Question[]> {
  return q.getQuestionsByAuthor(authorId);
}

export async function getComments(
  questionId: string,
  viewerId: string,
): Promise<CommentView[]> {
  return q.getComments(questionId, viewerId).map((c) => ({
    id: c.id,
    question_id: c.question_id,
    user_id: c.user_id,
    parentId: c.parent_id,
    body: c.body,
    created_at: c.created_at,
    authorUsername: c.authorUsername,
    authorSpecialtyId: c.authorSpecialtyId,
    authorChoice: c.authorChoice,
    likeCount: c.likeCount,
    likedByMe: c.likedByMe,
  }));
}

/** いいねの付け外し。戻り値は押した後の状態 */
export async function toggleCommentLike(
  commentId: string,
  userId: string,
): Promise<boolean> {
  let liked = false;
  mutateDb((db) => {
    const idx = db.comment_likes.findIndex(
      (l) => l.comment_id === commentId && l.user_id === userId,
    );
    if (idx >= 0) {
      db.comment_likes.splice(idx, 1);
      liked = false;
    } else {
      db.comment_likes.push({
        id: newId("cl"),
        comment_id: commentId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });
      liked = true;
    }
  });
  return liked;
}

export async function getMyComments(
  userId: string,
  limit: number,
): Promise<MyCommentView[]> {
  return q.getUserComments(userId, limit);
}

export async function getReceivedLikeCount(userId: string): Promise<number> {
  return q.getReceivedLikeCount(userId);
}

export async function insertComment(input: {
  questionId: string;
  userId: string;
  body: string;
  parentId: string | null;
}): Promise<{ error?: string }> {
  mutateDb((db) => {
    db.comments.push({
      id: newId("c"),
      question_id: input.questionId,
      user_id: input.userId,
      parent_id: input.parentId,
      body: input.body,
      status: "visible",
      created_at: new Date().toISOString(),
    });
  });
  return {};
}

export async function setCommentStatus(
  commentId: string,
  status: CommentStatus,
  actor: { userId: string; isAdmin: boolean },
) {
  mutateDb((db) => {
    const c = db.comments.find((x) => x.id === commentId);
    if (!c) return;
    if (c.user_id !== actor.userId && !actor.isAdmin) return;
    c.status = status;
  });
}

/** 削除推奨。管理者は即削除、一般は規定人数に達したら削除 */
export async function requestRemoval(
  questionId: string,
  userId: string,
): Promise<{ removed: boolean; count: number }> {
  let removed = false;
  let count = 0;
  mutateDb((db) => {
    const already = db.removal_requests.some(
      (r) => r.question_id === questionId && r.user_id === userId,
    );
    if (!already) {
      db.removal_requests.push({
        id: newId("rr"),
        question_id: questionId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });
    }
    count = db.removal_requests.filter(
      (r) => r.question_id === questionId,
    ).length;

    const actor = db.profiles.find((p) => p.id === userId);
    if (actor?.is_admin || count >= REMOVAL_THRESHOLD) {
      const q = db.questions.find((x) => x.id === questionId);
      if (q) q.status = "deleted";
      removed = true;
    }
  });
  return { removed, count };
}

export async function hasRequestedRemoval(questionId: string, userId: string) {
  return getDb().removal_requests.some(
    (r) => r.question_id === questionId && r.user_id === userId,
  );
}

export async function insertReport(input: {
  reporterId: string;
  questionId: string;
  reason: string;
}): Promise<{ error?: string }> {
  if (!getDb().questions.some((x) => x.id === input.questionId)) {
    return { error: "質問が見つかりません。" };
  }
  mutateDb((db) => {
    db.reports.push({
      id: newId("r"),
      reporter_id: input.reporterId,
      question_id: input.questionId,
      reason: input.reason,
      status: "open",
      created_at: new Date().toISOString(),
    });
  });
  return {};
}

export async function getUserMetrics(userId: string): Promise<UserMetrics> {
  return q.getUserMetrics(userId);
}

export async function getAnsweredCount(userId: string): Promise<number> {
  return q.getAnsweredCount(userId);
}

export async function getRecentAnswers(
  userId: string,
  limit: number,
): Promise<RecentAnswerView[]> {
  return q.getRecentAnswers(userId, limit).map((r) => ({
    questionId: r.questionId,
    questionText: r.questionText,
    optionA: r.optionA,
    optionB: r.optionB,
    myChoice: r.myChoice,
    agreementRate: r.agreementRate,
    majorityMatched: r.majorityMatched,
    eligible: r.eligible,
  }));
}

export async function getRanking(userId: string): Promise<RankingView> {
  const metrics = q.getUserMetrics(userId);
  return computeRanking(metrics.ordinariness, q.getAllOrdinariness());
}

/* ---------------------------- お気に入り ---------------------------- */

export async function isFavorited(questionId: string, userId: string) {
  return q.isFavorited(questionId, userId);
}

export async function toggleFavorite(
  questionId: string,
  userId: string,
): Promise<boolean> {
  let nowFavorited = false;
  mutateDb((db) => {
    const idx = db.favorites.findIndex(
      (f) => f.question_id === questionId && f.user_id === userId,
    );
    if (idx >= 0) {
      db.favorites.splice(idx, 1);
      nowFavorited = false;
    } else {
      db.favorites.push({
        id: newId("f"),
        question_id: questionId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });
      nowFavorited = true;
    }
  });
  return nowFavorited;
}

/** 自分がいいねしたコメント */
export async function getLikedComments(
  userId: string,
  limit: number,
): Promise<LikedCommentView[]> {
  const db = getDb();
  return db.comment_likes
    .filter((l) => l.user_id === userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit)
    .map((l) => {
      const c = db.comments.find(
        (x) => x.id === l.comment_id && x.status === "visible",
      );
      if (!c) return null;
      const author = db.profiles.find((p) => p.id === c.user_id);
      return {
        id: c.id,
        questionId: c.question_id,
        questionText:
          db.questions.find((q) => q.id === c.question_id)?.question_text ??
          "(削除された質問)",
        body: c.body,
        authorUsername: author?.username ?? "unknown",
        likeCount: db.comment_likes.filter((x) => x.comment_id === c.id).length,
      };
    })
    .filter((x): x is LikedCommentView => x !== null);
}

export async function getFavorites(userId: string): Promise<FavoriteItem[]> {
  const db = getDb();
  return db.favorites
    .filter((f) => f.user_id === userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((f) => {
      const question = db.questions.find((x) => x.id === f.question_id);
      if (!question) return null;
      const author = db.profiles.find((p) => p.id === question.author_id);
      return {
        question,
        authorUsername: author?.username ?? "unknown",
        answered: db.votes.some(
          (v) => v.question_id === question.id && v.user_id === userId,
        ),
      };
    })
    .filter((x): x is FavoriteItem => x !== null);
}

/* ------------------------------ 管理 ------------------------------ */

export async function adminGetQuestions(): Promise<AdminQuestion[]> {
  return q.getAllQuestionsForAdmin();
}

export async function adminGetReports(): Promise<AdminReport[]> {
  return q.getOpenReports().map((r) => ({
    ...r,
    questionText: r.question?.question_text ?? null,
  }));
}

export async function adminGetProfiles(): Promise<Profile[]> {
  return q.getAllProfilesForAdmin();
}

export async function adminGetComments(): Promise<AdminComment[]> {
  return q.getAllCommentsForAdmin().map((c) => ({
    id: c.id,
    question_id: c.question_id,
    body: c.body,
    status: c.status,
    authorUsername: c.authorUsername,
  }));
}

export async function adminSetQuestionStatus(
  questionId: string,
  status: QuestionStatus,
) {
  mutateDb((db) => {
    const x = db.questions.find((y) => y.id === questionId);
    if (x) x.status = status;
  });
}

export async function adminResolveReport(reportId: string) {
  mutateDb((db) => {
    const r = db.reports.find((x) => x.id === reportId);
    if (r) r.status = "resolved";
  });
}

export async function adminToggleSuspend(userId: string) {
  mutateDb((db) => {
    const p = db.profiles.find((x) => x.id === userId);
    if (p && !p.is_admin) p.is_suspended = !p.is_suspended;
  });
}

export async function adminSetMinVotes(value: number) {
  mutateDb((db) => {
    db.settings.min_other_votes = value;
  });
}

export async function getDemoCounts(): Promise<DemoCountsView> {
  return countDemoData(getDb());
}

export async function purgeDemo(mode: "votes" | "all") {
  mutateDb((db) => (mode === "votes" ? purgeDemoVotes(db) : purgeAllDemoData(db)));
}

export async function resetLocalData() {
  await clearSession();
  resetDb();
}
