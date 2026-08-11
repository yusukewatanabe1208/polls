"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitFeedback, type FormState } from "@/app/actions";
import { FEEDBACK_TEXT_MAX } from "@/lib/limits";

const initial: FormState = {};

export function FeedbackForm() {
  const [state, formAction, pending] = useActionState(submitFeedback, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="card space-y-3 p-5">
      <textarea
        name="body"
        className="field min-h-40 w-full"
        maxLength={FEEDBACK_TEXT_MAX}
        placeholder={`例：この診療科の質問をもっと増やしてほしい／この画面が使いにくい（${FEEDBACK_TEXT_MAX}文字まで）`}
        required
      />

      {state.error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={pending}
      >
        {pending ? "送信中…" : "送信する"}
      </button>
    </form>
  );
}
