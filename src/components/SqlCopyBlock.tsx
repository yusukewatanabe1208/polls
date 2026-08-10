"use client";

import { useState } from "react";

export function SqlCopyBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // クリップボードが使えない場合は選択してコピーしてもらう
      setCopied(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="btn btn-primary btn-sm">
          {copied ? "コピーしました ✓" : "SQLをコピー"}
        </button>
        <a
          href="https://supabase.com/dashboard/project/_/sql/new"
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm"
        >
          SQL Editorを開く ↗
        </a>
        <span className="text-xs text-muted">
          {sql.length.toLocaleString("ja-JP")}文字
        </span>
      </div>
      <textarea
        readOnly
        value={sql}
        onFocus={(e) => e.currentTarget.select()}
        className="field mt-3 h-48 font-mono text-[0.72rem] leading-5"
        aria-label="セットアップ用SQL"
      />
    </div>
  );
}
