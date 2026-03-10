import Anthropic from "@anthropic-ai/sdk";
import {
  UPDATE_DOCUMENT_TOOL,
  UPDATE_SLIDE_DECK_TOOL,
  type DocumentUpdate,
  type SlideDeckUpdate,
} from "./tools";
import { getSystemPrompt, buildMessages, type LlmMessage } from "./prompt";
import {
  buildStructuredAutoUpdate,
  extractConversationNotes,
  ensureStructuredDocument,
  mergeDocumentWithConversationNotes,
  splitDocumentContent,
} from "@/lib/document-template";
import {
  normalizeSlideDeck,
  normalizeSlideDeckWithWarnings,
} from "@/lib/slides/normalize";
import { planSlideDeckFromMarkdown } from "@/lib/slides/planner";
import { reconcileSlideDeck } from "@/lib/slides/reconcile";
import type {
  ArtifactType,
  Message,
  SlideDeck,
  SlideVisualImage,
  SlideVisualTable,
} from "@/lib/types";

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

interface ChatArtifactContext {
  artifactType: ArtifactType;
  doc: string;
  notes?: string;
  slideDeck?: SlideDeck | null;
  currentSlideId?: string | null;
  userMessage: string;
}

interface ChatResult {
  text: string;
  documentUpdate: DocumentUpdate | null;
  slideDeckUpdate: SlideDeckUpdate | null;
}

type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "document_update"; document: string; summary: string }
  | {
      type: "slide_deck_update";
      slideDeck: SlideDeck;
      summary: string;
      warnings?: string[];
    }
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

function getToolDefinition(artifactType: ArtifactType) {
  return artifactType === "slides" ? UPDATE_SLIDE_DECK_TOOL : UPDATE_DOCUMENT_TOOL;
}

function buildAutoSlideDeckUpdate(
  context: ChatArtifactContext,
  assistantText: string
): SlideDeckUpdate {
  const baseDeck =
    context.slideDeck ??
    planSlideDeckFromMarkdown(context.doc, context.userMessage).deck;
  const deck = structuredClone(baseDeck);
  const target =
    (context.currentSlideId
      ? deck.slides.find((slide) => slide.id === context.currentSlideId)
      : null) ??
    deck.slides.find((slide) => slide.kind === "content") ??
    deck.slides[deck.slides.length - 1];

  if (target) {
    const appliedVisuals = applyVisualDirectives(target, context.userMessage);
    if (!appliedVisuals) {
      const bullet = summarizeForDraft(context.userMessage, 120);
      if (bullet) {
        target.bullets = [...target.bullets, bullet];
      }
    }
    const notes = summarizeForDraft(assistantText, 180);
    if (notes) {
      target.speakerNotes = [target.speakerNotes, notes]
        .filter(Boolean)
        .join("\n");
    }
  }

  return {
    slideDeck: deck,
    summary: "会話内容から slide deck を更新",
  };
}

function parseMarkdownTableFromText(text: string): SlideVisualTable | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"));
  if (lines.length < 2) return null;

  const rows = lines
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell, index, all) => {
          if (all.length === 0) return false;
          if (index === 0 && cell === "") return false;
          if (index === all.length - 1 && cell === "") return false;
          return true;
        })
    )
    .filter((row) => row.length > 0);
  if (rows.length < 2) return null;

  const delimiterRow = rows[1];
  const normalizedRows =
    delimiterRow && delimiterRow.every((cell) => /^:?-{3,}:?$/.test(cell))
      ? [rows[0], ...rows.slice(2)]
      : rows;
  if (normalizedRows.length < 2) return null;

  return {
    type: "table",
    rows: normalizedRows,
  };
}

function parseImageVisualFromText(text: string): SlideVisualImage | null {
  const markdownImage = text.match(/!\[(.*?)\]\((.+?)\)/);
  if (markdownImage) {
    return {
      type: "image",
      alt: markdownImage[1]?.trim() || undefined,
      src: markdownImage[2]?.trim() || "",
    };
  }

  const dataUrl = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUrl) {
    return {
      type: "image",
      src: dataUrl[0],
    };
  }

  const url = text.match(/https?:\/\/\S+\.(png|jpe?g|svg|webp|gif)\S*/i);
  if (url) {
    return {
      type: "image",
      src: url[0],
    };
  }

  return null;
}

function applyVisualDirectives(
  target: SlideDeck["slides"][number],
  text: string
): boolean {
  const tableVisual = parseMarkdownTableFromText(text);
  const imageVisual = parseImageVisualFromText(text);
  if (!tableVisual && !imageVisual) return false;

  const nextVisuals = target.visuals.filter(
    (visual) =>
      visual.type !== (tableVisual ? "table" : "__unused__") &&
      visual.type !== (imageVisual ? "image" : "__unused__")
  );
  if (imageVisual) {
    nextVisuals.push(imageVisual);
  }
  if (tableVisual) {
    nextVisuals.push(tableVisual);
  }
  target.visuals = nextVisuals;
  return true;
}

function finalizeSlideDeckUpdate(
  context: ChatArtifactContext,
  update: SlideDeckUpdate
): SlideDeckUpdate {
  const reconciled =
    reconcileSlideDeck({
      baseDeck: context.slideDeck,
      nextDeck: update.slideDeck,
      focusSlideId: context.currentSlideId,
    }) ?? update.slideDeck;
  const normalized = normalizeSlideDeckWithWarnings(reconciled);
  return {
    ...update,
    slideDeck: normalized.deck ?? reconciled,
    warnings: [...(update.warnings ?? []), ...normalized.warnings],
  };
}

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

function resolveProviderConfigs(runtimeKeys?: RuntimeProviderKeys, preferredProvider?: string): ProviderConfig[] {
  const preferred = (preferredProvider?.toLowerCase() || getEnv("LLM_PROVIDER")?.toLowerCase());
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

function parseSlideDeck(value: unknown): SlideDeck | null {
  const normalized = normalizeSlideDeckWithWarnings(value);
  if (normalized.warnings.length > 0) {
    console.warn("slideDeck normalized with warnings:", normalized.warnings);
  }
  return normalized.deck;
}

function parseSlideDeckUpdate(input: unknown): SlideDeckUpdate | null {
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
  let deckValue = obj.slide_deck ?? obj.slideDeck ?? obj.slide_deck_json;
  if (typeof deckValue === "string") {
    try {
      deckValue = JSON.parse(deckValue);
    } catch {
      return null;
    }
  }
  const normalized = normalizeSlideDeckWithWarnings(deckValue);
  if (normalized.warnings.length > 0) {
    console.warn("slideDeck normalized with warnings:", normalized.warnings);
  }
  const slideDeck = normalized.deck;
  if (!slideDeck) {
    return null;
  }

  return {
    slideDeck,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    warnings: normalized.warnings,
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
  messages: LlmMessage[],
  artifactType: ArtifactType
): Promise<AsyncGenerator<StreamEvent>> {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const tool = getToolDefinition(artifactType) as unknown as Anthropic.Tool;
  const toolName = tool.name;
  const parseToolUpdate =
    artifactType === "slides" ? parseSlideDeckUpdate : parseDocumentUpdate;

  const stream = anthropic.messages.stream({
    model: config.model,
    max_tokens: 8192,
    system: getSystemPrompt(artifactType),
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
          const parsed = parseToolUpdate(toolInput);
          if (parsed) {
            if (toolName === UPDATE_SLIDE_DECK_TOOL.name) {
              const deckUpdate = parsed as SlideDeckUpdate;
              yield {
                type: "slide_deck_update",
                slideDeck: deckUpdate.slideDeck,
                summary: deckUpdate.summary,
              };
            } else {
              const documentUpdate = parsed as DocumentUpdate;
              yield {
                type: "document_update",
                document: documentUpdate.document,
                summary: documentUpdate.summary,
              };
            }
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
  messages: LlmMessage[],
  artifactType: ArtifactType
): Promise<ChatResult> {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const tool = getToolDefinition(artifactType) as unknown as Anthropic.Tool;
  const parseToolUpdate =
    artifactType === "slides" ? parseSlideDeckUpdate : parseDocumentUpdate;

  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: 8192,
    system: getSystemPrompt(artifactType),
    messages,
    tools: [tool],
  });

  let text = "";
  let documentUpdate: DocumentUpdate | null = null;
  let slideDeckUpdate: SlideDeckUpdate | null = null;

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
      continue;
    }

    if (block.type === "tool_use" && block.name === tool.name) {
      const parsed = parseToolUpdate(block.input);
      if (artifactType === "slides") {
        slideDeckUpdate = parsed as SlideDeckUpdate | null;
      } else {
        documentUpdate = parsed as DocumentUpdate | null;
      }
    }
  }

  return { text, documentUpdate, slideDeckUpdate };
}

async function chatOpenAi(
  config: ProviderConfig,
  messages: LlmMessage[],
  artifactType: ArtifactType
): Promise<ChatResult> {
  const tool = getToolDefinition(artifactType);
  const systemPrompt = getSystemPrompt(artifactType);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      tools: [
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
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
  let slideDeckUpdate: SlideDeckUpdate | null = null;

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
        if (!fn || fn.name !== tool.name) continue;

        if (artifactType === "slides") {
          slideDeckUpdate = parseSlideDeckUpdate(fn.arguments);
        } else {
          documentUpdate = parseDocumentUpdate(fn.arguments);
        }
      }
    }
  }

  return { text, documentUpdate, slideDeckUpdate };
}

async function chatGemini(
  config: ProviderConfig,
  messages: LlmMessage[],
  artifactType: ArtifactType
): Promise<ChatResult> {
  const tool = getToolDefinition(artifactType);
  const systemPrompt = getSystemPrompt(artifactType);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      tools: [
        {
          functionDeclarations: [
            {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
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
  let slideDeckUpdate: SlideDeckUpdate | null = null;

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
      if (!functionCall || functionCall.name !== tool.name) {
        continue;
      }

      if (artifactType === "slides") {
        slideDeckUpdate = parseSlideDeckUpdate(functionCall.args);
      } else {
        documentUpdate = parseDocumentUpdate(functionCall.args);
      }
    }
  }

  return { text, documentUpdate, slideDeckUpdate };
}

async function chatMock(context: ChatArtifactContext): Promise<ChatResult> {
  const text = `モック応答: ${context.userMessage}`;
  if (context.artifactType === "slides") {
    const baseDeck =
      context.slideDeck ??
      planSlideDeckFromMarkdown(context.doc, context.userMessage).deck;
    const target =
      (context.currentSlideId
        ? baseDeck.slides.find((slide) => slide.id === context.currentSlideId)
        : null) ??
      baseDeck.slides.find((slide) => slide.kind === "content") ??
      baseDeck.slides[0];
    const nextTarget = structuredClone(target);
    const appliedVisuals = applyVisualDirectives(nextTarget, context.userMessage);
    if (!appliedVisuals) {
      nextTarget.bullets = [
        ...nextTarget.bullets,
        summarizeForDraft(context.userMessage, 120),
      ];
    }
    nextTarget.speakerNotes = [nextTarget.speakerNotes, summarizeForDraft(text, 160)]
      .filter(Boolean)
      .join("\n");

    return {
      text,
      documentUpdate: null,
      slideDeckUpdate: {
        slideDeck: {
          title: baseDeck.title,
          slides: [nextTarget],
        },
        summary: "mock provider で slide deck を更新",
      },
    };
  }

  const base = context.doc.trim() ? context.doc.trim() : "# Mock Draft";
  const summary = "mock provider でドキュメントを更新";
  const document = `${base}\n\n## Latest Update\n- ${context.userMessage}`;

  return {
    text,
    documentUpdate: {
      document,
      summary,
    },
    slideDeckUpdate: null,
  };
}

async function chatWithProvider(
  config: ProviderConfig,
  messages: LlmMessage[],
  context: ChatArtifactContext
): Promise<ChatResult> {
  if (config.provider === "mock") {
    return chatMock(context);
  }
  if (config.provider === "anthropic") {
    return chatAnthropic(config, messages, context.artifactType);
  }
  if (config.provider === "openai") {
    return chatOpenAi(config, messages, context.artifactType);
  }
  return chatGemini(config, messages, context.artifactType);
}

export async function* streamChat(
  context: {
    artifactType: ArtifactType;
    doc: string;
    slideDeck?: SlideDeck | null;
    currentSlideId?: string | null;
  },
  history: Message[],
  userMessage: string,
  options: { providerKeys?: RuntimeProviderKeys; preferredProvider?: string } = {}
): AsyncGenerator<StreamEvent> {
  const splitDoc = splitDocumentContent(context.doc);
  const normalizedDoc = ensureStructuredDocument(splitDoc.material);
  const artifactContext: ChatArtifactContext = {
    artifactType: context.artifactType,
    doc: normalizedDoc,
    notes: extractConversationNotes(context.doc),
    slideDeck: context.slideDeck ?? null,
    currentSlideId: context.currentSlideId ?? null,
    userMessage,
  };
  const messages = buildMessages({
    artifactType: artifactContext.artifactType,
    doc: artifactContext.doc,
    notes: artifactContext.notes,
    slideDeck: artifactContext.slideDeck,
    currentSlideId: artifactContext.currentSlideId,
    history,
    userMessage,
  });
  const providers = resolveProviderConfigs(options.providerKeys, options.preferredProvider);
  const fallbackErrors: string[] = [];

  for (let i = 0; i < providers.length; i++) {
    const config = providers[i];
    const hasNext = i < providers.length - 1;

    if (config.provider === "anthropic") {
      let emitted = false;
      try {
        const stream = await streamAnthropic(
          config,
          messages,
          artifactContext.artifactType
        );
        let fullText = "";
        let documentUpdated = false;
        let slideDeckUpdated = false;

        for await (const event of stream) {
          emitted = true;
          if (event.type === "document_update") {
            documentUpdated = true;
            yield event;
            continue;
          }
          if (event.type === "slide_deck_update") {
            slideDeckUpdated = true;
            yield event;
            continue;
          }
          if (event.type === "done") {
            fullText = event.fullText;
            continue;
          }
        }

        const finalText = ensureAdvisoryAssistantText(fullText, userMessage);
        if (artifactContext.artifactType === "slides") {
          if (!slideDeckUpdated) {
            const autoDeck = finalizeSlideDeckUpdate(
              artifactContext,
              buildAutoSlideDeckUpdate(artifactContext, finalText)
            );
            yield {
              type: "slide_deck_update",
              slideDeck: autoDeck.slideDeck,
              summary: autoDeck.summary,
            };
          }
        } else if (!documentUpdated) {
          const autoDraft = buildAutoDraftUpdate(
            context.doc,
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
      const result = await chatWithProvider(config, messages, artifactContext);
      const finalText = ensureAdvisoryAssistantText(result.text, userMessage);
      yield { type: "text_delta", text: finalText };
      if (artifactContext.artifactType === "slides") {
        const slideDeckUpdate = finalizeSlideDeckUpdate(
          artifactContext,
          result.slideDeckUpdate ??
            buildAutoSlideDeckUpdate(artifactContext, finalText)
        );
        yield {
          type: "slide_deck_update",
          slideDeck: slideDeckUpdate.slideDeck,
          summary: slideDeckUpdate.summary,
        };
      } else {
        const documentUpdate = result.documentUpdate
          ? {
              ...result.documentUpdate,
              document: mergeDocumentWithConversationNotes(
                context.doc,
                result.documentUpdate.document,
                userMessage,
                finalText
              ),
            }
          : buildAutoDraftUpdate(context.doc, userMessage, finalText);
        yield {
          type: "document_update",
          document: documentUpdate.document,
          summary: documentUpdate.summary,
        };
      }
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
  context: {
    artifactType: ArtifactType;
    doc: string;
    slideDeck?: SlideDeck | null;
    currentSlideId?: string | null;
  },
  history: Message[],
  userMessage: string,
  options: { providerKeys?: RuntimeProviderKeys } = {}
): Promise<ChatResult> {
  const splitDoc = splitDocumentContent(context.doc);
  const normalizedDoc = ensureStructuredDocument(splitDoc.material);
  const artifactContext: ChatArtifactContext = {
    artifactType: context.artifactType,
    doc: normalizedDoc,
    notes: extractConversationNotes(context.doc),
    slideDeck: context.slideDeck ?? null,
    currentSlideId: context.currentSlideId ?? null,
    userMessage,
  };
  const messages = buildMessages({
    artifactType: artifactContext.artifactType,
    doc: artifactContext.doc,
    notes: artifactContext.notes,
    slideDeck: artifactContext.slideDeck,
    currentSlideId: artifactContext.currentSlideId,
    history,
    userMessage,
  });
  const providers = resolveProviderConfigs(options.providerKeys);
  const fallbackErrors: string[] = [];

  for (let i = 0; i < providers.length; i++) {
    const config = providers[i];
    const hasNext = i < providers.length - 1;

    try {
      const result = await chatWithProvider(config, messages, artifactContext);
      const finalText = ensureAdvisoryAssistantText(result.text, userMessage);
      return {
        text: finalText,
        documentUpdate:
          artifactContext.artifactType === "slides"
            ? null
            : result.documentUpdate
              ? {
                  ...result.documentUpdate,
                  document: mergeDocumentWithConversationNotes(
                    context.doc,
                    result.documentUpdate.document,
                    userMessage,
                    finalText
                  ),
                }
              : buildAutoDraftUpdate(context.doc, userMessage, finalText),
        slideDeckUpdate:
          artifactContext.artifactType === "slides"
            ? finalizeSlideDeckUpdate(
                artifactContext,
                result.slideDeckUpdate ??
                  buildAutoSlideDeckUpdate(artifactContext, finalText)
              )
            : null,
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
