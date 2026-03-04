export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

export interface DocumentUpdate {
  document: string;
  summary: string;
}

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
