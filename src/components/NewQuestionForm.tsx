"use client";

import { useActionState, useRef, useState } from "react";
import { createQuestion, type FormState } from "@/app/actions";
import {
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  QUESTION_TEXT_MAX,
} from "@/lib/limits";
import { CATEGORIES, QUESTION_LEVELS } from "@/lib/master";
import { PillSelect } from "./PillSelect";

const initial: FormState = {};

function Counter({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <span
      className={`text-xs tabular-nums ${over ? "font-bold text-red-600" : "text-muted"}`}
    >
      {value} / {max}
    </span>
  );
}

export function NewQuestionForm() {
  const [state, formAction, pending] = useActionState(createQuestion, initial);
  const [text, setText] = useState("");
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImageError(null);
    if (!file) {
      setImageName(null);
      setPreview(null);
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError("画像は10MB以内にしてください。");
      e.target.value = "";
      setImageName(null);
      setPreview(null);
      return;
    }
    if (!IMAGE_MIME_TYPES.includes(file.type)) {
      setImageError("PNG / JPEG / WebP / GIF の画像を選んでください。");
      e.target.value = "";
      setImageName(null);
      setPreview(null);
      return;
    }
    setImageName(file.name);
    setPreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (fileRef.current) fileRef.current.value = "";
    setImageName(null);
    setPreview(null);
    setImageError(null);
  }

  return (
    <form action={formAction} className="card space-y-5 p-5">
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="question_text">
            質問
          </label>
          <Counter value={text.length} max={QUESTION_TEXT_MAX} />
        </div>
        <textarea
          id="question_text"
          name="question_text"
          className="field min-h-36"
          maxLength={QUESTION_TEXT_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"80歳、発作性心房細動。\nこの患者に抗凝固療法を開始する？"}
          required
        />
        <p className="mt-1 text-xs text-muted">
          医学的な正解は設定しません。判断が分かれる状況を簡潔に記述してください。
          回答は「はい」「いいえ」の2択なので、そのどちらかで答えられる質問文にしてください。
        </p>
      </div>

      <PillSelect
        name="category_id"
        label="カテゴリー"
        defaultValue="1"
        options={CATEGORIES.map((c) => ({ value: String(c.id), label: c.name }))}
      />

      <PillSelect
        name="level"
        label="対象レベル"
        defaultValue="specialist"
        options={QUESTION_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
      />

      <div>
        <label className="label" htmlFor="image">
          画像（任意・1枚まで・10MBまで）
        </label>
        <input
          ref={fileRef}
          id="image"
          name="image"
          type="file"
          accept={IMAGE_MIME_TYPES.join(",")}
          onChange={onPickImage}
          className="field py-3 text-sm"
        />
        {imageError && (
          <p className="mt-1 text-sm text-red-600">{imageError}</p>
        )}
        {preview && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="選択した画像のプレビュー"
              className="w-full rounded-xl border border-line object-contain"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted">{imageName}</span>
              <button
                type="button"
                onClick={clearImage}
                className="btn btn-ghost btn-sm"
              >
                画像を外す
              </button>
            </div>
          </div>
        )}
        <p className="mt-1 text-xs text-muted">
          患者が特定できる画像（顔写真、氏名やIDの写り込みなど）は投稿しないでください。
        </p>
      </div>

      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">患者情報に関する注意</p>
        <p className="mt-1">
          症例ベースの質問は投稿できますが、患者を特定できる情報は投稿しないでください。
        </p>
        <p className="mt-1 text-xs">
          禁止例：氏名 / 生年月日 / 患者ID / 電話番号 / 住所 / 顔写真 /
          医療機関名との組み合わせで個人が特定できる情報
        </p>
        <label className="mt-3 flex items-start gap-2">
          <input type="checkbox" name="no_phi" className="mt-1 h-5 w-5" />
          <span>患者を特定できる情報を含んでいないことを確認しました</span>
        </label>
      </div>

      <p className="text-xs text-muted">
        投票が始まると回答の意味が変わるため、投稿後の質問本文・選択肢は編集できません。
      </p>

      {state.error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "投稿中…" : "投稿する"}
      </button>
    </form>
  );
}
