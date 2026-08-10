"use client";

import { useState } from "react";
import { submitTrialAnswer } from "@/app/actions";
import type { Choice } from "@/lib/types";

/**
 * ログインなしのお試し用の回答フォーム。
 * ログイン後の VoteForm と見た目を揃えている（保存先だけが違う）。
 */
export function TrialVoteForm({
  questionId,
  optionA,
  optionB,
}: {
  questionId: string;
  optionA: string;
  optionB: string;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);

  const options: { key: Choice; text: string }[] = [
    { key: "A", text: optionA },
    { key: "B", text: optionB },
  ];

  return (
    <form action={submitTrialAnswer} className="mt-5 space-y-3">
      <input type="hidden" name="question_id" value={questionId} />
      <input type="hidden" name="choice" value={choice ?? ""} />

      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => setChoice(o.key)}
          aria-pressed={choice === o.key}
          className="choice"
        >
          <span className="choice-badge">{o.key}</span>
          <span>{o.text}</span>
        </button>
      ))}

      <button type="submit" className="btn btn-primary w-full" disabled={!choice}>
        {choice ? `${choice}で回答する` : "AかBを選んでください"}
      </button>
    </form>
  );
}
