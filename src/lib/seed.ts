import demoData from "./demo-data.json" with { type: "json" };
import { CHOICE_A_LABEL, CHOICE_B_LABEL } from "./limits";
import { CATEGORIES, PREFECTURES, SPECIALTIES } from "./master";
import { DB_SCHEMA_VERSION, type Choice, type Database, type Question } from "./types";

/** 決定的な擬似乱数（シードを固定して毎回同じデモデータを作る） */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const BASE_TIME = Date.parse("2026-06-01T09:00:00.000Z");
const iso = (offsetMinutes: number) =>
  new Date(BASE_TIME + offsetMinutes * 60_000).toISOString();

type SeedComment = {
  /** コメントする医師の診療科（SPECIALTIES の名前と一致させる） */
  specialty: string;
  body: string;
};

type SeedQuestion = {
  text: string;
  category: string;
  /** 想定する対象レベル */
  level: "resident" | "non_specialist" | "specialist";
  /** A を選ぶ確率（デモ投票の分布を作るための偏り） */
  aBias: number;
  /** 本人以外に集まる票数（20未満の質問も混ぜる） */
  voters: number;
  /** その分野の専門医から付くコメント */
  comments: SeedComment[];
};

/**
 * 質問とコメントの定義は src/lib/demo-data.json（Supabase版と共通）を読む。
 * 全体の約8割が循環器で、残りは他分野の基本的な内容。
 */
const SEED_QUESTIONS = demoData.questions as SeedQuestion[];

const DEMO_USERS: {
  username: string;
  specialty: string;
  prefecture: string;
  admin?: boolean;
}[] = [
  { username: "cardio_taro_demo", specialty: "循環器内科", prefecture: "京都府" },
  { username: "er_hanako_demo", specialty: "救急科", prefecture: "東京都" },
  { username: "gi_kenji_demo", specialty: "消化器内科", prefecture: "大阪府" },
  { username: "admin_doc_demo", specialty: "総合内科", prefecture: "東京都", admin: true },
];

const BULK_USER_COUNT = 90;

export function buildSeedDatabase(): Database {
  const rand = lcg(20260601);

  const db: Database = {
    schema_version: DB_SCHEMA_VERSION,
    auth_users: [],
    profiles: [],
    specialties: SPECIALTIES,
    categories: CATEGORIES,
    questions: [],
    votes: [],
    comments: [],
    favorites: [],
    comment_likes: [],
    removal_requests: [],
    reports: [],
    settings: { min_other_votes: 20 },
  };

  const addUser = (
    idx: number,
    username: string,
    specialtyName: string,
    prefecture: string,
    admin: boolean,
  ) => {
    const id = `user-${String(idx).padStart(3, "0")}`;
    db.auth_users.push({
      id,
      email: `${username}@example.com`,
      display_name: username,
      provider: "google",
      created_at: iso(idx),
      is_demo: true,
    });
    db.profiles.push({
      id,
      username,
      real_name: `デモ ${username}`,
      license_number: String(100000 + idx * 7).slice(0, 6),
      occupation: "医師",
      is_demo: true,
      specialty_id:
        SPECIALTIES.find((s) => s.name === specialtyName)?.id ?? SPECIALTIES.length,
      work_prefecture: prefecture,
      is_physician: true,
      is_admin: admin,
      is_suspended: false,
      filter_category_ids: [],
      filter_levels: [],
      shuffle_questions: true,
      created_at: iso(idx),
      updated_at: iso(idx),
    });
    return id;
  };

  const namedIds = DEMO_USERS.map((u, i) =>
    addUser(i, u.username, u.specialty, u.prefecture, !!u.admin),
  );

  // 先頭の25人は全診療科を1人ずつ埋め、以降は循環器内科を多めにする。
  // （質問の約8割が循環器なので、専門科からコメントを付けられる人数を確保する）
  const bulkIds: string[] = [];
  for (let i = 0; i < BULK_USER_COUNT; i++) {
    const specialty =
      i < SPECIALTIES.length
        ? SPECIALTIES[i].name
        : i % 2 === 1
          ? "循環器内科"
          : SPECIALTIES[i % SPECIALTIES.length].name;
    const prefecture = PREFECTURES[Math.floor(rand() * PREFECTURES.length)];
    bulkIds.push(
      addUser(DEMO_USERS.length + i, `doctor_${String(i + 1).padStart(2, "0")}_demo`, specialty, prefecture, false),
    );
  }

  /** 診療科名 → その診療科の医師（コメントの投稿者を選ぶのに使う） */
  const doctorsBySpecialty = new Map<string, string[]>();
  db.profiles.forEach((prof) => {
    const name = SPECIALTIES.find((s) => s.id === prof.specialty_id)?.name;
    if (!name) return;
    const list = doctorsBySpecialty.get(name) ?? [];
    list.push(prof.id);
    doctorsBySpecialty.set(name, list);
  });
  /** デモ主人公（先頭のデモアカウント）を除外するための参照 */
  const namedIdsRef = namedIds;
  /** 同じ診療科でも投稿者が偏らないように順番に使う */
  const specialtyCursor = new Map<string, number>();
  const pickCommenter = (specialty: string, avoid: string[]) => {
    const list = doctorsBySpecialty.get(specialty) ?? bulkIds;
    const start = specialtyCursor.get(specialty) ?? 0;
    for (let k = 0; k < list.length; k++) {
      const id = list[(start + k) % list.length];
      if (!avoid.includes(id)) {
        specialtyCursor.set(specialty, (start + k + 1) % list.length);
        return id;
      }
    }
    // 同じ診療科の医師を使い切った場合でも、デモ主人公は選ばない
    return list.find((id) => id !== namedIdsRef[0]) ?? list[start % list.length];
  };

  // 質問
  SEED_QUESTIONS.forEach((sq, qi) => {
    const authorId =
      qi % 3 === 0 ? namedIds[1] : qi % 3 === 1 ? namedIds[2] : namedIds[0];
    const question: Question = {
      id: `q-${String(qi + 1).padStart(3, "0")}`,
      author_id: authorId,
      question_text: sq.text,
      option_a: CHOICE_A_LABEL,
      option_b: CHOICE_B_LABEL,
      category_id:
        CATEGORIES.find((c) => c.name === sq.category)?.id ?? CATEGORIES.length,
      level: sq.level,
      status: "active",
      image_url: null,
      created_at: iso(1000 - qi * 30),
      is_demo: true,
    };
    db.questions.push(question);

    const pool = [...bulkIds, ...namedIds.slice(1)];
    const voters = pool.slice(0, Math.min(sq.voters, pool.length));
    const votedBy = new Set<string>();
    const addVote = (uid: string, choice: Choice, at: number) => {
      if (votedBy.has(uid)) return;
      votedBy.add(uid);
      db.votes.push({
        id: `v-${question.id}-${uid}`,
        question_id: question.id,
        user_id: uid,
        choice,
        created_at: iso(at),
        is_demo: true,
      });
    };

    voters.forEach((uid, vi) => {
      addVote(uid, rand() < sq.aBias ? "A" : "B", 1100 - qi * 30 + vi);
    });

    // デモ主人公（cardio_taro_demo）は最初の10問に回答済みにしておく
    if (qi < 10) {
      addVote(namedIds[0], rand() < 0.62 ? "A" : "B", 1200 - qi * 30);
    }

    // デモコメント（回答済みユーザーにのみ表示される）
    // 投稿者はその質問の分野の専門医から選び、回答済みになるよう票も入れる。
    // デモ主人公（cardio_taro_demo）は「未回答」の状態を保ちたいのでコメント投稿者から外す
    const usedAuthors: string[] = [authorId, namedIds[0]];
    sq.comments.forEach((c, ci) => {
      const userId = pickCommenter(c.specialty, usedAuthors);
      usedAuthors.push(userId);
      addVote(userId, rand() < sq.aBias ? "A" : "B", 1250 - qi * 30 + ci);
      const commentId = `c-${question.id}-${ci}`;
      db.comments.push({
        id: commentId,
        question_id: question.id,
        parent_id: null,
        user_id: userId,
        body: c.body,
        status: "visible",
        created_at: iso(1300 - qi * 30 + ci),
        is_demo: true,
      });

      // コメントへのいいね。押せるのはその質問に回答済みの人（本人以外）。
      // 多くは0〜5件、ときどき伸びるコメントがある形にしている。
      const likers = [...votedBy].filter((uid) => uid !== userId);
      const r = rand();
      const likeCount = Math.min(
        likers.length,
        r < 0.15 ? 0 : r < 0.75 ? 1 + Math.floor(rand() * 5) : 6 + Math.floor(rand() * 12),
      );
      // 開始位置をずらして、同じ人ばかりが押さないようにする
      const offset = Math.floor(rand() * Math.max(1, likers.length));
      for (let li = 0; li < likeCount; li++) {
        const likerId = likers[(offset + li) % likers.length];
        db.comment_likes.push({
          id: `cl-${commentId}-${likerId}`,
          comment_id: commentId,
          user_id: likerId,
          created_at: iso(1350 - qi * 30 + ci * 3 + li),
        });
      }
    });
  });

  return db;
}

/** ログイン画面に出すデモアカウント */
export const DEMO_LOGIN_ACCOUNTS = DEMO_USERS.map((u, i) => ({
  id: `user-${String(i).padStart(3, "0")}`,
  username: u.username,
  specialty: u.specialty,
  admin: !!u.admin,
}));
