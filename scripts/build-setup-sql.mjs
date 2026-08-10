/**
 * supabase/migrations/*.sql を番号順につないで supabase/setup_all.sql を作る。
 *
 *   npm run sql:build          … 生成する
 *   npm run sql:check          … 生成結果と現物が一致するか確かめる（CI向け）
 *
 * setup_all.sql は /setup 画面から丸ごとコピーさせる正本。
 * 以前は手で貼り足していたため 0016〜0018 が抜け、
 * 新規セットアップだと動かない状態になっていた。生成に変えて再発を防ぐ。
 */
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const OUTPUT = path.join(process.cwd(), "supabase", "setup_all.sql");

const HEADER = `-- =====================================================================
-- 診療スタイル診断：Supabase セットアップ用SQL（全部入り）
--
-- ★このファイルは自動生成です。直接編集しないでください。
--   supabase/migrations/*.sql を直したあと \`npm run sql:build\` で作り直します。
--
-- 使い方: Supabase ダッシュボード → SQL Editor に丸ごと貼り付けて実行。
--         何度実行しても安全です（既存のデータは消えません）。
-- =====================================================================

`;

function build() {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const parts = [HEADER];
  for (const file of files) {
    const body = fs.readFileSync(path.join(MIGRATIONS, file), "utf-8").trim();
    parts.push(
      `\n-- =====================================================================\n` +
        `-- ${file}\n` +
        `-- =====================================================================\n` +
        `${body}\n`,
    );
  }
  return { sql: parts.join(""), files };
}

const { sql, files } = build();
const mode = process.argv[2] ?? "build";

if (mode === "check") {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf-8") : "";
  if (current !== sql) {
    console.error(
      "setup_all.sql が migrations と一致しません。npm run sql:build を実行してください。",
    );
    process.exit(1);
  }
  console.log(`setup_all.sql は最新です（${files.length}ファイル）`);
} else {
  fs.writeFileSync(OUTPUT, sql, "utf-8");
  console.log(`setup_all.sql を生成しました（${files.length}ファイル）`);
  for (const f of files) console.log(`  - ${f}`);
}
