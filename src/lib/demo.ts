import type { Database } from "./types";

/**
 * ダミーデータ（is_demo: true）の集計と削除。
 * 純粋関数なので、管理画面のサーバーアクションからも
 * CLI（scripts/purge-demo.ts）からも同じロジックを使える。
 *
 * 実データ（実際に登録・投稿・回答されたもの）には is_demo が付かないため、
 * ダミーだけを安全に取り除ける。
 */

export type DemoCounts = {
  demoUsers: number;
  demoQuestions: number;
  demoVotes: number;
  demoComments: number;
  realVotes: number;
  realQuestions: number;
  /** ダミー質問に付いている実ユーザーの回答数（全削除で一緒に消える） */
  realVotesOnDemoQuestions: number;
};

export function countDemoData(db: Database): DemoCounts {
  const demoQuestionIds = new Set(
    db.questions.filter((q) => q.is_demo).map((q) => q.id),
  );
  return {
    demoUsers: db.profiles.filter((p) => p.is_demo).length,
    demoQuestions: demoQuestionIds.size,
    demoVotes: db.votes.filter((v) => v.is_demo).length,
    demoComments: db.comments.filter((c) => c.is_demo).length,
    realVotes: db.votes.filter((v) => !v.is_demo).length,
    realQuestions: db.questions.filter((q) => !q.is_demo).length,
    realVotesOnDemoQuestions: db.votes.filter(
      (v) => !v.is_demo && demoQuestionIds.has(v.question_id),
    ).length,
  };
}

export type PurgeResult = {
  removedVotes: number;
  removedComments: number;
  removedQuestions: number;
  removedUsers: number;
  removedReports: number;
};

/**
 * ダミー医師の投票・コメントだけを削除する。
 * 質問とユーザーは残るため、実際の回答だけが残った状態で分布を見られる。
 */
export function purgeDemoVotes(db: Database): PurgeResult {
  const beforeVotes = db.votes.length;
  const beforeComments = db.comments.length;
  db.votes = db.votes.filter((v) => !v.is_demo);
  db.comments = db.comments.filter((c) => !c.is_demo);
  return {
    removedVotes: beforeVotes - db.votes.length,
    removedComments: beforeComments - db.comments.length,
    removedQuestions: 0,
    removedUsers: 0,
    removedReports: 0,
  };
}

/**
 * ダミーデータを全て削除する（ユーザー・質問・投票・コメント・通報）。
 * ダミー質問に付いた実ユーザーの回答・コメントも、質問ごと消える点に注意。
 */
export function purgeAllDemoData(db: Database): PurgeResult {
  const before = {
    votes: db.votes.length,
    comments: db.comments.length,
    questions: db.questions.length,
    users: db.profiles.length,
    reports: db.reports.length,
  };

  const demoQuestionIds = new Set(
    db.questions.filter((q) => q.is_demo).map((q) => q.id),
  );
  const demoUserIds = new Set(
    db.profiles.filter((p) => p.is_demo).map((p) => p.id),
  );

  const isOrphan = (questionId: string, userId: string) =>
    demoQuestionIds.has(questionId) || demoUserIds.has(userId);

  db.votes = db.votes.filter((v) => !v.is_demo && !isOrphan(v.question_id, v.user_id));
  db.comments = db.comments.filter(
    (c) => !c.is_demo && !isOrphan(c.question_id, c.user_id),
  );
  db.reports = db.reports.filter(
    (r) => !isOrphan(r.question_id, r.reporter_id),
  );
  db.questions = db.questions.filter((q) => !q.is_demo);
  db.profiles = db.profiles.filter((p) => !p.is_demo);
  db.auth_users = db.auth_users.filter((u) => !u.is_demo);

  return {
    removedVotes: before.votes - db.votes.length,
    removedComments: before.comments - db.comments.length,
    removedQuestions: before.questions - db.questions.length,
    removedUsers: before.users - db.profiles.length,
    removedReports: before.reports - db.reports.length,
  };
}
