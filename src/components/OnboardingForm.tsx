"use client";

import { useActionState } from "react";
import { completeOnboarding, type FormState } from "@/app/actions";
import { ProfileFields } from "./ProfileFields";

const initial: FormState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(completeOnboarding, initial);

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <ProfileFields />

      <div className="space-y-3 border-t border-line pt-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="is_physician" className="mt-1 h-5 w-5" required />
          <span>私は医療に従事しており、本サービスを医療者として利用します</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree_terms" className="mt-1 h-5 w-5" required />
          <span>
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline"
            >
              利用規約
            </a>
            に同意します（診療への直接利用の禁止、患者を特定できる情報を投稿しないこと、
            免責およびサービス終了の可能性を含む）
          </span>
        </label>
        <p className="text-xs text-muted">
          資格の確認は行わず、自己申告としています。
        </p>
      </div>

      {state.error && (
        <p className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700">
          登録できませんでした
          <span className="mt-1 block font-normal">{state.error}</span>
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "登録中…" : "登録して質問を見る"}
      </button>
    </form>
  );
}
