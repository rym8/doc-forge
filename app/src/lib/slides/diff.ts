import type {
  SlideDeck,
  SlideExportOptions,
  SlideSpec,
  SlideTheme,
} from "@/lib/types";
import { getSlideKindLabel, getSlideLayoutLabel } from "./display";

export interface DiffSection {
  title: string;
  variant?: "change" | "warning";
  items: DiffItem[];
}

export interface DiffItem {
  summary: string;
  before?: string;
  after?: string;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function summarizeSlideChange(before: SlideSpec, after: SlideSpec): DiffItem[] {
  const changes: DiffItem[] = [];
  const slideLabel = `スライド「${after.title || before.title || "Untitled"}」`;

  if (before.title !== after.title) {
    changes.push({
      summary: `${slideLabel} のタイトルを更新`,
      before: before.title,
      after: after.title,
    });
  }
  if (before.kind !== after.kind) {
    changes.push({
      summary: `${slideLabel} の種別を変更`,
      before: getSlideKindLabel(before.kind),
      after: getSlideKindLabel(after.kind),
    });
  }
  if (before.layout !== after.layout) {
    changes.push({
      summary: `${slideLabel} のレイアウトを変更`,
      before: getSlideLayoutLabel(before.layout),
      after: getSlideLayoutLabel(after.layout),
    });
  }
  if (stableStringify(before.bullets) !== stableStringify(after.bullets)) {
    changes.push({
      summary: `${slideLabel} の箇条書きを更新`,
      before: before.bullets.join(" / "),
      after: after.bullets.join(" / "),
    });
  }
  if ((before.body ?? "") !== (after.body ?? "")) {
    changes.push({
      summary: `${slideLabel} の本文を更新`,
      before: before.body ?? "",
      after: after.body ?? "",
    });
  }
  if ((before.speakerNotes ?? "") !== (after.speakerNotes ?? "")) {
    changes.push({
      summary: `${slideLabel} の speaker notes を更新`,
      before: before.speakerNotes ?? "",
      after: after.speakerNotes ?? "",
    });
  }
  if (stableStringify(before.visuals) !== stableStringify(after.visuals)) {
    changes.push({
      summary: `${slideLabel} の visual を更新`,
      before: `${before.visuals.length} 件`,
      after: `${after.visuals.length} 件`,
    });
  }

  return changes;
}

function summarizeDeckDiff(base: SlideDeck | null, draft: SlideDeck | null): DiffItem[] {
  if (!draft) return [];
  if (!base) {
    return [{ summary: "新しい slide deck を作成" }];
  }

  const items: DiffItem[] = [];
  if (base.title !== draft.title) {
    items.push({
      summary: "デッキタイトルを変更",
      before: base.title,
      after: draft.title,
    });
  }
  if (base.slides.length !== draft.slides.length) {
    items.push({
      summary: "スライド枚数を変更",
      before: String(base.slides.length),
      after: String(draft.slides.length),
    });
  }

  const baseIds = base.slides.map((slide) => slide.id);
  const draftIds = draft.slides.map((slide) => slide.id);
  if (stableStringify(baseIds) !== stableStringify(draftIds)) {
    items.push({ summary: "スライド順序を変更" });
  }

  const baseMap = new Map(base.slides.map((slide) => [slide.id, slide]));
  const draftMap = new Map(draft.slides.map((slide) => [slide.id, slide]));

  const added = draft.slides.filter((slide) => !baseMap.has(slide.id));
  const removed = base.slides.filter((slide) => !draftMap.has(slide.id));

  for (const slide of added) {
    items.push({
      summary: `スライド「${slide.title || "Untitled"}」を追加`,
    });
  }
  for (const slide of removed) {
    items.push({
      summary: `スライド「${slide.title || "Untitled"}」を削除`,
    });
  }

  for (const slide of draft.slides) {
    const before = baseMap.get(slide.id);
    if (!before) continue;
    items.push(...summarizeSlideChange(before, slide));
  }

  return items;
}

function summarizeThemeDiff(base: SlideTheme | null, draft: SlideTheme | null): DiffItem[] {
  if (!draft) return [];
  if (!base) {
    return [{ summary: "新しい theme 設定を作成" }];
  }

  const items: DiffItem[] = [];
  if (base.presetId !== draft.presetId) {
    items.push({
      summary: "テーマ preset を変更",
      before: base.presetId,
      after: draft.presetId,
    });
  }

  for (const [key, value] of Object.entries(draft.tokens)) {
    const before = base.tokens[key as keyof SlideTheme["tokens"]];
    if (before !== value) {
      items.push({
        summary: `theme token ${key} を更新`,
        before: String(before),
        after: String(value),
      });
    }
  }
  return items;
}

function summarizeExportOptionsDiff(
  base: SlideExportOptions | null,
  draft: SlideExportOptions | null
): DiffItem[] {
  if (!draft) return [];
  if (!base) {
    return [{ summary: "新しい export option を作成" }];
  }

  const items: DiffItem[] = [];
  if (base.includeSpeakerNotes !== draft.includeSpeakerNotes) {
    items.push({
      summary: "speaker notes 出力設定を変更",
      before: base.includeSpeakerNotes ? "ON" : "OFF",
      after: draft.includeSpeakerNotes ? "ON" : "OFF",
    });
  }
  if (base.defaultLayout !== draft.defaultLayout) {
    items.push({
      summary: "default layout を変更",
      before: base.defaultLayout,
      after: draft.defaultLayout,
    });
  }
  return items;
}

export function buildSlidesDiffSections(input: {
  baseDeck: SlideDeck | null;
  draftDeck: SlideDeck | null;
  baseTheme: SlideTheme | null;
  draftTheme: SlideTheme | null;
  baseExportOptions: SlideExportOptions | null;
  draftExportOptions: SlideExportOptions | null;
  warnings?: string[];
}): DiffSection[] {
  const sections: DiffSection[] = [];
  const deckItems = summarizeDeckDiff(input.baseDeck, input.draftDeck);
  const themeItems = summarizeThemeDiff(input.baseTheme, input.draftTheme);
  const exportItems = summarizeExportOptionsDiff(
    input.baseExportOptions,
    input.draftExportOptions
  );
  const warningItems = (input.warnings ?? []).map((warning) => ({
    summary: warning,
  }));

  if (warningItems.length > 0) {
    sections.push({
      title: "補正ログ",
      variant: "warning",
      items: warningItems,
    });
  }

  if (deckItems.length > 0) {
    sections.push({ title: "スライド", items: deckItems });
  }
  if (themeItems.length > 0) {
    sections.push({ title: "テーマ", items: themeItems });
  }
  if (exportItems.length > 0) {
    sections.push({ title: "出力設定", items: exportItems });
  }

  return sections;
}
