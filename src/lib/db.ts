import "server-only";
import fs from "node:fs";
import path from "node:path";
import { buildSeedDatabase } from "./seed";
import { DB_SCHEMA_VERSION, type Database } from "./types";

/**
 * ローカル開発用の永続層。
 * Supabaseのキーが用意できたら、このファイルの公開関数だけを
 * supabase-js の実装に差し替えればアプリ側は変更不要。
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "db.json");

// dev の HMR で毎回読み直さないようキャッシュする
const globalCache = globalThis as unknown as { __tasuuketuDb?: Database };

function loadFromDisk(): Database {
  if (fs.existsSync(DB_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as Database;
      // スキーマが古い場合のみ作り直す（ダミー判定フラグ等の追加に対応）
      if (parsed.schema_version === DB_SCHEMA_VERSION) return parsed;
    } catch {
      // 壊れていたら作り直す
    }
  }
  const seeded = buildSeedDatabase();
  persist(seeded);
  return seeded;
}

function persist(db: Database) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function getDb(): Database {
  if (!globalCache.__tasuuketuDb) {
    globalCache.__tasuuketuDb = loadFromDisk();
  }
  return globalCache.__tasuuketuDb;
}

/** 変更を伴う操作はこれで包む（読み書き＋保存） */
export function mutateDb<T>(fn: (db: Database) => T): T {
  const db = getDb();
  const result = fn(db);
  persist(db);
  return result;
}

export function resetDb() {
  const seeded = buildSeedDatabase();
  globalCache.__tasuuketuDb = seeded;
  persist(seeded);
}

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
