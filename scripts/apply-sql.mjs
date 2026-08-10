/**
 * Supabase の SQL Editor に貼るのと同じことを、Management API 経由で行う。
 *
 *   node scripts/apply-sql.mjs status              … 適用状況を確認する（読み取りのみ）
 *   node scripts/apply-sql.mjs file <path.sql>     … SQLファイルを流す
 *   node scripts/apply-sql.mjs query "<SQL>"       … その場でSQLを流す
 *
 * 認証は .env の SUPABASE_ACCESS_TOKEN（Supabase個人アクセストークン）。
 * プロジェクトは NEXT_PUBLIC_SUPABASE_URL から読み取る。
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

if (!TOKEN || !REF) {
  console.error(
    ".env に SUPABASE_ACCESS_TOKEN と NEXT_PUBLIC_SUPABASE_URL が必要です。",
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
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 1000)}`);
  return text ? JSON.parse(text) : [];
}

/** いま入っているものを確認する。書き込みは一切しない */
const STATUS_QUERY = `
select
  (select count(*) from public.profiles)                              as profiles,
  (select count(*) from public.questions)                             as questions,
  (select count(*) from public.votes)                                 as votes,
  (select count(*) from public.comments)                              as comments,
  (select count(*) from public.profiles where is_admin)               as admins,
  to_regclass('public.ordinariness_snapshot') is not null              as has_0018,
  to_regprocedure('public.toggle_comment_like(uuid)') is not null           as has_0019,
  to_regprocedure('public.get_feed(integer)') is not null                   as has_0021,
  to_regprocedure('public.get_user_report(uuid)') is not null               as has_0022,
  to_regprocedure('public.get_question_with_author(uuid)') is not null      as has_0023,
  to_regprocedure('public.recency_weight(bigint)') is not null              as has_0025,
  to_regprocedure('public.get_authored_questions(uuid)') is not null        as has_0026,
  -- 権限昇格の穴が開いているか
  has_table_privilege('authenticated', 'public.public_profiles', 'UPDATE')
                                                                       as view_writable_by_user,
  has_table_privilege('anon', 'public.public_profiles', 'UPDATE')
                                                                       as view_writable_by_anon,
  (select count(*) from pg_trigger
    where tgname = 'profiles_lock_username' and not tgisinternal)      as lock_trigger,
  (select prosrc like '%権限に関わる項目%' from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prevent_username_change')
                                                                       as has_0020;
`;

const mode = process.argv[2] ?? "status";

if (mode === "status") {
  const rows = await sql(STATUS_QUERY);
  console.log(JSON.stringify(rows[0], null, 2));
} else if (mode === "file") {
  const file = process.argv[3];
  if (!file) {
    console.error("ファイルを指定してください");
    process.exit(1);
  }
  const body = fs.readFileSync(file, "utf8");
  console.log(`${file} を流します（${body.length} 文字）…`);
  const rows = await sql(body);
  console.log("完了:", JSON.stringify(rows).slice(0, 400));
} else if (mode === "query") {
  const rows = await sql(process.argv[3] ?? "select 1");
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.error("status / file / query のいずれかを指定してください");
  process.exit(1);
}
