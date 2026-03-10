import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const llmProviders = ["gemini", "openai", "anthropic"] as const;
export type LlmProvider = (typeof llmProviders)[number];
export const artifactTypes = ["document", "slides"] as const;
export type ArtifactType = (typeof artifactTypes)[number];

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artifactType: text("artifact_type", { enum: artifactTypes })
    .notNull()
    .default("document"),
  documentContent: text("document_content").notNull().default(""),
  sourceMarkdown: text("source_markdown"),
  slideDeckJson: text("slide_deck_json"),
  themeJson: text("theme_json"),
  exportOptionsJson: text("export_options_json"),
  plannerVersion: text("planner_version"),
  rendererVersion: text("renderer_version"),
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
  artifactType: text("artifact_type", { enum: artifactTypes })
    .notNull()
    .default("document"),
  previousContent: text("previous_content").notNull(),
  summary: text("summary").notNull().default(""),
  payloadJson: text("payload_json"),
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

// Google OAuth2 credentials (single-row "singleton" table)
export const googleOAuthCredentials = sqliteTable("google_oauth_credentials", {
  id: text("id").primaryKey().default("singleton"),
  clientId: text("client_id"),
  encryptedClientSecret: text("encrypted_client_secret"),
  ivClientSecret: text("iv_client_secret"),
  authTagClientSecret: text("auth_tag_client_secret"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  ivRefreshToken: text("iv_refresh_token"),
  authTagRefreshToken: text("auth_tag_refresh_token"),
  updatedAt: integer("updated_at", { mode: "number" }),
});
