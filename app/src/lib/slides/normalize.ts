import { v4 as uuid } from "uuid";
import type {
  SlideDeck,
  SlideSpec,
  SlideVisual,
  SlideVisualImage,
  SlideVisualTable,
} from "@/lib/types";

const VALID_KINDS = new Set<SlideSpec["kind"]>([
  "title",
  "section",
  "content",
  "summary",
]);

const VALID_LAYOUTS = new Set([
  "title-slide",
  "title-body",
  "two-column",
  "four-panel",
  "flow-horizontal",
  "flow-vertical",
  "section-divider",
  "summary-grid",
]);

export interface SlideDeckNormalizationResult {
  deck: SlideDeck | null;
  warnings: string[];
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item).trim())
    .filter((item) => item.length > 0);
}

function normalizeTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) =>
      Array.isArray(row) ? row.map((cell) => normalizeString(cell)) : []
    )
    .filter((row) => row.some((cell) => cell.trim().length > 0));
}

function normalizeImageVisual(
  value: unknown,
  warnings: string[],
  slideTitle: string
): SlideVisualImage | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const src = normalizeString(obj.src).trim();
  if (!src) {
    warnings.push(`スライド「${slideTitle}」の image visual を src 欠落で破棄`);
    return null;
  }
  return {
    type: "image",
    src,
    assetPath:
      normalizeString(obj.assetPath || undefined, "").trim() || undefined,
    alt: normalizeString(obj.alt || undefined, "").trim() || undefined,
    caption: normalizeString(obj.caption || undefined, "").trim() || undefined,
  };
}

function normalizeTableVisual(
  value: unknown,
  warnings: string[],
  slideTitle: string
): SlideVisualTable | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const rows = normalizeTableRows(obj.rows);
  if (rows.length === 0) {
    warnings.push(`スライド「${slideTitle}」の table visual を空データで破棄`);
    return null;
  }
  return {
    type: "table",
    rows,
    caption: normalizeString(obj.caption || undefined, "").trim() || undefined,
  };
}

export function normalizeSlideVisuals(
  value: unknown,
  warnings: string[] = [],
  slideTitle = "Untitled"
): SlideVisual[] {
  if (!Array.isArray(value)) return [];
  const visuals: SlideVisual[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const type = (item as Record<string, unknown>).type;
    if (type === "image") {
      const normalized = normalizeImageVisual(item, warnings, slideTitle);
      if (normalized) visuals.push(normalized);
      continue;
    }
    if (type === "table") {
      const normalized = normalizeTableVisual(item, warnings, slideTitle);
      if (normalized) visuals.push(normalized);
      continue;
    }
    warnings.push(`スライド「${slideTitle}」の未知 visual type を破棄`);
  }

  return visuals;
}

function defaultLayoutForKind(kind: SlideSpec["kind"]): string {
  switch (kind) {
    case "title":
      return "title-slide";
    case "section":
      return "section-divider";
    case "summary":
      return "summary-grid";
    default:
      return "title-body";
  }
}

export function normalizeSlideSpec(value: unknown, index = 0): SlideSpec {
  return normalizeSlideSpecWithWarnings(value, index).slide;
}

export function normalizeSlideSpecWithWarnings(
  value: unknown,
  index = 0
): { slide: SlideSpec; warnings: string[] } {
  const obj =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const warnings: string[] = [];

  const rawKind = normalizeString(obj.kind, "content");
  const kind: SlideSpec["kind"] = VALID_KINDS.has(rawKind as SlideSpec["kind"])
    ? (rawKind as SlideSpec["kind"])
    : ((warnings.push(`Slide ${index + 1} の kind "${rawKind}" を "content" に補正`),
        "content") as SlideSpec["kind"]);

  const rawLayout = normalizeString(obj.layout, "");
  const title = normalizeString(obj.title, "").trim() || `Slide ${index + 1}`;
  if (!normalizeString(obj.title, "").trim()) {
    warnings.push(`Slide ${index + 1} の title が空だったため補完`);
  }

  const id = normalizeString(obj.id, "").trim() || uuid();
  if (!normalizeString(obj.id, "").trim()) {
    warnings.push(`スライド「${title}」の id を自動採番`);
  }

  const layout = VALID_LAYOUTS.has(rawLayout)
    ? rawLayout
    : ((rawLayout &&
        warnings.push(
          `スライド「${title}」の layout "${rawLayout}" を既定値へ補正`
        ),
      defaultLayoutForKind(kind)) as string);

  const bullets = normalizeStringArray(obj.bullets);
  const body = normalizeString(obj.body, "").trim();

  return {
    slide: {
      id,
      kind,
      title,
      bullets,
      body: body || undefined,
      speakerNotes:
        normalizeString(obj.speakerNotes, "").trim() || undefined,
      visuals: normalizeSlideVisuals(obj.visuals, warnings, title),
      layout,
      themeVariant:
        normalizeString(obj.themeVariant, "").trim() || "default",
    },
    warnings,
  };
}

export function normalizeSlideDeck(value: unknown): SlideDeck | null {
  return normalizeSlideDeckWithWarnings(value).deck;
}

export function normalizeSlideDeckWithWarnings(
  value: unknown
): SlideDeckNormalizationResult {
  if (!value || typeof value !== "object") {
    return { deck: null, warnings: [] };
  }

  const obj = value as Record<string, unknown>;
  const rawSlides = Array.isArray(obj.slides) ? obj.slides : [];
  const normalizedSlides = rawSlides.map((slide, index) =>
    normalizeSlideSpecWithWarnings(slide, index)
  );
  const slides = normalizedSlides.map((item) => item.slide);
  const warnings = normalizedSlides.flatMap((item) => item.warnings);
  const title = normalizeString(obj.title, "").trim();

  if (!title && slides.length === 0) {
    return { deck: null, warnings };
  }

  return {
    deck: {
      title: title || "Untitled Deck",
      subtitle: normalizeString(obj.subtitle, "").trim() || undefined,
      objective: normalizeString(obj.objective, "").trim() || undefined,
      audience: normalizeString(obj.audience, "").trim() || undefined,
      slides,
    },
    warnings,
  };
}
