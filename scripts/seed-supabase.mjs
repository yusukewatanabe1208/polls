/**
 * Supabaseにデモデータを投入する。
 *   node scripts/seed-supabase.mjs
 *
 * .env の SUPABASE_ACCESS_TOKEN（Supabase個人アクセストークン）を使い、
 * Management API 経由でSQLを実行する。
 *
 * 投入するレコードはすべて is_demo = true が付くため、
 * 管理画面またはsupabase/purge_demo.sqlで後からまとめて削除できる。
 * 何度実行しても重複しない（同じUUIDを使い ON CONFLICT DO NOTHING）。
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
    ".env に SUPABASE_ACCESS_TOKEN と NEXT_PUBLIC_SUPABASE_URL を設定してください。",
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
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/* ------------------------------------------------------------------ */
/* デモデータの定義（ローカル版 src/lib/seed.ts と共通のJSONを読む）        */
/* ------------------------------------------------------------------ */

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const demo = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src", "lib", "demo-data.json"), "utf8"),
);

/** src/lib/master.ts と同じ並び（idは1始まり） */
const SPECIALTIES = [
  "循環器内科", "消化器内科", "呼吸器内科", "腎臓内科", "内分泌・糖尿病内科",
  "血液内科", "神経内科", "総合内科", "救急科", "外科",
  "心臓血管外科", "呼吸器外科", "脳神経外科", "整形外科", "小児科",
  "産婦人科", "精神科", "麻酔科", "放射線科", "皮膚科",
  "泌尿器科", "耳鼻咽喉科", "眼科", "病理", "その他",
];
const CATEGORIES = [
  "循環器", "消化器", "呼吸器", "腎臓", "内分泌",
  "神経", "感染症", "救急", "総合診療", "外科", "その他",
];
const specialtyId = (name) => SPECIALTIES.indexOf(name) + 1 || SPECIALTIES.length;
const categoryId = (name) => CATEGORIES.indexOf(name) + 1 || CATEGORIES.length;

const NAMED = [
  ["cardio_taro_demo", 1, "京都府"],
  ["er_hanako_demo", 9, "東京都"],
  ["gi_kenji_demo", 2, "大阪府"],
];
const BULK = 90;

/** 決まったUUIDを作る（再実行しても同じIDになる） */
const uuid = (kind, n) =>
  `${kind}${String(n).padStart(6, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = (n) => uuid("d0", n);
const questionId = (n) => uuid("d1", n);

const esc = (s) => s.replaceAll("'", "''");
const rand = lcg(20260601);

/* ------------------------------------------------------------------ */

const users = [];
for (let i = 0; i < NAMED.length; i++)
  users.push({ id: userId(i), username: NAMED[i][0], specialty: NAMED[i][1], pref: NAMED[i][2] });
// 先頭25人は全診療科を1人ずつ埋め、以降は循環器内科を多めにする。
// （質問の約8割が循環器なので、専門科からコメントを付けられる人数を確保する）
for (let i = 0; i < BULK; i++) {
  const n = NAMED.length + i;
  users.push({
    id: userId(n),
    username: `doctor_${String(i + 1).padStart(2, "0")}_demo`,
    specialty:
      i < SPECIALTIES.length ? i + 1 : i % 2 === 1 ? 1 : (i % SPECIALTIES.length) + 1,
    pref: "東京都",
  });
}

/** 診療科ID → その診療科の医師。コメントの投稿者を選ぶのに使う */
const doctorsBySpecialty = new Map();
for (const u of users) {
  const list = doctorsBySpecialty.get(u.specialty) ?? [];
  list.push(u.id);
  doctorsBySpecialty.set(u.specialty, list);
}
const cursor = new Map();
const pickCommenter = (specialtyName, avoid) => {
  const sid = specialtyId(specialtyName);
  const list = doctorsBySpecialty.get(sid) ?? users.map((u) => u.id);
  const start = cursor.get(sid) ?? 0;
  for (let k = 0; k < list.length; k++) {
    const id = list[(start + k) % list.length];
    if (!avoid.includes(id)) {
      cursor.set(sid, (start + k + 1) % list.length);
      return id;
    }
  }
  // 同じ診療科の医師を使い切った場合でも、デモ主人公は選ばない
  return list.find((id) => id !== users[0].id) ?? list[start % list.length];
};

const questions = demo.questions.map((q, i) => ({
  id: questionId(i + 1),
  text: q.text,
  category: categoryId(q.category),
  level: q.level,
  bias: q.aBias,
  voters: q.voters,
  comments: q.comments,
  author: users[[1, 2, 0][i % 3]].id,
}));

const votes = [];
const comments = [];
const likes = [];
for (const [qi, q] of questions.entries()) {
  const voted = new Set();
  const addVote = (uid, choice) => {
    if (voted.has(uid)) return;
    voted.add(uid);
    votes.push({ q: q.id, u: uid, choice });
  };

  const pool = users.slice(3).concat(users.slice(1, 3));
  for (const u of pool.slice(0, Math.min(q.voters, pool.length))) {
    addVote(u.id, rand() < q.bias ? "A" : "B");
  }
  // cardio_taro_demo は最初の10問に回答済みにする
  if (qi < 10) addVote(users[0].id, rand() < 0.62 ? "A" : "B");

  // コメントはその分野の専門医から。回答済みの人だけが読み書きできるので票も入れる。
  // デモ主人公（cardio_taro_demo）は「未回答」の状態を保ちたいのでコメント投稿者から外す
  const usedAuthors = [q.author, users[0].id];
  q.comments.forEach((c, ci) => {
    const uid = pickCommenter(c.specialty, usedAuthors);
    usedAuthors.push(uid);
    addVote(uid, rand() < q.bias ? "A" : "B");
    const commentId = uuid("d2", (qi + 1) * 100 + ci);
    comments.push({
      id: commentId,
      q: q.id,
      u: uid,
      body: c.body,
    });

    // コメントへのいいね。押せるのはその質問に回答済みの人（本人以外）。
    // 多くは0〜5件、ときどき伸びるコメントがある形にしている。
    const likers = [...voted].filter((id) => id !== uid);
    const r = rand();
    const likeCount = Math.min(
      likers.length,
      r < 0.15 ? 0 : r < 0.75 ? 1 + Math.floor(rand() * 5) : 6 + Math.floor(rand() * 12),
    );
    const offset = Math.floor(rand() * Math.max(1, likers.length));
    for (let li = 0; li < likeCount; li++) {
      likes.push({ c: commentId, u: likers[(offset + li) % likers.length] });
    }
  });
}

/* ------------------------------------------------------------------ */

const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );

console.log(
  `投入するデータ: 医師${users.length}人 / 質問${questions.length}問 / 投票${votes.length}件 / コメント${comments.length}件 / いいね${likes.length}件`,
);

// 1) 認証ユーザー（profiles が auth.users を参照するため先に作る）
for (const part of chunk(users, 30)) {
  await sql(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) values
${part
  .map(
    (u) => `('00000000-0000-0000-0000-000000000000','${u.id}','authenticated','authenticated',
  '${u.username}@demo.invalid','', now(), now(), now(),
  '{"provider":"demo","providers":["demo"]}', '{"demo":true}', false)`,
  )
  .join(",\n")}
on conflict (id) do nothing;`);
}
console.log("✓ 認証ユーザー");

// 2) プロフィール
for (const part of chunk(users, 30)) {
  await sql(`
insert into public.profiles (id, username, specialty_id, work_prefecture, is_physician, is_demo, real_name, license_number)
values
${part
  .map(
    (u) =>
      `('${u.id}','${u.username}',${u.specialty},'${u.pref}',true,true,'デモ ${u.username}','${100000 + Number(u.id.slice(2, 8))}')`,
  )
  .join(",\n")}
on conflict (id) do update set
  username = excluded.username,
  specialty_id = excluded.specialty_id,
  work_prefecture = excluded.work_prefecture
where public.profiles.is_demo;`);
}
console.log("✓ プロフィール");

// 3) 質問
for (const part of chunk(questions, 30)) {
  await sql(`
insert into public.questions (id, author_id, question_text, option_a, option_b, category_id, level, status, is_demo)
values
${part
  .map(
    (q) =>
      `('${q.id}','${q.author}','${esc(q.text)}','はい','いいえ',${q.category},'${q.level}','active',true)`,
  )
  .join(",\n")}
on conflict (id) do update set
  question_text = excluded.question_text,
  category_id = excluded.category_id,
  level = excluded.level
where public.questions.is_demo;`);
}
console.log("✓ 質問");

// 4) 投票
for (const part of chunk(votes, 150)) {
  await sql(`
insert into public.votes (question_id, user_id, choice, is_demo)
values
${part.map((v) => `('${v.q}','${v.u}','${v.choice}',true)`).join(",\n")}
on conflict (question_id, user_id) do nothing;`);
}
console.log("✓ 投票");

// 5) コメント（IDは質問番号から決まるので、消さずに上書きする。
//    消すと comment_likes がカスケードで消え、実ユーザーのいいねまで失われる）
for (const part of chunk(comments, 60)) {
  await sql(`
insert into public.comments (id, question_id, user_id, body, status, is_demo)
values
${part
  .map((c) => `('${c.id}','${c.q}','${c.u}','${esc(c.body)}','visible',true)`)
  .join(",\n")}
on conflict (id) do update set
  question_id = excluded.question_id,
  user_id = excluded.user_id,
  body = excluded.body,
  status = excluded.status
where public.comments.is_demo;`);
}
// 定義から外れた古いデモコメントだけを削除する
await sql(`
delete from public.comments
where is_demo and id not in (${comments.map((c) => `'${c.id}'`).join(",")});`);
console.log("✓ コメント");

// 6) コメントへのいいね（コメントを入れ替えたので、いいねも作り直す）
for (const part of chunk(likes, 200)) {
  await sql(`
insert into public.comment_likes (comment_id, user_id)
values
${part.map((l) => `('${l.c}','${l.u}')`).join(",\n")}
on conflict (comment_id, user_id) do nothing;`);
}
console.log("✓ いいね");

const counts = await sql(`
select
  (select count(*) from public.profiles where is_demo) demo_profiles,
  (select count(*) from public.questions where is_demo) demo_questions,
  (select count(*) from public.votes where is_demo) demo_votes,
  (select count(*) from public.comments where is_demo) demo_comments,
  (select count(*) from public.comment_likes) comment_likes;`);
console.log("\n投入結果:", JSON.stringify(counts[0]));
