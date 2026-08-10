import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { SqlCopyBlock } from "@/components/SqlCopyBlock";
import {
  SUPABASE_KEY,
  SUPABASE_URL,
  getBackend,
  isSupabaseConfigured,
} from "@/lib/config";

export const dynamic = "force-dynamic";

type Check = {
  label: string;
  ok: boolean | null; // null = 未確認
  detail: string;
};

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const backend = getBackend();

  checks.push({
    label: "データバックエンド",
    ok: true,
    detail:
      backend === "supabase"
        ? "supabase（Supabase Auth + PostgreSQL）"
        : "local（.data/db.json + モック認証）",
  });

  checks.push({
    label: "環境変数",
    ok: isSupabaseConfigured(),
    detail: isSupabaseConfigured()
      ? `URL: ${SUPABASE_URL} / キー: ${SUPABASE_KEY.slice(0, 18)}…`
      : "NEXT_PUBLIC_SUPABASE_URL（ベースURL）と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を .env に設定してください。",
  });

  if (!isSupabaseConfigured()) return checks;

  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

  // 認証プロバイダ
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers,
      cache: "no-store",
    });
    const json = (await res.json()) as {
      external?: Record<string, boolean>;
      disable_signup?: boolean;
    };
    const google = json.external?.google === true;
    checks.push({
      label: "Google認証の有効化",
      ok: google,
      detail: google
        ? "Supabase側でGoogleプロバイダが有効です。"
        : "Supabase ダッシュボード → Authentication → Providers で Google を有効にしてください。",
    });
    checks.push({
      label: "新規サインアップ",
      ok: json.disable_signup === false,
      detail:
        json.disable_signup === false
          ? "新規ユーザーの登録が許可されています。"
          : "サインアップが無効です。Authentication → Settings で許可してください。",
    });
  } catch (e) {
    checks.push({
      label: "Supabaseへの接続",
      ok: false,
      detail: `接続できませんでした: ${(e as Error).message}`,
    });
    return checks;
  }

  // テーブル
  const tables = [
    "specialties",
    "categories",
    "app_settings",
    "profiles",
    "questions",
    "votes",
    "comments",
    "reports",
    "favorites",
  ];
  const missing: string[] = [];
  for (const table of tables) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`,
      { headers, cache: "no-store" },
    );
    // 401/403 はRLSで弾かれただけなのでテーブルは存在する
    if (res.status === 404) missing.push(table);
    else if (res.status >= 500) missing.push(`${table}(${res.status})`);
  }
  checks.push({
    label: "テーブル",
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `${tables.length}件すべて存在します。`
        : `未作成: ${missing.join(", ")} … supabase/migrations/ のSQLをSQL Editorで実行してください。`,
  });

  // RPC
  // PostgRESTは引数が合わないと404を返すため、必ず正しい引数で呼ぶ
  const zeroUuid = "00000000-0000-0000-0000-000000000000";
  const rpcs: { name: string; args: Record<string, unknown> }[] = [
    { name: "get_question_result", args: { p_question_id: zeroUuid } },
    { name: "get_user_ordinariness", args: { p_user_id: zeroUuid } },
    { name: "get_question_comments", args: { p_question_id: zeroUuid } },
    { name: "get_ordinariness_ranking", args: { p_user_id: zeroUuid } },
    { name: "get_recent_answers", args: { p_user_id: zeroUuid, p_limit: 1 } },
  ];
  const missingRpc: string[] = [];
  for (const fn of rpcs) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn.name}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(fn.args),
      cache: "no-store",
    });
    if (res.status === 404) missingRpc.push(fn.name);
  }
  // 画像用のStorageバケット
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/public/question-images/.probe`,
      { headers, cache: "no-store" },
    );
    const body = (await res.json()) as { code?: string };
    // NoSuchKey = バケットはあるがファイルが無い（正常）
    // NoSuchBucket = バケット未作成
    const bucketExists = body.code !== "NoSuchBucket";
    checks.push({
      label: "画像用ストレージ（question-images）",
      ok: bucketExists,
      detail: bucketExists
        ? "バケットが存在します。質問に画像を添付できます。"
        : "未作成です。Storage → New bucket で「question-images」をPublicで作成するか、setup_all.sql の最後のストレージ部分を実行してください。画像添付以外の機能には影響しません。",
    });
  } catch {
    checks.push({
      label: "画像用ストレージ（question-images）",
      ok: null,
      detail: "確認できませんでした。",
    });
  }

  checks.push({
    label: "関数（RPC）",
    ok: missingRpc.length === 0,
    detail:
      missingRpc.length === 0
        ? `${rpcs.length}件すべて存在します。`
        : `未作成: ${missingRpc.join(", ")}`,
  });

  return checks;
}

function readSetupSql(): string | null {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "supabase", "setup_all.sql"),
      "utf-8",
    );
  } catch {
    return null;
  }
}

export default async function SetupPage() {
  const checks = await runChecks();
  const allOk = checks.every((c) => c.ok !== false);
  const setupSql = allOk ? null : readSetupSql();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">接続状態</h1>

      <div
        className={`card p-4 text-sm ${allOk ? "" : "border-amber-300 bg-amber-50"}`}
      >
        {allOk
          ? "すべての項目が正常です。"
          : "未完了の項目があります。下の詳細を確認してください。"}
      </div>

      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="card p-4">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${
                  c.ok === false ? "bg-red-500" : "bg-emerald-600"
                }`}
              >
                {c.ok === false ? "!" : "✓"}
              </span>
              <span className="font-semibold">{c.label}</span>
            </div>
            <p className="mt-1 break-all pl-7 text-sm text-muted">{c.detail}</p>
          </li>
        ))}
      </ul>

      {!allOk && setupSql && (
        <div className="card p-5">
          <h2 className="font-semibold">セットアップ用SQL</h2>
          <p className="mt-1 text-sm text-muted">
            下のボタンでコピーし、Supabaseの SQL Editor に貼り付けて実行してください。
            何度実行しても安全です。実行後このページを再読み込みすると結果が反映されます。
          </p>
          <div className="mt-3">
            <SqlCopyBlock sql={setupSql} />
          </div>
          <p className="mt-3 text-xs text-muted">
            エラーが出た場合は、そのメッセージがそのまま原因です。
            ファイルは <code>supabase/setup_all.sql</code> にもあります。
          </p>
        </div>
      )}

      <div className="card p-5 text-sm">
        <h2 className="font-semibold">セットアップ手順</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>
            Supabase ダッシュボード → SQL Editor で{" "}
            <code>supabase/setup_all.sql</code> を実行（上のボタンからコピーできます）
          </li>
          <li>
            Authentication → URL Configuration の Redirect URLs に{" "}
            <code>http://localhost:9001/auth/callback</code> を追加
          </li>
          <li>ログイン後、SQLで自分を管理者にする（supabase/purge_demo.sql の末尾を参照）</li>
        </ol>
      </div>

      <Link href="/" className="btn btn-ghost">
        トップへ
      </Link>
    </div>
  );
}
