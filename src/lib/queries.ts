import "server-only";
import { getDb } from "./db";
import { METRIC_OCCUPATION } from "./master";
import {
  computeQuestionStats,
  computeSelfExcluded,
  computeUserMetrics,
} from "./metrics";
export type { RankBand, Ranking } from "./metrics";
import type {
  Choice,
  Comment,
  Profile,
  PublicProfile,
  Question,
  QuestionStats,
  Report,
  UserMetrics,
} from "./types";

export function toPublicProfile(p: Profile): PublicProfile {
  // work_prefecture は公開APIから除外（要件定義 §49）
  const { work_prefecture: _wp, is_suspended: _s, updated_at: _u, ...pub } = p;
  return pub;
}

/** 指標の集計対象（医師）のIDを集める */
function doctorIds(): Set<string> {
  return new Set(
    getDb()
      .profiles.filter((p) => p.occupation === METRIC_OCCUPATION)
      .map((p) => p.id),
  );
}

export function getMinOtherVotes(): number {
  return getDb().settings.min_other_votes;
}

export function getProfileById(id: string): Profile | null {
  return getDb().profiles.find((p) => p.id === id) ?? null;
}

export function getProfileByUsername(username: string): Profile | null {
  const lower = username.toLowerCase();
  return (
    getDb().profiles.find((p) => p.username.toLowerCase() === lower) ?? null
  );
}

export function isUsernameTaken(username: string, exceptId?: string): boolean {
  const lower = username.toLowerCase();
  return getDb().profiles.some(
    (p) => p.username.toLowerCase() === lower && p.id !== exceptId,
  );
}

export function getVisibleQuestions(): Question[] {
  return getDb().questions.filter((q) => q.status === "active");
}

export function getQuestionById(id: string): Question | null {
  return getDb().questions.find((q) => q.id === id) ?? null;
}

export function getQuestionStats(questionId: string): QuestionStats {
  // 分布も医師の回答のみを対象にする
  const doctors = doctorIds();
  return computeQuestionStats(
    questionId,
    getDb().votes.filter((v) => doctors.has(v.user_id)),
  );
}

export function getUserVote(questionId: string, userId: string) {
  return (
    getDb().votes.find(
      (v) => v.question_id === questionId && v.user_id === userId,
    ) ?? null
  );
}

export function getSelfExcluded(
  questionId: string,
  userId: string,
  choice: Choice,
) {
  const doctors = doctorIds();
  return computeSelfExcluded(
    questionId,
    userId,
    choice,
    getDb().votes,
    getMinOtherVotes(),
    (id) => doctors.has(id),
  );
}

export function getUserMetrics(userId: string): UserMetrics {
  const db = getDb();
  const visible = new Set(
    db.questions.filter((q) => q.status === "active").map((q) => q.id),
  );
  const doctors = doctorIds();
  return computeUserMetrics({
    userId,
    votes: db.votes,
    visibleQuestionIds: visible,
    minOtherVotes: db.settings.min_other_votes,
    postedQuestionCount: db.questions.filter(
      (q) => q.author_id === userId && q.status !== "deleted",
    ).length,
    counts: (id) => doctors.has(id),
  });
}

export type FeedItem = {
  question: Question;
  answered: boolean;
  authorUsername: string;
  authorSpecialtyId: number;
  totalVotes: number;
  commentCount: number;
};

/**
 * フィード優先度（要件定義 §31）
 * 1. 未回答 2. 新しい質問 3. 回答が集まっていない質問
 */
export function getFeed(userId: string): FeedItem[] {
  const db = getDb();
  const answeredIds = new Set(
    db.votes.filter((v) => v.user_id === userId).map((v) => v.question_id),
  );
  const min = db.settings.min_other_votes;

  return getVisibleQuestions()
    .map((question) => {
      const author = db.profiles.find((p) => p.id === question.author_id);
      const totalVotes = db.votes.filter(
        (v) => v.question_id === question.id,
      ).length;
      return {
        question,
        answered: answeredIds.has(question.id),
        authorUsername: author?.username ?? "unknown",
        authorSpecialtyId: author?.specialty_id ?? 0,
        totalVotes,
        commentCount: db.comments.filter(
          (c) => c.question_id === question.id && c.status === "visible",
        ).length,
      };
    })
    .sort((x, y) => {
      if (x.answered !== y.answered) return x.answered ? 1 : -1;
      const xNeeds = x.totalVotes < min ? 0 : 1;
      const yNeeds = y.totalVotes < min ? 0 : 1;
      const xNew = Date.parse(x.question.created_at);
      const yNew = Date.parse(y.question.created_at);
      if (yNew !== xNew) return yNew - xNew;
      return xNeeds - yNeeds;
    });
}

/** 次の未回答質問（連続回答体験・要件定義 §32） */
export function getNextUnansweredQuestionId(
  userId: string,
  excludeId?: string,
): string | null {
  const next = getFeed(userId).find(
    (item) => !item.answered && item.question.id !== excludeId,
  );
  return next?.question.id ?? null;
}

/**
 * 全ユーザーの普通度分布（偏差値の計算に使う）。
 * ユーザーごとに全投票を走査すると O(ユーザー数 × 投票数) になるため、
 * 質問ごとのA/B集計を1回だけ作って O(投票数) で求める。
 */
export function getAllOrdinariness(): number[] {
  const db = getDb();
  const min = db.settings.min_other_votes;
  const visible = new Set(
    db.questions.filter((q) => q.status === "active").map((q) => q.id),
  );

  // 医師の回答だけを集計対象にする
  const countedIds = doctorIds();

  // 質問ごとの集計を1度だけ作る
  const tally = new Map<string, { a: number; b: number }>();
  for (const v of db.votes) {
    if (!visible.has(v.question_id) || !countedIds.has(v.user_id)) continue;
    const t = tally.get(v.question_id) ?? { a: 0, b: 0 };
    if (v.choice === "A") t.a++;
    else t.b++;
    tally.set(v.question_id, t);
  }

  // ユーザーごとに「自分を除いた集計」を引き算で求める
  const sums = new Map<string, { total: number; count: number }>();
  for (const v of db.votes) {
    const t = tally.get(v.question_id);
    if (!t) continue;
    const isDoctor = countedIds.has(v.user_id);
    const otherA = t.a - (v.choice === "A" && isDoctor ? 1 : 0);
    const otherB = t.b - (v.choice === "B" && isDoctor ? 1 : 0);
    const others = otherA + otherB;
    if (others < min) continue;
    const same = v.choice === "A" ? otherA : otherB;
    const acc = sums.get(v.user_id) ?? { total: 0, count: 0 };
    acc.total += (same / others) * 100;
    acc.count += 1;
    sums.set(v.user_id, acc);
  }

  // 母集団は医師のみ
  const doctors = doctorIds();
  return [...sums.entries()]
    .filter(([userId]) => doctors.has(userId))
    .map(([, s]) => s.total / s.count);
}

export type RecentAnswer = {
  questionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  myChoice: Choice;
  agreementRate: number | null;
  majorityMatched: boolean | null;
  eligible: boolean;
  answeredAt: string;
};

/** 直近に回答した質問（成績表で使う） */
export function getRecentAnswers(userId: string, limit: number): RecentAnswer[] {
  const db = getDb();
  const doctors = doctorIds();
  return db.votes
    .filter((v) => v.user_id === userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit)
    .map((v) => {
      const question = db.questions.find((q) => q.id === v.question_id);
      const self = computeSelfExcluded(
        v.question_id,
        userId,
        v.choice,
        db.votes,
        db.settings.min_other_votes,
        (id) => doctors.has(id),
      );
      return {
        questionId: v.question_id,
        questionText: question?.question_text ?? "(削除された質問)",
        optionA: question?.option_a ?? "",
        optionB: question?.option_b ?? "",
        myChoice: v.choice,
        agreementRate: self.agreementRate,
        majorityMatched:
          self.majorityChoice === null ? null : self.majorityChoice === v.choice,
        eligible: self.eligible,
        answeredAt: v.created_at,
      };
    });
}

export function getAnsweredCount(userId: string): number {
  return getDb().votes.filter((v) => v.user_id === userId).length;
}

export function isFavorited(questionId: string, userId: string): boolean {
  return getDb().favorites.some(
    (f) => f.question_id === questionId && f.user_id === userId,
  );
}

export type CommentView = Comment & {
  authorUsername: string;
  authorSpecialtyId: number;
  /** そのコメントの投稿者がどちらを選んだか（回答済みユーザーにのみ表示する） */
  authorChoice: Choice | null;
  likeCount: number;
  likedByMe: boolean;
};

/**
 * 質問のコメント一覧。
 * 回答前のユーザーには見せない（回答分布が推測できてしまうため）。
 */
export function getComments(
  questionId: string,
  viewerId: string,
): CommentView[] {
  const db = getDb();
  return db.comments
    .filter((c) => c.question_id === questionId && c.status === "visible")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((c) => {
      const author = db.profiles.find((p) => p.id === c.user_id);
      const vote = db.votes.find(
        (v) => v.question_id === questionId && v.user_id === c.user_id,
      );
      const likes = db.comment_likes.filter((l) => l.comment_id === c.id);
      return {
        ...c,
        authorUsername: author?.username ?? "unknown",
        authorSpecialtyId: author?.specialty_id ?? 0,
        authorChoice: vote?.choice ?? null,
        likeCount: likes.length,
        likedByMe: likes.some((l) => l.user_id === viewerId),
      };
    });
}

/** プロフィール用：自分のコメントと、もらったいいね */
export function getUserComments(userId: string, limit: number) {
  const db = getDb();
  return db.comments
    .filter((c) => c.user_id === userId && c.status === "visible")
    .map((c) => ({
      comment: c,
      likeCount: db.comment_likes.filter((l) => l.comment_id === c.id).length,
    }))
    .sort(
      (a, b) =>
        b.likeCount - a.likeCount ||
        Date.parse(b.comment.created_at) - Date.parse(a.comment.created_at),
    )
    .slice(0, limit)
    .map(({ comment, likeCount }) => ({
      id: comment.id,
      questionId: comment.question_id,
      questionText:
        db.questions.find((q) => q.id === comment.question_id)?.question_text ??
        "(削除された質問)",
      body: comment.body,
      created_at: comment.created_at,
      likeCount,
      isReply: comment.parent_id !== null,
    }));
}

/** もらったいいねの合計 */
export function getReceivedLikeCount(userId: string): number {
  const db = getDb();
  const mine = new Set(
    db.comments
      .filter((c) => c.user_id === userId && c.status === "visible")
      .map((c) => c.id),
  );
  return db.comment_likes.filter((l) => mine.has(l.comment_id)).length;
}

export function getCommentCount(questionId: string): number {
  return getDb().comments.filter(
    (c) => c.question_id === questionId && c.status === "visible",
  ).length;
}

export function getAllCommentsForAdmin() {
  const db = getDb();
  return db.comments
    .filter((c) => c.status !== "deleted")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((c) => ({
      ...c,
      authorUsername:
        db.profiles.find((p) => p.id === c.user_id)?.username ?? "unknown",
    }));
}

export function getQuestionsByAuthor(authorId: string): Question[] {
  return getDb()
    .questions.filter((q) => q.author_id === authorId && q.status !== "deleted")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function getOpenReports(): (Report & {
  question: Question | null;
  reporterUsername: string;
})[] {
  const db = getDb();
  return db.reports
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((r) => ({
      ...r,
      question: db.questions.find((q) => q.id === r.question_id) ?? null,
      reporterUsername:
        db.profiles.find((p) => p.id === r.reporter_id)?.username ?? "unknown",
    }));
}

export function getAllQuestionsForAdmin() {
  const db = getDb();
  return db.questions
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((q) => ({
      ...q,
      authorUsername:
        db.profiles.find((p) => p.id === q.author_id)?.username ?? "unknown",
      voteCount: db.votes.filter((v) => v.question_id === q.id).length,
      reportCount: db.reports.filter((r) => r.question_id === q.id).length,
    }));
}

export function getAllProfilesForAdmin(): Profile[] {
  return getDb()
    .profiles.slice()
    .sort((a, b) => a.username.localeCompare(b.username));
}
