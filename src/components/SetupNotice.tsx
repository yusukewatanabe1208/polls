import Link from "next/link";

/** Supabaseのマイグレーション未実行を知らせる案内 */
export function SetupNotice() {
  return (
    <div className="card border-amber-300 bg-amber-50 p-5">
      <h2 className="font-bold text-amber-900">
        Supabaseのテーブルがまだ作成されていません
      </h2>
      <p className="mt-2 text-sm text-amber-900">
        Googleログインは成功していますが、データベースが空のため登録を完了できません。
        次の手順を実行してください。
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-amber-900">
        <li>
          Supabase ダッシュボード → SQL Editor を開く
        </li>
        <li>
          <code>supabase/setup_all.sql</code> を丸ごと貼り付けて実行
          （何度実行しても安全です）
        </li>
        <li>
          このページを再読み込み
        </li>
      </ol>
      <Link href="/setup" className="btn btn-ghost btn-sm mt-3">
        接続状態を確認する
      </Link>
    </div>
  );
}
