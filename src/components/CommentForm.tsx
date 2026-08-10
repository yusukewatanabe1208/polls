"use client";

import { useActionState, useEffect, useRef } from "react";
import { addComment, type FormState } from "@/app/actions";

const initial: FormState = {};

export function CommentForm({
  questionId,
  parentId,
  placeholder = "判断の理由や、前提が変わる条件など（500文字まで）",
  autoFocus = false,
  onDone,
}: {
  questionId: string;
  /** 返信先のコメント。未指定なら質問への直接のコメント */
  parentId?: string;
  placeholder?: string;
  /** 返信を開いたときに入力欄へフォーカスする */
  autoFocus?: boolean;
  /** 送信できたときに呼ばれる（返信欄を閉じるのに使う） */
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(addComment, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    onDone?.();
  }, [state.success, onDone]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="question_id" value={questionId} />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <textarea
        name="body"
        autoFocus={autoFocus}
        className="field min-h-24 w-full"
        maxLength={500}
        placeholder={placeholder}
        required
      />
      <p className="text-xs text-muted">
        患者を特定できる情報は書き込まないでください。
      </p>
      {state.error && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{state.error}</p>
      )}
      <button
        type="submit"
        className="btn btn-primary !py-1.5 text-sm"
        disabled={pending}
      >
        {pending ? "送信中…" : parentId ? "返信する" : "コメントする"}
      </button>
    </form>
  );
}
