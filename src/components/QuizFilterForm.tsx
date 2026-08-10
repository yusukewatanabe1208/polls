"use client";

import { useState } from "react";
import { updateQuizFilter } from "@/app/actions";
import { CATEGORIES, QUESTION_LEVELS } from "@/lib/master";

/**
 * 出題の絞り込み設定。
 * 診療科は複数選択できる。「すべて」を押すと全診療科を選んだ状態になる。
 * レベルも同様に複数選択できる。
 */
export function QuizFilterForm({
  categoryIds,
  levels,
  shuffle,
  saved,
  shuffled,
}: {
  categoryIds: number[];
  levels: string[];
  shuffle: boolean;
  saved?: boolean;
  shuffled?: boolean;
}) {
  const allIds = CATEGORIES.map((c) => c.id);
  const allLevels = QUESTION_LEVELS.map((l) => l.value as string);

  // 空配列＝すべて。画面上はすべて選択された状態で表示する
  const [selected, setSelected] = useState<number[]>(
    categoryIds.length === 0 ? allIds : categoryIds,
  );
  const [selectedLevels, setSelectedLevels] = useState<string[]>(
    levels.length === 0 ? allLevels : levels,
  );
  const allSelected = selected.length === allIds.length;
  const allLevelsSelected = selectedLevels.length === allLevels.length;

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleLevel = (v: string) =>
    setSelectedLevels((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );

  return (
    <div className="card space-y-4 p-6">
      <div>
        <h2 className="font-bold">出題の設定</h2>
        <p className="mt-1 text-xs text-muted">
          「診療スタイル診断」で出題される質問を絞り込めます。
          条件に合う未回答が無くなった場合は、自動的にすべての質問から出題します。
        </p>
      </div>

      {saved && (
        <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand">
          出題の設定を保存しました。
        </p>
      )}
      {shuffled && (
        <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand">
          絞り込みを外し、すべての質問からシャッフルして出題します。
        </p>
      )}

      <form action={updateQuizFilter} className="space-y-4">
        <fieldset>
          <legend className="label">診療科（複数選べます）</legend>
          <div className="pill-group">
            <button
              type="button"
              onClick={() => setSelected(allSelected ? [] : allIds)}
              aria-pressed={allSelected}
              className={`pill-btn ${allSelected ? "is-on" : ""}`}
            >
              すべて
            </button>
            {CATEGORIES.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={on}
                  className={`pill-btn ${on ? "is-on" : ""}`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          {selected.map((id) => (
            <input
              key={id}
              type="hidden"
              name="filter_category_ids"
              value={id}
            />
          ))}
          <p className="mt-1.5 text-xs text-muted">
            {allSelected
              ? "すべての診療科から出題します。"
              : selected.length === 0
                ? "1つ以上選ぶか「すべて」を押してください。"
                : `${selected.length}科から出題します。`}
          </p>
        </fieldset>

        <fieldset>
          <legend className="label">レベル（複数選べます）</legend>
          <div className="pill-group">
            <button
              type="button"
              onClick={() =>
                setSelectedLevels(allLevelsSelected ? [] : allLevels)
              }
              aria-pressed={allLevelsSelected}
              className={`pill-btn ${allLevelsSelected ? "is-on" : ""}`}
            >
              すべて
            </button>
            {QUESTION_LEVELS.map((l) => {
              const on = selectedLevels.includes(l.value);
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => toggleLevel(l.value)}
                  aria-pressed={on}
                  className={`pill-btn ${on ? "is-on" : ""}`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
          {selectedLevels.map((v) => (
            <input key={v} type="hidden" name="filter_levels" value={v} />
          ))}
        </fieldset>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="shuffle_questions"
            className="mt-1 h-5 w-5"
            defaultChecked={shuffle}
          />
          <span>出題順をシャッフルする（外すと新しい質問から順に出題）</span>
        </label>

        <button type="submit" className="btn btn-primary w-full">
          この条件で出題する
        </button>
      </form>

      <form action={updateQuizFilter} className="border-t border-line pt-4">
        <input type="hidden" name="shuffle_all" value="1" />
        <button type="submit" className="btn btn-ghost w-full">
          すべてをシャッフル（絞り込みを外す）
        </button>
      </form>
    </div>
  );
}
