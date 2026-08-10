"use client";

import { useState } from "react";

/**
 * 成績表の共有。X・Instagramとも結果画像（1080×1080）を作って共有する。
 *   1. 端末の共有シート（画像つき）→ アプリを選んで投稿
 *   2. 使えない場合は投稿画面を開き、画像を保存する
 *
 * 重要：画像の生成は「同期」で行うこと。
 * await を挟むとユーザー操作の文脈が切れ、navigator.share が拒否されたり
 * window.open がポップアップブロックされて画面が開かなくなる。
 */
export function ShareButtons({
  deviation,
  rankLabel,
  level,
  shareUrl,
}: {
  deviation: string;
  rankLabel: string;
  level: number;
  /** サーバー側で組み立てた公開URL */
  shareUrl: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"x" | "instagram" | null>(null);

  const text = `私の普通度の偏差値は ${deviation}（レベル${level}／10・${rankLabel}）でした。#診療スタイル診断`;

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;

  /** 結果画像（1080×1080）を作る（同期処理） */
  function buildImageFile(): File | null {
    const size = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 背景
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, "#ecfeff");
    bg.addColorStop(1, "#ffffff");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // 枠
    ctx.strokeStyle = "#0e7490";
    ctx.lineWidth = 14;
    ctx.strokeRect(40, 40, size - 80, size - 80);

    const font = `"Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif`;
    ctx.textAlign = "center";

    ctx.fillStyle = "#0e7490";
    ctx.font = `bold 54px ${font}`;
    ctx.fillText("診療スタイル診断", size / 2, 190);

    ctx.fillStyle = "#64748b";
    ctx.font = `40px ${font}`;
    ctx.fillText("私の普通度の偏差値", size / 2, 330);

    ctx.fillStyle = "#0f172a";
    ctx.font = `bold 300px ${font}`;
    ctx.fillText(deviation, size / 2, 620);

    // 称号は長いものがあるので、はみ出す場合は縮める
    ctx.fillStyle = "#0e7490";
    let titleSize = 72;
    ctx.font = `bold ${titleSize}px ${font}`;
    while (ctx.measureText(rankLabel).width > size - 140 && titleSize > 34) {
      titleSize -= 4;
      ctx.font = `bold ${titleSize}px ${font}`;
    }
    ctx.fillText(rankLabel, size / 2, 760);

    ctx.fillStyle = "#64748b";
    ctx.font = `40px ${font}`;
    ctx.fillText(`レベル ${level} / 10`, size / 2, 830);

    // レベルのゲージ
    const barW = 720;
    const barX = (size - barW) / 2;
    const cellW = barW / 10;
    for (let i = 1; i <= 10; i++) {
      ctx.fillStyle = i === level ? "#0e7490" : "#e2e8f0";
      const x = barX + (i - 1) * cellW + 4;
      // roundRect は古いブラウザに無いので、その場合は角丸なしで描く
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, 880, cellW - 8, 22, 11);
        ctx.fill();
      } else {
        ctx.fillRect(x, 880, cellW - 8, 22);
      }
    }
    ctx.fillStyle = "#94a3b8";
    ctx.font = `30px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText("独創的", barX, 950);
    ctx.textAlign = "right";
    ctx.fillText("普通", barX + barW, 950);

    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = `32px ${font}`;
    ctx.fillText(shareUrl.replace(/^https?:\/\//, ""), size / 2, 1010);

    // toBlob は非同期なので、同期で扱える toDataURL を使う
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], "futsuudo.png", { type: "image/png" });
  }

  /** 画像をダウンロードする */
  function downloadImage(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function share(target: "x" | "instagram") {
    setNotice(null);
    const targetUrl = target === "x" ? xHref : "https://www.instagram.com/";

    let file: File | null = null;
    try {
      file = buildImageFile();
    } catch {
      file = null;
    }

    // 1) 共有シート（画像つき）。await を挟まずその場で呼ぶ
    if (file && navigator.canShare?.({ files: [file] })) {
      setBusy(target);
      navigator
        .share({
          files: [file],
          text,
          ...(target === "x" ? { url: shareUrl } : {}),
        })
        .catch((e: Error) => {
          // キャンセルは想定内。それ以外は投稿画面を開く手段を案内する
          if (e?.name !== "AbortError") {
            setNotice("共有シートを開けませんでした。下のリンクから開いてください。");
          }
        })
        .finally(() => setBusy(null));
      return;
    }

    // 2) 先に投稿画面を開く（この時点ではまだユーザー操作の直後なのでブロックされない）
    const opened = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (file) downloadImage(file);

    if (opened) {
      setNotice(
        target === "x"
          ? "結果画像を保存しました。開いた投稿画面に画像を添付して投稿してください。"
          : "結果画像を保存しました。Instagramに画像を投稿してください。",
      );
    } else {
      setNotice("ポップアップがブロックされました。下のリンクから開いてください。");
    }
  }

  const tile =
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-line bg-white py-3 text-xs font-semibold active:bg-slate-100 disabled:opacity-60";

  return (
    <section className="card p-5">
      <h2 className="font-bold">結果を共有する</h2>
      <p className="mt-1 text-xs text-muted">
        偏差値と称号の画像を作って共有します。回答内容や本名は含まれません。
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => share("x")}
          disabled={busy !== null}
          className={tile}
          aria-label="Xで共有"
        >
          <span aria-hidden className="text-xl font-bold">
            𝕏
          </span>
          {busy === "x" ? "準備中…" : "X"}
        </button>

        <button
          type="button"
          onClick={() => share("instagram")}
          disabled={busy !== null}
          className={tile}
          aria-label="Instagramで共有"
        >
          <span aria-hidden className="text-xl">
            📷
          </span>
          {busy === "instagram" ? "準備中…" : "Instagram"}
        </button>
      </div>

      {notice && (
        <div className="mt-3 rounded-xl bg-brand-soft p-3 text-sm text-brand">
          <p>{notice}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              href={xHref}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Xを開く
            </a>
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Instagramを開く
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
