import type { SlideSpec } from "@/lib/types";

const KIND_LABELS: Record<SlideSpec["kind"], string> = {
  title: "表紙",
  section: "区切り",
  content: "本文",
  summary: "まとめ",
};

const LAYOUT_LABELS: Record<string, string> = {
  "title-slide": "タイトルスライド",
  "title-body": "タイトル + 本文",
  "two-column": "左右2カラム",
  "four-panel": "4分割パネル",
  "flow-horizontal": "横フロー",
  "flow-vertical": "縦フロー",
  "section-divider": "セクション区切り",
  "summary-grid": "まとめグリッド",
};

export const SLIDE_LAYOUT_OPTIONS = [
  "title-slide",
  "title-body",
  "two-column",
  "four-panel",
  "flow-horizontal",
  "flow-vertical",
  "section-divider",
  "summary-grid",
] as const;

export function getSlideKindLabel(kind: SlideSpec["kind"]): string {
  return KIND_LABELS[kind] ?? kind;
}

export function getSlideLayoutLabel(layout: string): string {
  return LAYOUT_LABELS[layout] ?? layout;
}
