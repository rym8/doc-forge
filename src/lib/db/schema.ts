import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const llmProviders = ["gemini", "openai", "anthropic"] as const;
export type LlmProvider = (typeof llmProviders)[number];

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  documentContent: text("document_content").notNull().default(""),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  previousContent: text("previous_content").notNull(),
  summary: text("summary").notNull().default(""),
  relatedMessageId: text("related_message_id"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const llmCredentials = sqliteTable("llm_credentials", {
  provider: text("provider", { enum: llmProviders }).primaryKey(),
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});
