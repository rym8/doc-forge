import type { SlideDeck } from "@/lib/types";

type JsonSchema =
  | {
      type: "object";
      description?: string;
      properties: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: boolean;
    }
  | {
      type: "array";
      description?: string;
      items: JsonSchema;
      minItems?: number;
    }
  | {
      type: "string" | "number" | "boolean";
      description?: string;
      enum?: string[];
    };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export interface DocumentUpdate {
  document: string;
  summary: string;
}

export interface SlideDeckUpdate {
  slideDeck: SlideDeck;
  summary: string;
  warnings?: string[];
}

const SLIDE_SCHEMA: JsonSchema = {
  type: "object",
  description: "単一 slide",
  properties: {
    id: { type: "string", description: "既存 slide の id。維持すること" },
    kind: {
      type: "string",
      enum: ["title", "section", "content", "summary"],
      description: "slide 種別",
    },
    title: { type: "string", description: "slide タイトル" },
    bullets: {
      type: "array",
      description: "箇条書き",
      items: { type: "string" },
    },
    body: { type: "string", description: "補足本文" },
    speakerNotes: { type: "string", description: "speaker notes" },
    visuals: {
      type: "array",
      description: "visuals の配列",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["image", "table"] },
          src: { type: "string" },
          assetPath: { type: "string" },
          alt: { type: "string" },
          caption: { type: "string" },
          rows: {
            type: "array",
            items: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        required: ["type"],
      },
    },
    layout: {
      type: "string",
      enum: ["title-slide", "title-body", "section-divider", "summary-grid"],
      description: "レイアウト名",
    },
    themeVariant: { type: "string", description: "theme variant 名" },
  },
  required: ["id", "kind", "title", "bullets", "visuals", "layout"],
  additionalProperties: false,
};

const SLIDE_DECK_SCHEMA: JsonSchema = {
  type: "object",
  description: "slideDeck 全体",
  properties: {
    title: { type: "string", description: "デッキタイトル" },
    subtitle: { type: "string", description: "デッキサブタイトル" },
    objective: { type: "string", description: "発表目的" },
    audience: { type: "string", description: "想定読者" },
    slides: {
      type: "array",
      description: "slides 配列。順序を保持する",
      items: SLIDE_SCHEMA,
      minItems: 1,
    },
  },
  required: ["title", "slides"],
  additionalProperties: false,
};

export const UPDATE_DOCUMENT_TOOL: ToolDefinition = {
  name: "update_document",
  description:
    "ドキュメントのMarkdown全体を更新する。ユーザーとの対話に基づいてドキュメントを改善・修正する際に使用する。",
  input_schema: {
    type: "object",
    properties: {
      document: {
        type: "string",
        description: "更新後のMarkdown全文",
      },
      summary: {
        type: "string",
        description: "変更内容の日本語での要約（1-2文）",
      },
    },
    required: ["document", "summary"],
  },
};

export const UPDATE_SLIDE_DECK_TOOL: ToolDefinition = {
  name: "update_slide_deck",
  description:
    "スライドデッキ全体を更新する。現在の slideDeck 全体を object として返す。",
  input_schema: {
    type: "object",
    properties: {
      slide_deck: {
        ...SLIDE_DECK_SCHEMA,
        description:
          "更新後の slideDeck 全体。既存 slide の id を維持し、未変更 slide は保持すること。",
      },
      summary: {
        type: "string",
        description: "変更内容の日本語要約（1-2文）",
      },
    },
    required: ["slide_deck", "summary"],
    additionalProperties: false,
  },
};
