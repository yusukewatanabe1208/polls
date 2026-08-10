import type { Choice, QuestionStats, UserMetrics, Vote } from "./types";

/**
 * 指標計算ロジック（要件定義 §16-§29, §45-§48）。
 * Supabase移行時は PostgreSQL Function / RPC に同じロジックを実装する。
 * ここは純粋関数なので、そのままテストの基準としても使える。
 */

/** question_stats View 相当：本人除外なしの全体集計 */
export function computeQuestionStats(
  questionId: string,
  votes: Vote[],
): QuestionStats {
  const target = votes.filter((v) => v.question_id === questionId);
  const a = target.filter((v) => v.choice === "A").length;
  const b = target.length - a;
  const total = target.length;
  return {
    question_id: questionId,
    vote_count: total,
    a_count: a,
    b_count: b,
    a_ratio: total === 0 ? 0 : (a / total) * 100,
    b_ratio: total === 0 ? 0 : (b / total) * 100,
    majority_choice: a === b ? null : a > b ? "A" : "B",
  };
}

export type SelfExcludedResult = {
  otherCount: number;
  otherACount: number;
  otherBCount: number;
  /** 本人を除いた回答者のうち、本人と同じ選択をした割合(0-100)。回答が0なら null */
  agreementRate: number | null;
  /** 本人を除いた多数派。同数なら null */
  majorityChoice: Choice | null;
  /** 最低回答数を満たし、指標計算対象か */
  eligible: boolean;
};

/** 本人の回答を除外した集計（要件定義 §19, §23, §24, §28） */
export function computeSelfExcluded(
  questionId: string,
  userId: string,
  userChoice: Choice,
  votes: Vote[],
  minOtherVotes: number,
  /** 集計対象に含めるか（既定は全員）。医師のみに絞るときに使う */
  counts: (userId: string) => boolean = () => true,
): SelfExcludedResult {
  const others = votes.filter(
    (v) =>
      v.question_id === questionId &&
      v.user_id !== userId &&
      counts(v.user_id),
  );
  const a = others.filter((v) => v.choice === "A").length;
  const b = others.length - a;
  const n = others.length;
  const same = userChoice === "A" ? a : b;
  return {
    otherCount: n,
    otherACount: a,
    otherBCount: b,
    agreementRate: n === 0 ? null : (same / n) * 100,
    majorityChoice: a === b ? null : a > b ? "A" : "B",
    eligible: n >= minOtherVotes,
  };
}

/**
 * 直近の回答ほど重くする重み（半減期20問）。
 * rank は1が最新。20問さかのぼるごとに重みが半分になる。
 * 古い回答もゼロにはならず、いつまでも少しだけ効き続ける。
 */
export const RECENCY_HALF_LIFE = 20;

export function recencyWeight(rank: number): number {
  return Math.pow(0.5, (rank - 1) / RECENCY_HALF_LIFE);
}

/**
 * get_user_ordinariness(user_id) RPC 相当。
 * - 普通度: 対象質問における「本人以外で自分と同じ回答をした割合」の加重平均。
 *   回答の新しい順に recencyWeight() の重みを掛ける（要件：直近20問を重く）。
 * - 多数派一致率: 多数派が存在する対象質問のうち、多数派と一致した割合。
 *   「割合」を表す別の指標なので重み付けしない。
 */
export function computeUserMetrics(params: {
  userId: string;
  votes: Vote[];
  visibleQuestionIds: Set<string>;
  minOtherVotes: number;
  postedQuestionCount: number;
  /** 集計対象に含めるか（既定は全員） */
  counts?: (userId: string) => boolean;
}): UserMetrics {
  const { userId, votes, visibleQuestionIds, minOtherVotes } = params;
  const counts = params.counts ?? (() => true);
  const myVotes = votes.filter(
    (v) => v.user_id === userId && visibleQuestionIds.has(v.question_id),
  );

  const eligible: { rate: number; createdAt: string; questionId: string }[] = [];
  let majorityDenominator = 0;
  let majorityNumerator = 0;

  for (const mv of myVotes) {
    const r = computeSelfExcluded(
      mv.question_id,
      userId,
      mv.choice,
      votes,
      minOtherVotes,
      counts,
    );
    if (!r.eligible || r.agreementRate === null) continue;
    eligible.push({
      rate: r.agreementRate,
      createdAt: mv.created_at,
      questionId: mv.question_id,
    });
    // 50:50 は多数派が存在しないため分子・分母どちらにも含めない
    if (r.majorityChoice !== null) {
      majorityDenominator += 1;
      if (r.majorityChoice === mv.choice) majorityNumerator += 1;
    }
  }

  // 新しい順に並べて重みを掛ける（SQL側の row_number() と同じ並び）
  const ordered = [...eligible].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.questionId < b.questionId ? -1 : 1;
  });

  let weightedSum = 0;
  let weightTotal = 0;
  ordered.forEach((e, i) => {
    const w = recencyWeight(i + 1);
    weightedSum += e.rate * w;
    weightTotal += w;
  });

  return {
    ordinariness: weightTotal === 0 ? null : weightedSum / weightTotal,
    majority_agreement_rate:
      majorityDenominator === 0
        ? null
        : (majorityNumerator / majorityDenominator) * 100,
    eligible_question_count: eligible.length,
    answered_question_count: myVotes.length,
    posted_question_count: params.postedQuestionCount,
  };
}

/* ------------------------------------------------------------------ */
/* 成績表：偏差値と10段階ランク                                           */
/* ------------------------------------------------------------------ */

export type RankBand = {
  /** 10（最も普通）〜1（最も独創的）。数字が大きいほど普通 */
  level: number;
  minDeviation: number;
  label: string;
  description: string;
};

/**
 * 普通度の偏差値による10段階ランク。
 * 偏差値が高い＝他の医師と同じ判断をすることが多い（普通・レベル大）
 * 偏差値が低い＝少数派の判断を選ぶことが多い（独創的・レベル小）
 *
 * 判定は上から順に評価するため、minDeviation の降順で並べること。
 */
export const RANK_BANDS: RankBand[] = [
  {
    level: 10,
    minDeviation: 70,
    label: "中庸を極めしベストドクター",
    description: "普通の頂点。中庸の境地。",
  },
  {
    level: 9,
    minDeviation: 65,
    label: "人間ガイドライン",
    description: "驚くほどスタンダード。",
  },
  {
    level: 8,
    minDeviation: 60,
    label: "安心と信頼の正統派",
    description: "多数派とかなり同じ判断をする。",
  },
  {
    level: 7,
    minDeviation: 55,
    label: "薄味正統派ドクター",
    description: "基本は王道。クセはほんのり。",
  },
  {
    level: 6,
    minDeviation: 50,
    label: "いい塩梅ドクター",
    description: "王道と個性が半々くらい。",
  },
  {
    level: 5,
    minDeviation: 45,
    label: "ひと味違う臨床家",
    description: "個性的だが、やりすぎではない。",
  },
  {
    level: 4,
    minDeviation: 40,
    label: "濃口個性派ドクター",
    description: "判断にかなり自分の色が出る。",
  },
  {
    level: 3,
    minDeviation: 35,
    label: "我が道を征く臨床冒険家",
    description: "王道は知っている。だが冒険する。",
  },
  {
    level: 2,
    minDeviation: 30,
    label: "白衣の異端児",
    description: "多数派とは違う道を堂々と行く。",
  },
  {
    level: 1,
    minDeviation: -Infinity,
    label: "世紀末のマッドサイエンティスト",
    description: "常識という概念から最も遠い。",
  },
];

export function rankFromDeviation(deviation: number): RankBand {
  return RANK_BANDS.find((b) => deviation >= b.minDeviation) ?? RANK_BANDS[RANK_BANDS.length - 1];
}

export type Ranking = {
  ordinariness: number | null;
  /** 偏差値（全体の平均50・標準偏差10に正規化） */
  deviation: number | null;
  /** 上位何％か（0-100。小さいほど普通度が高い） */
  percentile: number | null;
  rankLevel: number | null;
  rankLabel: string | null;
  rankDescription: string | null;
  comparedUsers: number;
};

/**
 * 全ユーザーの普通度分布から偏差値・順位・ランクを求める。
 * 比較対象が2人未満、または標準偏差が0の場合は偏差値50として扱う。
 */
export function computeRanking(
  myOrdinariness: number | null,
  allOrdinariness: number[],
): Ranking {
  const empty: Ranking = {
    ordinariness: myOrdinariness,
    deviation: null,
    percentile: null,
    rankLevel: null,
    rankLabel: null,
    rankDescription: null,
    comparedUsers: allOrdinariness.length,
  };
  if (myOrdinariness === null || allOrdinariness.length === 0) return empty;

  const n = allOrdinariness.length;
  const mean = allOrdinariness.reduce((s, x) => s + x, 0) / n;
  const variance =
    allOrdinariness.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);

  const deviation = sd === 0 ? 50 : 50 + (10 * (myOrdinariness - mean)) / sd;
  const higher = allOrdinariness.filter((x) => x > myOrdinariness).length;
  const percentile = (higher / n) * 100;
  const band = rankFromDeviation(deviation);

  return {
    ordinariness: myOrdinariness,
    deviation,
    percentile,
    rankLevel: band.level,
    rankLabel: band.label,
    rankDescription: band.description,
    comparedUsers: n,
  };
}

/** 表示は0〜100、小数点以下は四捨五入（要件定義 §18） */
export function displayScore(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}
