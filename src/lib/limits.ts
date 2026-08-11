/** 入力の上限（クライアント／サーバー／DBの3か所で同じ値を使う） */

export const QUESTION_TEXT_MAX = 300;

/** プロフィール。いずれも非公開の項目 */
export const REAL_NAME_MAX = 50;
/** 医籍登録番号は半角数字のみ。自己申告で照合はしない */
export const LICENSE_NUMBER_MAX = 20;

/** 運営への要望 */
export const FEEDBACK_TEXT_MAX = 1000;

export const OPTION_TEXT_MAX = 30;
export const COMMENT_TEXT_MAX = 500;

/** 添付画像は1枚まで・10MBまで */
export const IMAGE_MAX_COUNT = 1;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** 成績表を表示する区切り（5問ごと） */
export const REPORT_INTERVAL = 5;

/**
 * 選択肢は「はい／いいえ」に固定する。
 * 投稿者が選択肢を書く必要はなく、質問文だけを考えればよい。
 */
export const CHOICE_A_LABEL = "はい";
export const CHOICE_B_LABEL = "いいえ";

/**
 * デモ質問に実ユーザーの回答がこの人数以上集まったら、
 * デモ医師の回答（とデモコメント）を削除して実データに置き換える。
 */
export const DEMO_PRUNE_THRESHOLD = 4;

/** 削除推奨がこの人数に達したら質問を削除する（管理者は1人で即削除） */
export const REMOVAL_THRESHOLD = 3;
