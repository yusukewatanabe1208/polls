/**
 * 指定したユーザーを管理者にする。
 *   node scripts/make-admin.mjs <ユーザーネーム または メールアドレス>
 *
 * 例: node scripts/make-admin.mjs usukewatanabe@gmail.com
 */
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(process.cwd(), ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(
  /https:\/\/([a-z0-9]+)\./,
)?.[1];
const target = process.argv[2];

if (!TOKEN || !REF || !target) {
  console.error(
    "使い方: node scripts/make-admin.mjs <ユーザーネーム または メールアドレス>",
  );
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const key = target.replaceAll("'", "''");
const rows = await sql(`
update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id
  and (p.username = '${key}' or u.email = '${key}')
returning p.username, p.is_admin;`);

if (rows.length === 0) {
  console.error(
    `見つかりませんでした: ${target}\n先にアプリでプロフィール登録を済ませてください。`,
  );
  process.exit(1);
}
console.log(`管理者にしました: @${rows[0].username}`);
