/**
 * 指標計算ロジックの自己チェック（要件定義 §19, §24, §28 の例をそのまま検証）
 * 実行: node --experimental-strip-types scripts/check-metrics.ts
 */
import {
  computeSelfExcluded,
  computeUserMetrics,
  recencyWeight,
} from "../src/lib/metrics.ts";
import type { Choice, Vote } from "../src/lib/types.ts";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`}`);
}

/** 本人の回答日時を指定できるようにする（普通度は直近ほど重いため） */
const makeVotes = (
  questionId: string,
  a: number,
  b: number,
  meChoice?: Choice,
  meVotedAt = "",
): Vote[] => {
  const votes: Vote[] = [];
  for (let i = 0; i < a; i++)
    votes.push({ id: `a${i}`, question_id: questionId, user_id: `other-a-${i}`, choice: "A", created_at: "" });
  for (let i = 0; i < b; i++)
    votes.push({ id: `b${i}`, question_id: questionId, user_id: `other-b-${i}`, choice: "B", created_at: "" });
  if (meChoice)
    votes.push({ id: "me", question_id: questionId, user_id: "me", choice: meChoice, created_at: meVotedAt });
  return votes;
};

// §19: 全体 A:6 B:4 で本人がA → 本人を除くと A:5 B:4 → 5/9 = 55.6%
{
  const votes = makeVotes("q1", 5, 4, "A"); // 本人のA票を含めて A:6 B:4
  const r = computeSelfExcluded("q1", "me", "A", votes, 1);
  check("§19 本人除外の一致率 5/9", Math.round(r.agreementRate! * 10) / 10, 55.6);
  check("§19 本人除外の多数派", r.majorityChoice, "A");
}

// §23: 本人以外 A:60% B:40%、本人A → 多数派一致
{
  const votes = makeVotes("q2", 12, 8, "A");
  const r = computeSelfExcluded("q2", "me", "A", votes, 20);
  check("§23 多数派一致", r.majorityChoice === "A", true);
  check("§28 本人以外20人で対象", r.eligible, true);
}

// §24: 本人以外が50:50 → 多数派なし
{
  const votes = makeVotes("q3", 10, 10, "A");
  const r = computeSelfExcluded("q3", "me", "A", votes, 20);
  check("§24 50:50は多数派なし", r.majorityChoice, null);
  check("§24 普通度には反映（一致率50%）", r.agreementRate, 50);
}

// §28: 本人以外19人 → 計算対象外
{
  const votes = makeVotes("q4", 10, 9, "A");
  const r = computeSelfExcluded("q4", "me", "A", votes, 20);
  check("§28 本人以外19人は対象外", r.eligible, false);
}

// 直近ほど重い重み（半減期20問）
{
  check("重み 最新は1.0", recencyWeight(1), 1);
  check("重み 20問前で約0.52", Math.round(recencyWeight(20) * 100) / 100, 0.52);
  check("重み 21問前で0.5", Math.round(recencyWeight(21) * 100) / 100, 0.5);
  check("重み 100問前でも0より大きい", recencyWeight(100) > 0, true);
}

// §16-§24 総合: 3問（うち1問は50:50、1問は票数不足）
// 普通度は直近ほど重い加重平均。Q2（新しい・50%）が Q1（古い・75%）より重い。
{
  const votes: Vote[] = [
    // Q1: 本人以外 A:18 B:6 → 本人A → 一致率75%、多数派一致
    ...makeVotes("Q1", 18, 6, "A", "2024-01-01T00:00:00Z"),
    // Q2: 本人以外 A:10 B:10 → 本人A → 一致率50%、多数派なし（多数派一致率の対象外）
    ...makeVotes("Q2", 10, 10, "A", "2024-02-01T00:00:00Z"),
    // Q3: 本人以外 A:5 B:5 → 票数不足で全指標の対象外
    ...makeVotes("Q3", 5, 5, "B", "2024-03-01T00:00:00Z"),
  ];
  const m = computeUserMetrics({
    userId: "me",
    votes,
    visibleQuestionIds: new Set(["Q1", "Q2", "Q3"]),
    minOtherVotes: 20,
    postedQuestionCount: 0,
  });
  // 新しい順に Q2(50%, 重み1) → Q1(75%, 重み 0.5^(1/20)=0.96594)
  const w2 = recencyWeight(1);
  const w1 = recencyWeight(2);
  const expected = (50 * w2 + 75 * w1) / (w2 + w1);
  check("総合 普通度は直近重視の加重平均", m.ordinariness, expected);
  check("総合 単純平均(62.5)より新しいQ2に寄る", m.ordinariness! < 62.5, true);
  check("総合 多数派一致率 = 1/1（重み付けしない）", m.majority_agreement_rate, 100);
  check("総合 対象質問数", m.eligible_question_count, 2);
  check("総合 回答数", m.answered_question_count, 3);
}

// 古い回答も影響がゼロにならない（要件）
{
  const many: Vote[] = [];
  // 100問すべて一致率100%、そのあと最新の1問だけ0%
  for (let i = 0; i < 100; i++) {
    many.push(...makeVotes(`old${i}`, 20, 0, "A", `2024-01-01T00:00:${String(i).padStart(2, "0")}Z`));
  }
  many.push(...makeVotes("newest", 0, 20, "A", "2025-01-01T00:00:00Z"));

  const m = computeUserMetrics({
    userId: "me",
    votes: many,
    visibleQuestionIds: new Set([...Array(100).keys()].map((i) => `old${i}`).concat("newest")),
    minOtherVotes: 20,
    postedQuestionCount: 0,
  });
  // 最新が0%でも、100問ぶんの過去が効いて0にはならない
  check("古い回答の影響はゼロにならない", m.ordinariness! > 0, true);
  // かつ最新が重いので100%からはっきり下がる。
  // 重みの合計は約28.5問ぶんなので、最新の0%が1問入ると 100% → 約96.5%
  check("直近の1問がはっきり効く", m.ordinariness! < 97, true);
  check("下がりすぎない（過去100問が支える）", m.ordinariness! > 95, true);
}

console.log(failures === 0 ? "\nすべて成功" : `\n${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
