import { v4 as uuid } from "uuid";
import type {
  SlideDeck,
  SlideSpec,
  SlideVisual,
  SlideVisualImage,
  SlideVisualTable,
} from "@/lib/types";
import { SLIDE_PLANNER_VERSION } from "./session";

export interface SlidePlanOptions {
  maxBulletsPerSlide?: number;
  generateTitleSlide?: boolean;
}

export interface SlidePlanResult {
  deck: SlideDeck;
  plannerVersion: string;
}

interface DraftSection {
  heading: string;
  bullets: string[];
  body: string;
  visuals: SlideVisual[];
}

const DEFAULT_OPTIONS: Required<SlidePlanOptions> = {
  maxBulletsPerSlide: 5,
  generateTitleSlide: true,
};

function stripMarkdownMarkup(value: string): string {
  return value
    .replace(/[*_`>#]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

function toDeckTitle(markdown: string, fallbackTitle: string): string {
  const firstH1 = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (firstH1) return firstH1;

  const firstNonEmptyLine = markdown
    .split("\n")
    .map((line) => stripMarkdownMarkup(line))
    .find((line) => line.length > 0);

  return firstNonEmptyLine || fallbackTitle || "Untitled Deck";
}

function splitIntoSections(markdown: string, fallbackTitle: string): DraftSection[] {
  const lines = markdown.split("\n");
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      if (!current) {
        current = { heading: h1Match[1].trim(), lines: [] };
      }
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      if (current) sections.push(current);
      current = { heading: h2Match[1].trim(), lines: [] };
      continue;
    }

    if (!current) {
      current = { heading: fallbackTitle, lines: [] };
    }

    current.lines.push(rawLine);
  }

  if (current) sections.push(current);

  return sections
    .map(({ heading, lines }) => {
      const bullets: string[] = [];
      const bodyLines: string[] = [];
      const visuals: SlideVisual[] = [];

      function isTableLine(value: string): boolean {
        return value.includes("|") && value.split("|").filter((cell) => cell.trim()).length >= 2;
      }

      function isDelimiterRow(cells: string[]): boolean {
        return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
      }

      function parseTableRows(blockLines: string[]): string[][] {
        const parsed = blockLines
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

        if (parsed.length >= 2 && isDelimiterRow(parsed[1])) {
          parsed.splice(1, 1);
        }
        return parsed;
      }

      for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const trimmed = rawLine.trim();
        if (!trimmed) {
          bodyLines.push("");
          continue;
        }

        const imageMatches = Array.from(trimmed.matchAll(/!\[(.*?)\]\((.+?)\)/g));
        if (imageMatches.length > 0) {
          visuals.push(
            ...imageMatches.map(
              (match) =>
                ({
                  type: "image",
                  alt: match[1]?.trim() || undefined,
                  src: match[2]?.trim() || "",
                }) satisfies SlideVisualImage
            )
          );
          continue;
        }

        if (isTableLine(trimmed)) {
          const tableBlock = [trimmed];
          let cursor = index + 1;
          while (cursor < lines.length && isTableLine(lines[cursor].trim())) {
            tableBlock.push(lines[cursor].trim());
            cursor += 1;
          }
          const rows = parseTableRows(tableBlock);
          if (rows.length > 0) {
            visuals.push({
              type: "table",
              rows,
            } satisfies SlideVisualTable);
            index = cursor - 1;
            continue;
          }
        }

        const listMatch = trimmed.match(/^([-*+]|\d+\.)\s+(.+)$/);
        if (listMatch) {
          bullets.push(stripMarkdownMarkup(listMatch[2]));
        } else {
          bodyLines.push(trimmed);
        }
      }

      if (
        bullets.length === 0 &&
        /(論点|要点|ポイント|項目)/.test(heading)
      ) {
        const fallbackBullets = bodyLines
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) =>
            stripMarkdownMarkup(line.replace(/^([-*+]|\d+\.)\s+/, ""))
          )
          .filter(Boolean);
        if (fallbackBullets.length >= 3) {
          bullets.push(...fallbackBullets);
          bodyLines.length = 0;
        }
      }

      const body = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      return {
        heading: stripMarkdownMarkup(heading) || fallbackTitle,
        bullets,
        body,
        visuals,
      };
    })
    .filter(
      (section) =>
        section.heading ||
        section.bullets.length > 0 ||
        section.body ||
        section.visuals.length > 0
    );
}

function chunkBullets(bullets: string[], size: number): string[][] {
  if (bullets.length === 0) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < bullets.length; index += size) {
    chunks.push(bullets.slice(index, index + size));
  }
  return chunks;
}

function looksLikeFlow(section: DraftSection): boolean {
  const text = `${section.heading}\n${section.body}\n${section.bullets.join("\n")}`;
  if (/(フロー|流れ|ステップ|手順|プロセス)/.test(text)) return true;
  const numberedBullets = section.bullets.filter((bullet) =>
    /^(\d+[\).]|step\s*\d+|ステップ\d+)/i.test(bullet)
  );
  return numberedBullets.length >= Math.min(3, section.bullets.length);
}

function looksLikeComparison(section: DraftSection): boolean {
  const text = `${section.heading}\n${section.body}`;
  return /(比較|対比|A\/B|ABテスト|before|after|現状と理想)/i.test(text);
}

function looksLikeSummary(section: DraftSection): boolean {
  const text = `${section.heading}\n${section.body}`;
  return /(まとめ|要約|結論|サマリー)/.test(text);
}

function chooseKind(section: DraftSection): SlideSpec["kind"] {
  if (looksLikeSummary(section)) return "summary";
  if (/^(章|セクション|Section)/i.test(section.heading)) return "section";
  return "content";
}

function chooseLayout(section: DraftSection, bulletCount: number): string {
  if (looksLikeFlow(section)) {
    return bulletCount <= 4 ? "flow-horizontal" : "flow-vertical";
  }
  if (looksLikeComparison(section) || bulletCount === 2) {
    return "two-column";
  }
  if (/(論点|要点|ポイント|項目)/.test(section.heading)) {
    return "four-panel";
  }
  if (bulletCount >= 3 && bulletCount <= 4) {
    return "four-panel";
  }
  if (looksLikeSummary(section) && bulletCount > 0) {
    return "summary-grid";
  }
  return "title-body";
}

function buildTitleSlide(deckTitle: string): SlideSpec {
  return {
    id: uuid(),
    kind: "title",
    title: deckTitle,
    body: "Doc Forge が生成したスライド草案",
    speakerNotes: `${deckTitle} の全体像を最初に共有する。`,
    bullets: [],
    visuals: [],
    layout: "title-slide",
    themeVariant: "default",
  };
}

function buildContentSlides(
  section: DraftSection,
  maxBulletsPerSlide: number
): SlideSpec[] {
  const bulletChunks = chunkBullets(section.bullets, maxBulletsPerSlide);
  const kind = chooseKind(section);

  if (bulletChunks.length === 0) {
    const layout =
      kind === "section" ? "section-divider" : chooseLayout(section, 0);
    return [
      {
        id: uuid(),
        kind,
        title: section.heading,
        bullets: [],
        body: section.body || "内容を追記してください。",
        speakerNotes: `${section.heading} の要点を補足する。`,
        visuals: section.visuals,
        layout,
        themeVariant: "default",
      },
    ];
  }

  return bulletChunks.map((chunk, index) => ({
    id: uuid(),
    kind,
    title:
      bulletChunks.length === 1
        ? section.heading
        : `${section.heading} (${index + 1}/${bulletChunks.length})`,
    bullets: chunk,
    body: index === 0 ? section.body : "",
    speakerNotes: `${section.heading} の論点を ${chunk.length} 点で説明する。`,
    visuals: index === 0 ? section.visuals : [],
    layout:
      index === 0
        ? chooseLayout(section, chunk.length)
        : chooseLayout(
            { ...section, bullets: chunk, visuals: [], body: "" },
            chunk.length
          ),
    themeVariant: "default",
  }));
}

export function planSlideDeckFromMarkdown(
  markdown: string,
  fallbackTitle: string,
  options?: SlidePlanOptions
): SlidePlanResult {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  const deckTitle = toDeckTitle(markdown, fallbackTitle);
  const sections = splitIntoSections(markdown, deckTitle);
  const slides: SlideSpec[] = [];

  if (resolvedOptions.generateTitleSlide) {
    slides.push(buildTitleSlide(deckTitle));
  }

  for (const section of sections) {
    slides.push(...buildContentSlides(section, resolvedOptions.maxBulletsPerSlide));
  }

  if (slides.length === 0) {
    slides.push(buildTitleSlide(deckTitle));
  }

  return {
    deck: {
      title: deckTitle,
      slides,
    },
    plannerVersion: SLIDE_PLANNER_VERSION,
  };
}
