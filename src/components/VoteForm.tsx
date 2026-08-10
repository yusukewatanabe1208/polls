"use client";

import { useActionState, useState } from "react";
import { submitVote, type FormState } from "@/app/actions";
import type { Choice } from "@/lib/types";

const initial: FormState = {};

export function VoteForm({
  questionId,
  optionA,
  optionB,
}: {
  questionId: string;
  optionA: string;
  optionB: string;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [state, formAction, pending] = useActionState(submitVote, initial);

  const options: { key: Choice; text: string }[] = [
    { key: "A", text: optionA },
    { key: "B", text: optionB },
  ];

  return (
    <form action={formAction} className="mt-5 space-y-3">
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

      {state.error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={!choice || pending}
      >
        {pending ? "送信中…" : choice ? `${choice}で回答する` : "AかBを選んでください"}
      </button>
      <p className="text-center text-xs text-muted">
        回答を確定すると変更できません。
      </p>
    </form>
  );
}
