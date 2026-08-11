import type {
  Choice,
  Profile,
  Question,
  Report,
  UserMetrics,
} from "../types";

/** バックエンド共通の戻り値の形 */

export type SessionInfo = {
  userId: string;
  email: string | null;
  profile: Profile | null;
} | null;

export type FeedItem = {
  question: Question;
  answered: boolean;
  authorUsername: string;
  authorSpecialtyId: number;
  commentCount: number;
};

export type QuestionWithAuthor = Question & {
  authorUsername: string;
  authorSpecialtyId: number;
};

/** 回答済みの場合のみ得られる結果（未回答なら null） */
export type QuestionResult = {
  voteCount: number;
  aCount: number;
  bCount: number;
  aRatio: number;
  bRatio: number;
  myChoice: Choice;
  otherCount: number;
  /** 本人を除いた回答者のうち、自分と同じ選択の割合（0-100） */
  agreementRate: number | null;
  /** 本人を除いた多数派。同数なら null */
  otherMajorityChoice: Choice | null;
  /** 最低回答数を満たしているか */
  eligible: boolean;
};

/** ログインなしのお試しで出す質問（作者情報は出さない） */
export type TrialQuestion = {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  category_id: number;
  level: string;
};

/** お試しの分布（本人の回答はサーバーに無いので全体集計のみ） */
export type TrialResult = {
  voteCount: number;
  aCount: number;
  bCount: number;
  aRatio: number;
  bRatio: number;
};

export type CommentView = {
  id: string;
  question_id: string;
  user_id: string;
  /** 返信先。null なら質問への直接のコメント */
  parentId: string | null;
  body: string;
  created_at: string;
  authorUsername: string;
  authorSpecialtyId: number;
  authorChoice: Choice | null;
  likeCount: number;
  likedByMe: boolean;
};

/** お試し（未ログイン）で見せるコメント。読むだけなので投稿者IDは持たない */
export type TrialComment = {
  id: string;
  parentId: string | null;
  body: string;
  created_at: string;
  authorUsername: string;
  authorSpecialtyId: number;
  authorChoice: Choice | null;
  likeCount: number;
};

/** プロフィールに出す自分のコメント */
export type MyCommentView = {
  id: string;
  questionId: string;
  questionText: string;
  body: string;
  created_at: string;
  likeCount: number;
  isReply: boolean;
};

/**
 * プロフィールに出す「投稿した質問」。
 * 反響の数値は見る人によって出し分ける（0026）。
 *   voteCount      … 投稿者本人・管理者のみ。それ以外は null
 *   aCount/bCount/commentCount … 見ている人が回答済みのときのみ。それ以外は null
 */
export type AuthoredQuestion = Question & {
  voteCount: number | null;
  aCount: number | null;
  bCount: number | null;
  commentCount: number | null;
  viewerAnswered: boolean;
};

/** 運営への要望（管理画面で読む） */
export type FeedbackView = {
  id: string;
  body: string;
  status: string;
  created_at: string;
  authorUsername: string;
};

export type AdminQuestion = Question & {
  authorUsername: string;
  voteCount: number | null;
  reportCount: number | null;
};

export type AdminComment = {
  id: string;
  question_id: string;
  body: string;
  status: string;
  authorUsername: string;
};

export type AdminReport = Report & {
  questionText: string | null;
  reporterUsername: string;
};

export type RecentAnswerView = {
  questionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  myChoice: Choice;
  agreementRate: number | null;
  majorityMatched: boolean | null;
  eligible: boolean;
};

/** 成績表・プロフィールで使う指標一式（get_user_report の戻り値） */
export type UserReportView = UserMetrics & RankingView;

/** 偏差値10段階ごとの人数（ヒストグラム用） */
export type DistributionBand = {
  level: number;
  userCount: number;
};

export type RankingView = {
  ordinariness: number | null;
  deviation: number | null;
  percentile: number | null;
  rankLevel: number | null;
  rankLabel: string | null;
  rankDescription: string | null;
  comparedUsers: number;
};

/** いいねしたコメント */
export type LikedCommentView = {
  id: string;
  questionId: string;
  questionText: string;
  body: string;
  authorUsername: string;
  likeCount: number;
};

export type FavoriteItem = {
  question: Question;
  authorUsername: string;
  answered: boolean;
};

export type DemoCountsView = {
  demoUsers: number;
  demoQuestions: number;
  demoVotes: number;
  demoComments: number;
  realQuestions: number;
  realVotes: number;
  realVotesOnDemoQuestions: number;
};

export type { UserMetrics };
