/**
 * 指標計算ロジックの自己チェック（要件定義 §19, §24, §28 の例をそのまま検証）
 * 実行: node --experimental-strip-types scripts/check-metrics.ts
 */
import { computeSelfExcluded, computeUserMetrics } from "../src/lib/metrics.ts";
import type { Choice, Vote } from "../src/lib/types.ts";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`}`);
}

const makeVotes = (
  questionId: string,
  a: number,
  b: number,
  meChoice?: Choice,
): Vote[] => {
  const votes: Vote[] = [];
  for (let i = 0; i < a; i++)
    votes.push({ id: `a${i}`, question_id: questionId, user_id: `other-a-${i}`, choice: "A", created_at: "" });
  for (let i = 0; i < b; i++)
    votes.push({ id: `b${i}`, question_id: questionId, user_id: `other-b-${i}`, choice: "B", created_at: "" });
  if (meChoice)
    votes.push({ id: "me", question_id: questionId, user_id: "me", choice: meChoice, created_at: "" });
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

// §16-§24 総合: 3問（うち1問は50:50、1問は票数不足）
{
  const votes: Vote[] = [
    // Q1: 本人以外 A:18 B:6 → 本人A → 一致率75%、多数派一致
    ...makeVotes("Q1", 18, 6, "A"),
    // Q2: 本人以外 A:10 B:10 → 本人A → 一致率50%、多数派なし（多数派一致率の対象外）
    ...makeVotes("Q2", 10, 10, "A"),
    // Q3: 本人以外 A:5 B:5 → 票数不足で全指標の対象外
    ...makeVotes("Q3", 5, 5, "B"),
  ];
  const m = computeUserMetrics({
    userId: "me",
    votes,
    visibleQuestionIds: new Set(["Q1", "Q2", "Q3"]),
    minOtherVotes: 20,
    postedQuestionCount: 0,
  });
  check("総合 普通度 = (75+50)/2", m.ordinariness, 62.5);
  check("総合 多数派一致率 = 1/1", m.majority_agreement_rate, 100);
  check("総合 対象質問数", m.eligible_question_count, 2);
  check("総合 回答数", m.answered_question_count, 3);
}

console.log(failures === 0 ? "\nすべて成功" : `\n${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
