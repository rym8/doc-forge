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

function ensureColumn(sqlite: Database.Database, table: string, columnSql: string) {
  const columnName = columnSql.trim().split(/\s+/)[0];
  const existingColumns = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;

  if (existingColumns.some((column) => column.name === columnName)) {
    return;
  }

  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql};`);
}

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
      artifact_type TEXT NOT NULL DEFAULT 'document',
      document_content TEXT NOT NULL DEFAULT '',
      source_markdown TEXT,
      slide_deck_json TEXT,
      theme_json TEXT,
      export_options_json TEXT,
      planner_version TEXT,
      renderer_version TEXT,
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
      artifact_type TEXT NOT NULL DEFAULT 'document',
      previous_content TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      payload_json TEXT,
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
    CREATE TABLE IF NOT EXISTS google_oauth_credentials (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      client_id TEXT,
      encrypted_client_secret TEXT,
      iv_client_secret TEXT,
      auth_tag_client_secret TEXT,
      encrypted_refresh_token TEXT,
      iv_refresh_token TEXT,
      auth_tag_refresh_token TEXT,
      updated_at INTEGER
    );
  `);

  ensureColumn(
    sqlite,
    "sessions",
    "artifact_type TEXT NOT NULL DEFAULT 'document'"
  );
  ensureColumn(sqlite, "sessions", "source_markdown TEXT");
  ensureColumn(sqlite, "sessions", "slide_deck_json TEXT");
  ensureColumn(sqlite, "sessions", "theme_json TEXT");
  ensureColumn(sqlite, "sessions", "export_options_json TEXT");
  ensureColumn(sqlite, "sessions", "planner_version TEXT");
  ensureColumn(sqlite, "sessions", "renderer_version TEXT");
  ensureColumn(
    sqlite,
    "snapshots",
    "artifact_type TEXT NOT NULL DEFAULT 'document'"
  );
  ensureColumn(sqlite, "snapshots", "payload_json TEXT");

  _db = drizzle(sqlite, { schema });
  return _db;
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const instance = initDb();
    return (instance as unknown as Record<string | symbol, unknown>)[prop];
  },
});
