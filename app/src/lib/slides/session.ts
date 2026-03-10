import type {
  ArtifactType,
  Session,
  SlideDeck,
  SlideExportOptions,
  SlideTheme,
} from "@/lib/types";
import { getDefaultSlideTheme } from "./theme";
import { normalizeSlideDeck, normalizeSlideDeckWithWarnings } from "./normalize";

export const SLIDE_PLANNER_VERSION = "2026-03-08.1";
export const PPTX_RENDERER_VERSION = "2026-03-08.1";

export const DEFAULT_SLIDE_THEME: SlideTheme = getDefaultSlideTheme();

export const DEFAULT_SLIDE_EXPORT_OPTIONS: SlideExportOptions = {
  includeSpeakerNotes: true,
  defaultLayout: "title-body",
};

export interface SessionRecord {
  id: string;
  title: string;
  artifactType?: ArtifactType | null;
  documentContent: string;
  sourceMarkdown?: string | null;
  slideDeckJson?: string | null;
  themeJson?: string | null;
  exportOptionsJson?: string | null;
  plannerVersion?: string | null;
  rendererVersion?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewSessionPayload {
  title: string;
  artifactType: ArtifactType;
  documentContent: string;
  sourceMarkdown: string | null;
  slideDeckJson: string | null;
  themeJson: string | null;
  exportOptionsJson: string | null;
  plannerVersion: string | null;
  rendererVersion: string | null;
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function trimSessionTitle(title?: string | null): string {
  const normalized = title?.trim();
  return normalized || "Untitled";
}

function inferPresentationTopic(title: string): string {
  return trimSessionTitle(title).replace(/^セッション\s*/, "").trim() || "プレゼン";
}

export function buildInitialSlidesMarkdown(title?: string | null): string {
  const topic = inferPresentationTopic(title ?? "プレゼン");
  return `# ${topic}

## 発表の目的
- 何を提案・共有したいのかを明確にする

## 想定読者
- 誰に向けた資料かを具体化する

## メッセージ
- 最も伝えたい主張を3点以内で整理する

## 次のアクション
- この資料を見た相手に取ってほしい行動を書く`;
}

export function normalizeArtifactType(value?: string | null): ArtifactType {
  return value === "slides" ? "slides" : "document";
}

export function normalizeSlideTheme(theme?: SlideTheme | null): SlideTheme {
  const merged = theme ?? DEFAULT_SLIDE_THEME;
  return {
    presetId: merged.presetId || DEFAULT_SLIDE_THEME.presetId,
    tokens: {
      ...DEFAULT_SLIDE_THEME.tokens,
      ...(merged.tokens ?? {}),
    },
  };
}

export function normalizeSlideExportOptions(
  options?: SlideExportOptions | null
): SlideExportOptions {
  return {
    ...DEFAULT_SLIDE_EXPORT_OPTIONS,
    ...(options ?? {}),
  };
}

export function serializeSlideDeck(deck?: SlideDeck | null): string | null {
  const normalized = deck ? normalizeSlideDeck(deck) : null;
  return normalized ? JSON.stringify(normalized) : null;
}

export function serializeSlideTheme(theme?: SlideTheme | null): string | null {
  return JSON.stringify(normalizeSlideTheme(theme ?? DEFAULT_SLIDE_THEME));
}

export function serializeSlideExportOptions(
  options?: SlideExportOptions | null
): string | null {
  return JSON.stringify(
    normalizeSlideExportOptions(options ?? DEFAULT_SLIDE_EXPORT_OPTIONS)
  );
}

export function toSession(record: SessionRecord): Session {
  const artifactType = normalizeArtifactType(record.artifactType);
  const sourceMarkdown =
    artifactType === "slides"
      ? (record.sourceMarkdown ?? record.documentContent ?? "")
      : null;
  const normalizedDeck = normalizeSlideDeckWithWarnings(
    safeJsonParse<SlideDeck | null>(record.slideDeckJson, null)
  );

  return {
    id: record.id,
    title: trimSessionTitle(record.title),
    artifactType,
    documentContent: record.documentContent ?? "",
    sourceMarkdown,
    slideDeck: normalizedDeck.deck,
    slideDeckWarnings: normalizedDeck.warnings,
    theme:
      artifactType === "slides"
        ? normalizeSlideTheme(safeJsonParse(record.themeJson, DEFAULT_SLIDE_THEME))
        : null,
    exportOptions:
      artifactType === "slides"
        ? normalizeSlideExportOptions(
            safeJsonParse(record.exportOptionsJson, DEFAULT_SLIDE_EXPORT_OPTIONS)
          )
        : null,
    plannerVersion: record.plannerVersion ?? null,
    rendererVersion: record.rendererVersion ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function buildNewSessionPayload(
  title: string,
  artifactType: ArtifactType
): NewSessionPayload {
  const normalizedTitle = trimSessionTitle(title);
  if (artifactType === "slides") {
    const sourceMarkdown = buildInitialSlidesMarkdown(normalizedTitle);
    return {
      title: normalizedTitle,
      artifactType,
      documentContent: sourceMarkdown,
      sourceMarkdown,
      slideDeckJson: null,
      themeJson: serializeSlideTheme(DEFAULT_SLIDE_THEME),
      exportOptionsJson: serializeSlideExportOptions(DEFAULT_SLIDE_EXPORT_OPTIONS),
      plannerVersion: null,
      rendererVersion: null,
    };
  }

  return {
    title: normalizedTitle,
    artifactType: "document",
    documentContent: "",
    sourceMarkdown: null,
    slideDeckJson: null,
    themeJson: null,
    exportOptionsJson: null,
    plannerVersion: null,
    rendererVersion: null,
  };
}
