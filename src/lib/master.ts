import type { Category, Specialty } from "./types";

export const SPECIALTIES: Specialty[] = [
  "循環器内科",
  "消化器内科",
  "呼吸器内科",
  "腎臓内科",
  "内分泌・糖尿病内科",
  "血液内科",
  "神経内科",
  "総合内科",
  "救急科",
  "外科",
  "心臓血管外科",
  "呼吸器外科",
  "脳神経外科",
  "整形外科",
  "小児科",
  "産婦人科",
  "精神科",
  "麻酔科",
  "放射線科",
  "皮膚科",
  "泌尿器科",
  "耳鼻咽喉科",
  "眼科",
  "病理",
  "その他",
].map((name, i) => ({ id: i + 1, name, display_order: i + 1, active: true }));

export const CATEGORIES: Category[] = [
  "循環器",
  "消化器",
  "呼吸器",
  "腎臓",
  "内分泌",
  "神経",
  "感染症",
  "救急",
  "総合診療",
  "外科",
  "その他",
].map((name, i) => ({ id: i + 1, name, display_order: i + 1, active: true }));

/**
 * 「救急」カテゴリーのID。
 * 医師以外の既定の出題範囲に使う。並び順を変えてもここが追随するよう、
 * 数値を直接書かずに名前から引く（DB側の既定値は 0012_lock_identity.sql）。
 */
export const EMERGENCY_CATEGORY_ID =
  CATEGORIES.find((c) => c.name === "救急")?.id ?? 8;

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

export function specialtyName(id: number): string {
  return SPECIALTIES.find((s) => s.id === id)?.name ?? "未設定";
}

export function categoryName(id: number): string {
  return CATEGORIES.find((c) => c.id === id)?.name ?? "その他";
}

/** 質問が想定する対象レベル */
export const QUESTION_LEVELS = [
  {
    value: "resident",
    label: "研修医レベル",
    description: "初期研修中に判断する場面",
  },
  {
    value: "non_specialist",
    label: "非専門医レベル",
    description: "専門外でも遭遇し、判断が必要な場面",
  },
  {
    value: "specialist",
    label: "専門医レベル",
    description: "その領域の専門医が判断する場面",
  },
] as const;

export type QuestionLevel = (typeof QUESTION_LEVELS)[number]["value"];

export function levelLabel(value: string): string {
  return (
    QUESTION_LEVELS.find((l) => l.value === value)?.label ?? "非専門医レベル"
  );
}

export function isQuestionLevel(value: string): value is QuestionLevel {
  return QUESTION_LEVELS.some((l) => l.value === value);
}

/** 職業（コメディカルも利用できる）。公開情報 */
export const OCCUPATIONS = [
  "医師",
  "歯科医師",
  "看護師",
  "保健師",
  "助産師",
  "薬剤師",
  "理学療法士",
  "作業療法士",
  "言語聴覚士",
  "臨床工学技士（ME）",
  "診療放射線技師",
  "臨床検査技師",
  "管理栄養士",
  "救急救命士",
  "公認心理師・臨床心理士",
  "医療事務",
  "学生",
  "その他",
] as const;

export type Occupation = (typeof OCCUPATIONS)[number];

/** 指標（普通度・偏差値）の集計対象となる職業 */
export const METRIC_OCCUPATION = "医師";

export function isOccupation(value: string): value is Occupation {
  return (OCCUPATIONS as readonly string[]).includes(value);
}
