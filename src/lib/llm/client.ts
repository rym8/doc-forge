import Anthropic from "@anthropic-ai/sdk";
import { UPDATE_DOCUMENT_TOOL, type DocumentUpdate } from "./tools";
import { SYSTEM_PROMPT, buildMessages, type LlmMessage } from "./prompt";
import {
  buildStructuredAutoUpdate,
  ensureStructuredDocument,
} from "@/lib/document-template";
import type { Message } from "@/lib/types";

type Provider = "anthropic" | "openai" | "gemini" | "mock";
type RealProvider = Exclude<Provider, "mock">;

interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
}

interface RuntimeProviderKeys {
  anthropic?: string;
  openai?: string;
  gemini?: string;
}

interface ChatResult {
  text: string;
  documentUpdate: DocumentUpdate | null;
}

type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "document_update"; document: string; summary: string }
  | { type: "done"; fullText: string };

const ALL_PROVIDERS: Provider[] = ["gemini", "openai", "anthropic", "mock"];
const FALLBACK_PROVIDER_ORDER: RealProvider[] = [
  "gemini",
  "openai",
  "anthropic",
];
const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-pro",
  mock: "mock-model",
};

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isProvider(value: string): value is Provider {
  return ALL_PROVIDERS.includes(value as Provider);
}

function getProviderSettings(runtimeKeys?: RuntimeProviderKeys) {
  const providerKeys: Record<Provider, string | undefined> = {
    anthropic: runtimeKeys?.anthropic ?? getEnv("ANTHROPIC_API_KEY"),
    openai: runtimeKeys?.openai ?? getEnv("OPENAI_API_KEY"),
    gemini:
      runtimeKeys?.gemini ??
      getEnv("GEMINI_API_KEY") ??
      getEnv("GOOGLE_API_KEY"),
    mock: undefined,
  };
  const providerModels: Record<Provider, string> = {
    anthropic: getEnv("ANTHROPIC_MODEL") ?? DEFAULT_MODELS.anthropic,
    openai: getEnv("OPENAI_MODEL") ?? DEFAULT_MODELS.openai,
    gemini: getEnv("GEMINI_MODEL") ?? DEFAULT_MODELS.gemini,
    mock: DEFAULT_MODELS.mock,
  };

  return { providerKeys, providerModels };
}

function resolveProviderConfigs(runtimeKeys?: RuntimeProviderKeys): ProviderConfig[] {
  const preferred = getEnv("LLM_PROVIDER")?.toLowerCase();
  const { providerKeys, providerModels } = getProviderSettings(runtimeKeys);

  const buildProviderConfig = (
    provider: RealProvider
  ): ProviderConfig | null => {
    const key = providerKeys[provider];
    if (!key) return null;
    return {
      provider,
      apiKey: key,
      model: providerModels[provider],
    };
  };

  if (preferred) {
    if (!isProvider(preferred)) {
      throw new Error(`Unsupported LLM_PROVIDER: ${preferred}.`);
    }

    if (preferred === "mock") {
      return [{ provider: "mock", apiKey: "mock", model: providerModels.mock }];
    }

    const preferredConfig = buildProviderConfig(preferred);
    if (!preferredConfig) {
      throw new Error(
        `LLM_PROVIDER=${preferred} is set, but API key is missing for that provider.`
      );
    }

    const fallbackConfigs = FALLBACK_PROVIDER_ORDER
      .filter((provider) => provider !== preferred)
      .map(buildProviderConfig)
      .filter((config): config is ProviderConfig => config !== null);

    return [preferredConfig, ...fallbackConfigs];
  }

  const autoConfigs = FALLBACK_PROVIDER_ORDER
    .map(buildProviderConfig)
    .filter((config): config is ProviderConfig => config !== null);
  if (autoConfigs.length > 0) return autoConfigs;

  throw new Error(
    "LLM APIキーが見つかりません。GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY のいずれかを設定するか、メニュー > 設定 > LLMキー設定 を使うか、LLM_PROVIDER=mock を指定してください。"
  );
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as Record<string, unknown>).status;
  if (typeof status === "number") return status;
  if (typeof status === "string" && status.trim()) {
    const parsed = Number(status);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 429) return true;

  const lower = getErrorMessage(error).toLowerCase();
  const keywords = [
    "quota",
    "rate limit",
    "ratelimit",
    "too many requests",
    "resource exhausted",
    "insufficient_quota",
    "exceeded your current quota",
    "limit exceeded",
    "429",
  ];
  return keywords.some((keyword) => lower.includes(keyword));
}

function parseDocumentUpdate(input: unknown): DocumentUpdate | null {
  let parsed = input;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.document !== "string") {
    return null;
  }

  return {
    document: obj.document,
    summary: typeof obj.summary === "string" ? obj.summary : "",
  };
}

const CONVERSATION_NOTES_START = "<!-- DOC_FORGE_CONVERSATION_NOTES_START -->";
const CONVERSATION_DRAFT_HEADING = "## Conversation Draft";
const DOCUMENT_BLOCK = /<document>[\s\S]*?<\/document>/gi;
const CONVERSATION_NOTES_BLOCK = /<!-- DOC_FORGE_CONVERSATION_NOTES_START -->[\s\S]*?<!-- DOC_FORGE_CONVERSATION_NOTES_END -->/gi;
const LEGACY_CONVERSATION_SECTION = /\n?##\s+Conversation Draft[\s\S]*$/im;

function findFirstMarkerIndex(text: string): number {
  const markers = [
    "<document>",
    "</document>",
    CONVERSATION_NOTES_START,
    CONVERSATION_DRAFT_HEADING,
  ];
  const lower = text.toLowerCase();
  const indexes = markers
    .map((marker) => lower.indexOf(marker.toLowerCase()))
    .filter((idx) => idx >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function stripDocumentArtifacts(text: string): string {
  const markerIndex = findFirstMarkerIndex(text);
  let cleaned = text;

  // Keep conversational lead text, drop trailing document payload.
  if (markerIndex >= 0) {
    const prefix = text.slice(0, markerIndex).trim();
    if (prefix) {
      cleaned = prefix;
    }
  }

  return cleaned
    .replace(DOCUMENT_BLOCK, "\n")
    .replace(CONVERSATION_NOTES_BLOCK, "\n")
    .replace(LEGACY_CONVERSATION_SECTION, "\n")
    .replace(/<\/?document>/gi, "\n")
    .replace(/<!--\s*DOC_FORGE_CONVERSATION_NOTES_(START|END)\s*-->/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function summarizeForDraft(text: string, max = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function buildAutoDraftUpdate(
  doc: string,
  userMessage: string,
  assistantText: string
): DocumentUpdate {
  return buildStructuredAutoUpdate(doc, userMessage, assistantText);
}

function buildConversationalFallbackText(
  userMessage: string
): string {
  const topic = summarizeForDraft(userMessage, 140);
  return [
    "次に本文を前に進めるため、内容面で3点を詰めたいです。",
    `1) 「${topic}」で最も優先したいメッセージは何か`,
    "2) 想定読者（誰が、どの場面で読むか）",
    "3) 読後に取ってほしい行動や判断",
    "この3点が決まると、見出し構成と本文の説得力を一段上げられます。",
  ].join("\n");
}

function isOperationalStatusText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return true;

  const operationalKeywords = [
    "承知しました",
    "了解しました",
    "対応します",
    "やります",
    "更新しました",
    "反映しました",
    "追記しました",
    "作成しました",
    "下書き",
    "ドキュメントを更新",
  ];
  const advisoryKeywords = [
    "読者",
    "目的",
    "構成",
    "見出し",
    "論点",
    "提案",
    "改善",
    "次に",
    "なぜ",
    "?",
    "？",
  ];

  const hasOperational = operationalKeywords.some((k) =>
    normalized.includes(k)
  );
  const hasAdvisory = advisoryKeywords.some((k) => normalized.includes(k));

  return hasOperational && !hasAdvisory && normalized.length <= 260;
}

function ensureAdvisoryAssistantText(
  text: string,
  userMessage: string
): string {
  const trimmed = stripDocumentArtifacts(text);
  if (!trimmed) return buildConversationalFallbackText(userMessage);
  if (isOperationalStatusText(trimmed)) {
    return buildConversationalFallbackText(userMessage);
  }
  return trimmed;
}

function getApiErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  const error = obj.error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : undefined;
}

function extractOpenAiText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (record.type !== "text") return "";
      return typeof record.text === "string" ? record.text : "";
    })
    .join("");
}

async function streamAnthropic(
  config: ProviderConfig,
  messages: LlmMessage[]
): Promise<AsyncGenerator<StreamEvent>> {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const tool = UPDATE_DOCUMENT_TOOL as unknown as Anthropic.Tool;

  const stream = anthropic.messages.stream({
    model: config.model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages,
    tools: [tool],
  });

  return (async function* () {
    let fullText = "";
    let toolInput = "";
    let inToolUse = false;

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          inToolUse = true;
          toolInput = "";
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          fullText += event.delta.text;
          yield { type: "text_delta", text: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          toolInput += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        if (inToolUse && toolInput) {
          const parsed = parseDocumentUpdate(toolInput);
          if (parsed) {
            yield {
              type: "document_update",
              document: parsed.document,
              summary: parsed.summary,
            };
          }
          inToolUse = false;
        }
      }
    }

    yield { type: "done", fullText };
  })();
}

async function chatAnthropic(
  config: ProviderConfig,
  messages: LlmMessage[]
): Promise<ChatResult> {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const tool = UPDATE_DOCUMENT_TOOL as unknown as Anthropic.Tool;

  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages,
    tools: [tool],
  });

  let text = "";
  let documentUpdate: DocumentUpdate | null = null;

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
      continue;
    }

    if (block.type === "tool_use" && block.name === UPDATE_DOCUMENT_TOOL.name) {
      documentUpdate = parseDocumentUpdate(block.input);
    }
  }

  return { text, documentUpdate };
}

async function chatOpenAi(
  config: ProviderConfig,
  messages: LlmMessage[]
): Promise<ChatResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      tools: [
        {
          type: "function",
          function: {
            name: UPDATE_DOCUMENT_TOOL.name,
            description: UPDATE_DOCUMENT_TOOL.description,
            parameters: UPDATE_DOCUMENT_TOOL.input_schema,
          },
        },
      ],
      tool_choice: "auto",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const apiMessage = getApiErrorMessage(data);
    throw new Error(apiMessage ?? `OpenAI API error: ${response.status}`);
  }

  const choice = (data as Record<string, unknown>).choices;
  const first = Array.isArray(choice) ? choice[0] : undefined;
  const message =
    first && typeof first === "object"
      ? (first as Record<string, unknown>).message
      : undefined;

  let text = "";
  let documentUpdate: DocumentUpdate | null = null;

  if (message && typeof message === "object") {
    const msg = message as Record<string, unknown>;
    text = extractOpenAiText(msg.content);

    const toolCalls = msg.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (!call || typeof call !== "object") continue;
        const c = call as Record<string, unknown>;
        if (c.type !== "function") continue;
        const fn =
          c.function && typeof c.function === "object"
            ? (c.function as Record<string, unknown>)
            : undefined;
        if (!fn || fn.name !== UPDATE_DOCUMENT_TOOL.name) continue;

        documentUpdate = parseDocumentUpdate(fn.arguments);
      }
    }
  }

  return { text, documentUpdate };
}

async function chatGemini(
  config: ProviderConfig,
  messages: LlmMessage[]
): Promise<ChatResult> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      tools: [
        {
          functionDeclarations: [
            {
              name: UPDATE_DOCUMENT_TOOL.name,
              description: UPDATE_DOCUMENT_TOOL.description,
              parameters: UPDATE_DOCUMENT_TOOL.input_schema,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const apiMessage = getApiErrorMessage(data);
    throw new Error(apiMessage ?? `Gemini API error: ${response.status}`);
  }

  const candidates = (data as Record<string, unknown>).candidates;
  const candidate = Array.isArray(candidates) ? candidates[0] : undefined;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Gemini API returned no candidates");
  }

  const content = (candidate as Record<string, unknown>).content;
  const parts =
    content && typeof content === "object"
      ? (content as Record<string, unknown>).parts
      : undefined;

  let text = "";
  let documentUpdate: DocumentUpdate | null = null;

  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") {
        text += p.text;
      }

      const functionCall =
        p.functionCall && typeof p.functionCall === "object"
          ? (p.functionCall as Record<string, unknown>)
          : undefined;
      if (!functionCall || functionCall.name !== UPDATE_DOCUMENT_TOOL.name) {
        continue;
      }

      documentUpdate = parseDocumentUpdate(functionCall.args);
    }
  }

  return { text, documentUpdate };
}

async function chatMock(doc: string, userMessage: string): Promise<ChatResult> {
  const base = doc.trim() ? doc.trim() : "# Mock Draft";
  const text = `モック応答: ${userMessage}`;
  const summary = "mock provider でドキュメントを更新";
  const document = `${base}\n\n## Latest Update\n- ${userMessage}`;

  return {
    text,
    documentUpdate: {
      document,
      summary,
    },
  };
}

async function chatWithProvider(
  config: ProviderConfig,
  messages: LlmMessage[],
  context: { doc: string; userMessage: string }
): Promise<ChatResult> {
  if (config.provider === "mock") {
    return chatMock(context.doc, context.userMessage);
  }
  if (config.provider === "anthropic") {
    return chatAnthropic(config, messages);
  }
  if (config.provider === "openai") {
    return chatOpenAi(config, messages);
  }
  return chatGemini(config, messages);
}

export async function* streamChat(
  doc: string,
  history: Message[],
  userMessage: string,
  options: { providerKeys?: RuntimeProviderKeys } = {}
): AsyncGenerator<StreamEvent> {
  const normalizedDoc = ensureStructuredDocument(doc);
  const messages = buildMessages(normalizedDoc, history, userMessage);
  const providers = resolveProviderConfigs(options.providerKeys);
  const fallbackErrors: string[] = [];

  for (let i = 0; i < providers.length; i++) {
    const config = providers[i];
    const hasNext = i < providers.length - 1;

    if (config.provider === "anthropic") {
      let emitted = false;
      try {
        const stream = await streamAnthropic(config, messages);
        let fullText = "";
        let documentUpdated = false;

        for await (const event of stream) {
          emitted = true;
          if (event.type === "document_update") {
            documentUpdated = true;
            yield event;
            continue;
          }
          if (event.type === "done") {
            fullText = event.fullText;
            continue;
          }
        }

        const finalText = ensureAdvisoryAssistantText(fullText, userMessage);
        if (!documentUpdated) {
          const autoDraft = buildAutoDraftUpdate(
            normalizedDoc,
            userMessage,
            finalText
          );
          yield {
            type: "document_update",
            document: autoDraft.document,
            summary: autoDraft.summary,
          };
        }
        yield { type: "text_delta", text: finalText };
        yield { type: "done", fullText: finalText };
        return;
      } catch (error) {
        const message = getErrorMessage(error);
        const shouldFallback =
          !emitted && hasNext && isQuotaOrRateLimitError(error);
        if (shouldFallback) {
          fallbackErrors.push(`${config.provider}: ${message}`);
          continue;
        }

        const trail = fallbackErrors.length
          ? ` Fallback trail: ${fallbackErrors.join(" | ")}`
          : "";
        throw new Error(`LLM provider ${config.provider} failed: ${message}.${trail}`);
      }
    }

    try {
      const result = await chatWithProvider(config, messages, {
        doc: normalizedDoc,
        userMessage,
      });
      const finalText = ensureAdvisoryAssistantText(result.text, userMessage);
      const documentUpdate =
        result.documentUpdate ??
        buildAutoDraftUpdate(normalizedDoc, userMessage, finalText);
      yield { type: "text_delta", text: finalText };
      yield {
        type: "document_update",
        document: documentUpdate.document,
        summary: documentUpdate.summary,
      };
      yield { type: "done", fullText: finalText };
      return;
    } catch (error) {
      const message = getErrorMessage(error);
      const shouldFallback = hasNext && isQuotaOrRateLimitError(error);
      if (shouldFallback) {
        fallbackErrors.push(`${config.provider}: ${message}`);
        continue;
      }

      const trail = fallbackErrors.length
        ? ` Fallback trail: ${fallbackErrors.join(" | ")}`
        : "";
      throw new Error(`LLM provider ${config.provider} failed: ${message}.${trail}`);
    }
  }

  if (fallbackErrors.length > 0) {
    throw new Error(
      `All configured LLM providers exceeded quota/rate limits: ${fallbackErrors.join(" | ")}`
    );
  }
  throw new Error("No available LLM providers.");
}

export async function chat(
  doc: string,
  history: Message[],
  userMessage: string,
  options: { providerKeys?: RuntimeProviderKeys } = {}
): Promise<ChatResult> {
  const normalizedDoc = ensureStructuredDocument(doc);
  const messages = buildMessages(normalizedDoc, history, userMessage);
  const providers = resolveProviderConfigs(options.providerKeys);
  const fallbackErrors: string[] = [];

  for (let i = 0; i < providers.length; i++) {
    const config = providers[i];
    const hasNext = i < providers.length - 1;

    try {
      const result = await chatWithProvider(config, messages, {
        doc: normalizedDoc,
        userMessage,
      });
      const finalText = ensureAdvisoryAssistantText(result.text, userMessage);
      const documentUpdate =
        result.documentUpdate ??
        buildAutoDraftUpdate(normalizedDoc, userMessage, finalText);
      return {
        text: finalText,
        documentUpdate,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      const shouldFallback = hasNext && isQuotaOrRateLimitError(error);
      if (shouldFallback) {
        fallbackErrors.push(`${config.provider}: ${message}`);
        continue;
      }

      const trail = fallbackErrors.length
        ? ` Fallback trail: ${fallbackErrors.join(" | ")}`
        : "";
      throw new Error(`LLM provider ${config.provider} failed: ${message}.${trail}`);
    }
  }

  throw new Error(
    `All configured LLM providers exceeded quota/rate limits: ${fallbackErrors.join(" | ")}`
  );
}
