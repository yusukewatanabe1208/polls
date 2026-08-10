/**
 * ダミーデータの削除（CLI）。
 *   node --experimental-strip-types scripts/purge-demo.ts status
 *   node --experimental-strip-types scripts/purge-demo.ts votes  … ダミー医師の投票・コメントのみ削除
 *   node --experimental-strip-types scripts/purge-demo.ts all    … ダミーデータをすべて削除
 *
 * npm 経由: npm run demo:status / npm run demo:purge-votes / npm run demo:purge-all
 * ※ dev サーバー起動中に実行した場合は、サーバーを再起動すると反映されます。
 */
import fs from "node:fs";
import path from "node:path";
import { countDemoData, purgeAllDemoData, purgeDemoVotes } from "../src/lib/demo.ts";
import type { Database } from "../src/lib/types.ts";

const DB_PATH = path.join(process.cwd(), ".data", "db.json");
const mode = process.argv[2] ?? "status";

if (!fs.existsSync(DB_PATH)) {
  console.error(
    `${DB_PATH} がありません。先に npm run dev でアプリを一度起動してください。`,
  );
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as Database;
const before = countDemoData(db);

if (mode === "status") {
  console.log("ダミーデータの内訳:");
  console.table(before);
  process.exit(0);
}

const result =
  mode === "votes"
    ? purgeDemoVotes(db)
    : mode === "all"
      ? purgeAllDemoData(db)
      : null;

if (!result) {
  console.error(`不明なモード: ${mode}（status / votes / all のいずれかを指定）`);
  process.exit(1);
}

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
console.log(`削除しました（モード: ${mode}）`);
console.table(result);
console.log("残っているデータ:");
console.table(countDemoData(db));
console.log("dev サーバー起動中の場合は再起動すると反映されます。");
