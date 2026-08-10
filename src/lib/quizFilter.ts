import type { Profile, Question } from "./types";

/**
 * 出題の絞り込み。
 * 診療科・レベルの指定があれば絞り込み、シャッフル指定があれば順番を混ぜる。
 * 条件に合う未回答が無くなった場合は、絞り込みを外して出題を続ける。
 */
export function applyQuizPreferences<T extends { question: Question; answered: boolean }>(
  items: T[],
  profile: Pick<
    Profile,
    "filter_category_ids" | "filter_levels" | "shuffle_questions"
  >,
): T[] {
  const categories = profile.filter_category_ids ?? [];
  const levels = profile.filter_levels ?? [];
  const matches = (item: T) =>
    (categories.length === 0 ||
      categories.includes(item.question.category_id)) &&
    (levels.length === 0 || levels.includes(item.question.level));

  const filtered = items.filter(matches);
  // 条件に合う未回答が無ければ、絞り込みなしに戻す
  const base = filtered.some((i) => !i.answered) ? filtered : items;

  if (!profile.shuffle_questions) return base;

  // 未回答だけを混ぜ、回答済みは後ろのまま
  const unanswered = base.filter((i) => !i.answered);
  const answered = base.filter((i) => i.answered);
  for (let i = unanswered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unanswered[i], unanswered[j]] = [unanswered[j], unanswered[i]];
  }
  return [...unanswered, ...answered];
}
