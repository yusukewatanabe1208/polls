"use client";

import { useActionState, useState } from "react";
import { reportQuestion, type FormState } from "@/app/actions";
import { REPORT_REASONS } from "@/lib/types";

const initial: FormState = {};

export function ReportMenu({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(reportQuestion, initial);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="この質問のメニュー"
        className="rounded px-2 py-1 text-muted hover:bg-slate-100"
        onClick={() => setOpen((v) => !v)}
      >
        •••
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-xl border border-line bg-white p-4 shadow-lg">
          {state.success ? (
            <p className="text-sm text-brand">{state.success}</p>
          ) : (
            <form action={formAction} className="space-y-3">
              <p className="text-sm font-semibold">この質問を報告</p>
              <input type="hidden" name="question_id" value={questionId} />
              <select name="reason" className="field" defaultValue="" required>
                <option value="" disabled>
                  理由を選択
                </option>
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {state.error && (
                <p className="text-xs text-red-600">{state.error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary flex-1 !py-1.5 text-sm"
                  disabled={pending}
                >
                  {pending ? "送信中…" : "報告する"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !py-1.5 text-sm"
                  onClick={() => setOpen(false)}
                >
                  閉じる
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
