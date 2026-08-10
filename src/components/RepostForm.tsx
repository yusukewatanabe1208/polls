"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createQuestion, type FormState } from "@/app/actions";
import {
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  QUESTION_TEXT_MAX,
} from "@/lib/limits";
import { CATEGORIES, QUESTION_LEVELS } from "@/lib/master";
import { PillSelect } from "./PillSelect";

const initial: FormState = {};
const TOGGLE_ID = "repost-toggle";

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span
      className={`text-xs tabular-nums ${
        value > max ? "font-bold text-red-600" : "text-muted"
      }`}
    >
      {value} / {max}
    </span>
  );
}

/**
 * 回答後の画面で「次の質問へ」と並べて「条件を追加して再投稿」を出す。
 * 開閉はチェックボックス＋CSSなので、JavaScriptが無くても編集欄を開ける。
 * （投稿済みの質問は編集できない決まりのため、複製して新しい質問として出す）
 */
export function RepostForm({
  nextHref,
  nextLabel,
  questionText,
  categoryId,
  level,
}: {
  nextHref: string;
  nextLabel: string;
  questionText: string;
  categoryId: number;
  level: string;
}) {
  const [state, formAction, pending] = useActionState(createQuestion, initial);
  const [text, setText] = useState(questionText);
  const [imageError, setImageError] = useState<string | null>(null);

  return (
    <div>
      {/* 開閉状態（以降の兄弟から peer-checked: で参照する） */}
      <input type="checkbox" id={TOGGLE_ID} className="peer sr-only" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={nextHref} prefetch className="btn btn-primary w-full">
          {nextLabel}
        </Link>
        <label
          htmlFor={TOGGLE_ID}
          className="btn btn-ghost w-full cursor-pointer"
        >
          条件を追加して再投稿
        </label>
      </div>

      <form
        action={formAction}
        className="card mt-3 hidden space-y-4 p-5 peer-checked:block"
      >
        <input type="hidden" name="after" value="next" />

        <div className="flex items-center justify-between">
          <h2 className="font-bold">条件を追加して再投稿</h2>
          <label htmlFor={TOGGLE_ID} className="btn btn-ghost btn-sm cursor-pointer">
            閉じる
          </label>
        </div>
        <p className="text-xs text-muted">
          この質問に条件を足して、新しい質問として投稿します。元の質問は変更されません。
        </p>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="repost_text">
              質問
            </label>
            <Counter value={text.length} max={QUESTION_TEXT_MAX} />
          </div>
          <textarea
            id="repost_text"
            name="question_text"
            className="field min-h-32"
            maxLength={QUESTION_TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-muted">
            例：年齢、腎機能、併存疾患、重症度などの条件を足すと、
            判断が分かれる場面を切り分けられます。
          </p>
        </div>

        <PillSelect
          name="category_id"
          label="カテゴリー"
          defaultValue={String(categoryId)}
          options={CATEGORIES.map((c) => ({ value: String(c.id), label: c.name }))}
        />

        <PillSelect
          name="level"
          label="対象レベル"
          defaultValue={level}
          options={QUESTION_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
        />

        <div>
          <label className="label" htmlFor="repost_image">
            画像（任意・1枚まで・10MBまで）
          </label>
          <input
            id="repost_image"
            name="image"
            type="file"
            accept={IMAGE_MIME_TYPES.join(",")}
            className="field py-3 text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setImageError(null);
              if (!file) return;
              if (file.size > IMAGE_MAX_BYTES) {
                setImageError("画像は10MB以内にしてください。");
                e.target.value = "";
              } else if (!IMAGE_MIME_TYPES.includes(file.type)) {
                setImageError("PNG / JPEG / WebP / GIF を選んでください。");
                e.target.value = "";
              }
            }}
          />
          {imageError && (
            <p className="mt-1 text-sm text-red-600">{imageError}</p>
          )}
        </div>

        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <input type="checkbox" name="no_phi" className="mt-1 h-5 w-5" required />
          <span>患者を特定できる情報を含んでいないことを確認しました</span>
        </label>

        {state.error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={pending}
        >
          {pending ? "投稿中…" : "この質問を投稿して次の問題へ進む"}
        </button>
      </form>
    </div>
  );
}
