export type Choice = "A" | "B";

export type QuestionStatus = "active" | "hidden" | "deleted";

/**
 * ローカル開発用のダミーデータには is_demo: true を付与する。
 * 実データ（実際に登録・投稿・投票されたもの）には付かないため、
 * ダミーだけを後から安全に削除できる。
 */
export type DemoFlag = { is_demo?: boolean };

/** Supabase Auth の user に相当（ローカルではモック） */
export type AuthUser = DemoFlag & {
  id: string;
  email: string;
  display_name: string;
  provider: "google";
  created_at: string;
};

export type Profile = DemoFlag & {
  id: string; // auth user id と一致
  /** 一度決めたら変更できない（DBのトリガーでも禁止している） */
  username: string;
  /** 本名。非公開 */
  real_name: string;
  /** 医籍登録番号。自己申告・非公開・本サービスでは照合しない */
  license_number: string;
  /** 職業。公開情報。指標の集計対象は「医師」のみ */
  occupation: string;
  specialty_id: number;
  work_prefecture: string; // 非公開
  is_physician: boolean;
  is_admin: boolean;
  is_suspended: boolean;
  /** 出題する診療科（複数可）。空ならすべて */
  filter_category_ids: number[];
  /** 出題するレベル（複数可）。空ならすべて */
  filter_levels: string[];
  /** 出題順をシャッフルするか */
  shuffle_questions: boolean;
  created_at: string;
  updated_at: string;
};

/** 他ユーザーに公開してよい項目のみ（work_prefecture を含まない） */
export type PublicProfile = Omit<
  Profile,
  "work_prefecture" | "is_suspended" | "updated_at"
>;

export type Specialty = {
  id: number;
  name: string;
  display_order: number;
  active: boolean;
};

export type Category = {
  id: number;
  name: string;
  display_order: number;
  active: boolean;
};

export type Question = DemoFlag & {
  id: string;
  author_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  category_id: number;
  /** 想定する対象レベル（研修医／非専門医／専門医） */
  level: string;
  status: QuestionStatus;
  /** 添付画像（1枚まで）。未添付なら null */
  image_url: string | null;
  created_at: string;
};

export type Vote = DemoFlag & {
  id: string;
  question_id: string;
  user_id: string;
  choice: Choice;
  created_at: string;
};

export const REPORT_REASONS = [
  "個人情報が含まれている",
  "不適切な内容",
  "医療と無関係",
  "重複質問",
  "誹謗中傷",
  "その他",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export type Report = {
  id: string;
  reporter_id: string;
  question_id: string;
  reason: string;
  status: "open" | "resolved";
  created_at: string;
};

export type AppSettings = {
  /** 普通度・多数派一致率の計算対象となる「本人以外」の最低回答数 */
  min_other_votes: number;
};

export type CommentStatus = "visible" | "hidden" | "deleted";

export type Comment = DemoFlag & {
  id: string;
  question_id: string;
  user_id: string;
  /** 返信先のコメント。null なら質問への直接のコメント */
  parent_id: string | null;
  body: string;
  status: CommentStatus;
  created_at: string;
};

/** 削除推奨。管理者が押すと即削除、一般は3人で削除 */
/** コメントへのいいね */
export type CommentLike = {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
};

export type RemovalRequest = {
  id: string;
  question_id: string;
  user_id: string;
  created_at: string;
};

export type Favorite = {
  id: string;
  question_id: string;
  user_id: string;
  created_at: string;
};

/** シードデータの構造が変わったらこの値を上げる（不一致なら初期データを作り直す） */
export const DB_SCHEMA_VERSION = 11;

export type Database = {
  schema_version: number;
  auth_users: AuthUser[];
  profiles: Profile[];
  specialties: Specialty[];
  categories: Category[];
  questions: Question[];
  votes: Vote[];
  comments: Comment[];
  favorites: Favorite[];
  comment_likes: CommentLike[];
  removal_requests: RemovalRequest[];
  reports: Report[];
  settings: AppSettings;
};

/** question_stats View 相当（本人除外は行わない全体集計） */
export type QuestionStats = {
  question_id: string;
  vote_count: number;
  a_count: number;
  b_count: number;
  a_ratio: number;
  b_ratio: number;
  majority_choice: Choice | null;
};

/** get_user_ordinariness(user_id) RPC 相当 */
export type UserMetrics = {
  ordinariness: number | null;
  majority_agreement_rate: number | null;
  eligible_question_count: number;
  answered_question_count: number;
  posted_question_count: number;
};
