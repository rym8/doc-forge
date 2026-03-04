import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const configuredDbPath = process.env.DOC_FORGE_DB_PATH?.trim();
const DB_PATH = configuredDbPath
  ? path.isAbsolute(configuredDbPath)
    ? configuredDbPath
    : path.join(process.cwd(), configuredDbPath)
  : path.join(process.cwd(), "data", "doc-forge.db");

let _db: BetterSQLite3Database<typeof schema> | null = null;

function initDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      document_content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      previous_content TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      related_message_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS llm_credentials (
      provider TEXT PRIMARY KEY CHECK(provider IN ('gemini', 'openai', 'anthropic')),
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  _db = drizzle(sqlite, { schema });
  return _db;
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const instance = initDb();
    return (instance as unknown as Record<string | symbol, unknown>)[prop];
  },
});
