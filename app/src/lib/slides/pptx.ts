import fs from "fs";
import path from "path";
import PptxGenJS from "pptxgenjs";
import type {
  SlideDeck,
  SlideExportOptions,
  SlideSpec,
  SlideTheme,
  SlideVisualImage,
  SlideVisualTable,
} from "@/lib/types";
import {
  DEFAULT_SLIDE_EXPORT_OPTIONS,
  DEFAULT_SLIDE_THEME,
  PPTX_RENDERER_VERSION,
  normalizeSlideExportOptions,
  normalizeSlideTheme,
} from "./session";

const TITLE_MASTER = "DOC_FORGE_TITLE_MASTER";
const SECTION_MASTER = "DOC_FORGE_SECTION_MASTER";
const CONTENT_MASTER = "DOC_FORGE_CONTENT_MASTER";
const SUMMARY_MASTER = "DOC_FORGE_SUMMARY_MASTER";

function toPptxColor(value: string): string {
  return value.replace(/^#/, "");
}

function resolveLogoPath(logoPath: string): string | null {
  const trimmed = logoPath.trim();
  if (!trimmed) return null;
  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(process.cwd(), trimmed);
  return fs.existsSync(resolved) ? resolved : null;
}

function getPrimaryImage(spec: SlideSpec): SlideVisualImage | null {
  return (
    spec.visuals.find(
      (visual): visual is SlideVisualImage => visual.type === "image"
    ) ?? null
  );
}

function getPrimaryTable(spec: SlideSpec): SlideVisualTable | null {
  return (
    spec.visuals.find(
      (visual): visual is SlideVisualTable => visual.type === "table"
    ) ?? null
  );
}

function toPptxTableRows(rows: string[][]) {
  return rows.map((row, rowIndex) =>
    row.map((cell) => ({
      text: cell,
      options: rowIndex === 0 ? { bold: true } : undefined,
    }))
  );
}

function resolveImageSource(image: SlideVisualImage):
  | { path: string; data?: never }
  | { data: string; path?: never }
  | null {
  if (image.assetPath?.trim()) {
    const resolvedAssetPath = path.isAbsolute(image.assetPath)
      ? image.assetPath
      : path.join(process.cwd(), image.assetPath);
    if (fs.existsSync(resolvedAssetPath)) {
      return { path: resolvedAssetPath };
    }
  }

  const trimmed = image.src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) {
    return { data: trimmed.replace(/^data:/, "") };
  }
  if (/^[a-z]+\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
    return { data: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { path: trimmed };
  }

  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(process.cwd(), trimmed);
  if (fs.existsSync(resolved)) {
    return { path: resolved };
  }

  return { path: trimmed };
}

function defineMasters(pptx: PptxGenJS, theme: SlideTheme) {
  const logoPath = resolveLogoPath(theme.tokens.logoAssetPath);
  const sharedObjects: NonNullable<
    Parameters<PptxGenJS["defineSlideMaster"]>[0]["objects"]
  > = [
    {
      rect: {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.28,
        fill: { color: toPptxColor(theme.tokens.accentColor) },
        line: { color: toPptxColor(theme.tokens.accentColor) },
      },
    },
    {
      text: {
        text: theme.tokens.footerText,
        options: {
          x: 0.6,
          y: 7.05,
          w: 10.2,
          h: 0.2,
          fontFace: theme.tokens.bodyFontFamily,
          fontSize: 9,
          color: toPptxColor(theme.tokens.textColor),
          margin: 0,
        },
      },
    },
  ];

  if (theme.tokens.headerText.trim()) {
    sharedObjects.push({
      text: {
        text: theme.tokens.headerText,
        options: {
          x: 0.6,
          y: 0.32,
          w: 8,
          h: 0.2,
          fontFace: theme.tokens.bodyFontFamily,
          fontSize: 9,
          color: toPptxColor(theme.tokens.accentColor),
          bold: true,
          margin: 0,
        },
      },
    });
  }

  if (logoPath) {
    sharedObjects.push({
      image: {
        path: logoPath,
        x: 11.9,
        y: 0.35,
        w: 0.8,
        h: 0.4,
      },
    });
  }

  for (const masterName of [
    TITLE_MASTER,
    SECTION_MASTER,
    CONTENT_MASTER,
    SUMMARY_MASTER,
  ]) {
    pptx.defineSlideMaster({
      title: masterName,
      background: { color: toPptxColor(theme.tokens.backgroundColor) },
      objects: sharedObjects,
    });
  }
}

function addTitle(slide: PptxGenJS.Slide, spec: SlideSpec, theme: SlideTheme) {
  slide.addText(spec.title, {
    x: 0.7,
    y:
      spec.kind === "title"
        ? 1.2
        : spec.kind === "section"
          ? 2.15
          : 1,
    w: 11.7,
    h: 0.8,
    fontFace: theme.tokens.titleFontFamily,
    fontSize:
      spec.kind === "title" ? 28 : spec.kind === "section" ? 26 : 22,
    bold: true,
    color: toPptxColor(theme.tokens.textColor),
    margin: 0,
    fit: "shrink",
  });
}

function addBody(
  slide: PptxGenJS.Slide,
  spec: SlideSpec,
  theme: SlideTheme
) {
  const primaryImage = getPrimaryImage(spec);
  const primaryTable = getPrimaryTable(spec);
  const hasTable = Boolean(primaryTable?.rows.length);
  const hasImage = Boolean(primaryImage?.src.trim()) && !hasTable;
  if (spec.body?.trim()) {
    slide.addText(spec.body, {
      x: 0.85,
      y:
        spec.kind === "title"
          ? 2.35
          : spec.kind === "section"
            ? 3.15
            : 1.95,
      w: hasImage ? 5.8 : 11.5,
      h: spec.kind === "title" ? 0.8 : spec.kind === "section" ? 0.9 : 1.0,
      fontFace: theme.tokens.bodyFontFamily,
      fontSize: spec.kind === "title" ? 16 : spec.kind === "section" ? 18 : 14,
      color: toPptxColor(theme.tokens.textColor),
      margin: 0,
      valign: "top",
      fit: "shrink",
    });
  }

  if (spec.bullets.length > 0) {
    if (spec.layout === "flow-horizontal") {
      spec.bullets.slice(0, 4).forEach((bullet, index) => {
        slide.addText(`STEP ${index + 1}\n${bullet}`, {
          x: 0.8 + index * 3.1,
          y: 2.35,
          w: 2.7,
          h: 1.5,
          fontFace: theme.tokens.bodyFontFamily,
          fontSize: 14,
          color: toPptxColor(theme.tokens.textColor),
          margin: 0.12,
          align: "center",
          valign: "middle",
          fill: { color: "FFFFFF", transparency: 8 },
          line: { color: toPptxColor(theme.tokens.accentColor), pt: 1 },
          fit: "shrink",
        });
      });
    } else if (spec.layout === "flow-vertical") {
      spec.bullets.forEach((bullet, index) => {
        slide.addText(`STEP ${index + 1}\n${bullet}`, {
          x: 1.0,
          y: 2.1 + index * 1.05,
          w: 10.8,
          h: 0.9,
          fontFace: theme.tokens.bodyFontFamily,
          fontSize: 14,
          color: toPptxColor(theme.tokens.textColor),
          margin: 0.1,
          fill: { color: "FFFFFF", transparency: 8 },
          line: { color: toPptxColor(theme.tokens.accentColor), pt: 1 },
          fit: "shrink",
        });
      });
    } else if (spec.layout === "four-panel") {
      spec.bullets.slice(0, 4).forEach((bullet, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        slide.addText(bullet, {
          x: 0.9 + col * 5.7,
          y: 2.15 + row * 1.7,
          w: 5.1,
          h: 1.35,
          fontFace: theme.tokens.bodyFontFamily,
          fontSize: 15,
          color: toPptxColor(theme.tokens.textColor),
          margin: 0.12,
          fill: { color: "FFFFFF", transparency: 10 },
          line: { color: toPptxColor(theme.tokens.accentColor), pt: 1 },
          fit: "shrink",
        });
      });
    } else if (spec.kind === "summary" || spec.layout === "summary-grid") {
      const boxWidth = 5.3;
      const boxHeight = 1.1;
      spec.bullets.forEach((bullet, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        slide.addText(bullet, {
          x: 0.9 + col * 5.7,
          y: 2.0 + row * 1.35,
          w: boxWidth,
          h: boxHeight,
          fontFace: theme.tokens.bodyFontFamily,
          fontSize: 15,
          color: toPptxColor(theme.tokens.textColor),
          margin: 0.12,
          fill: { color: "FFFFFF", transparency: 15 },
          line: { color: toPptxColor(theme.tokens.accentColor), pt: 1 },
          valign: "middle",
          fit: "shrink",
        });
      });
    } else if (spec.layout === "two-column") {
      const midpoint = Math.ceil(spec.bullets.length / 2);
      [spec.bullets.slice(0, midpoint), spec.bullets.slice(midpoint)].forEach(
        (column, columnIndex) => {
          slide.addText(column.map((bullet) => `• ${bullet}`).join("\n"), {
            x: columnIndex === 0 ? 0.95 : 6.9,
            y: spec.body?.trim() ? 3 : 2.2,
            w: 5.1,
            h: 3.6,
            fontFace: theme.tokens.bodyFontFamily,
            fontSize: 15,
            color: toPptxColor(theme.tokens.textColor),
            breakLine: false,
            margin: 0,
            valign: "top",
            fit: "shrink",
          });
        }
      );
    } else {
      slide.addText(
        spec.bullets.map((bullet) => `• ${bullet}`).join("\n"),
        {
          x: 1.1,
          y: spec.body?.trim() ? 3 : 2.2,
          w: hasImage ? 5.6 : 11,
          h: 3.5,
          fontFace: theme.tokens.bodyFontFamily,
          fontSize: 16,
          color: toPptxColor(theme.tokens.textColor),
          breakLine: false,
          margin: 0,
          valign: "top",
          fit: "shrink",
        }
      );
    }
  }
}

function addVisuals(
  slide: PptxGenJS.Slide,
  spec: SlideSpec,
  theme: SlideTheme
) {
  const primaryTable = getPrimaryTable(spec);
  if (primaryTable?.rows.length) {
    slide.addTable(toPptxTableRows(primaryTable.rows), {
      x: 0.9,
      y: 4.5,
      w: 11.4,
      h: 1.9,
      fontFace: theme.tokens.bodyFontFamily,
      fontSize: 12,
      color: toPptxColor(theme.tokens.textColor),
      fill: { color: toPptxColor(theme.tokens.backgroundColor) },
      border: {
        type: "solid",
        color: toPptxColor(theme.tokens.accentColor),
        pt: 1,
      },
      margin: 0.08,
      rowH: 0.38,
      bold: false,
    });

    if (primaryTable.caption?.trim()) {
      slide.addText(primaryTable.caption.trim(), {
        x: 0.9,
        y: 6.55,
        w: 11.4,
        h: 0.25,
        fontFace: theme.tokens.bodyFontFamily,
        fontSize: 10,
        color: toPptxColor(theme.tokens.textColor),
        margin: 0,
        fit: "shrink",
      });
    }
    return;
  }

  const primaryImage = getPrimaryImage(spec);
  if (!primaryImage?.src.trim()) return;

  const source = resolveImageSource(primaryImage);
  if (!source) return;

  slide.addImage({
    ...source,
    x: 7.45,
    y: spec.kind === "title" ? 2.0 : 1.95,
    w: 4.95,
    h: 3.55,
  });

  if (primaryImage.caption?.trim()) {
    slide.addText(primaryImage.caption.trim(), {
      x: 7.45,
      y: 5.65,
      w: 4.95,
      h: 0.35,
      fontFace: theme.tokens.bodyFontFamily,
      fontSize: 10,
      color: toPptxColor(theme.tokens.textColor),
      align: "left",
      margin: 0,
      fit: "shrink",
    });
  }
}

function addSpeakerNotes(
  slide: PptxGenJS.Slide,
  spec: SlideSpec,
  options: SlideExportOptions
) {
  if (!options.includeSpeakerNotes) return;
  if (!spec.speakerNotes?.trim()) return;
  slide.addNotes(spec.speakerNotes.trim());
}

function renderSlide(
  pptx: PptxGenJS,
  spec: SlideSpec,
  theme: SlideTheme,
  options: SlideExportOptions
) {
  const masterName =
    spec.kind === "title"
      ? TITLE_MASTER
      : spec.kind === "section"
        ? SECTION_MASTER
        : spec.kind === "summary"
          ? SUMMARY_MASTER
          : CONTENT_MASTER;
  const slide = pptx.addSlide({
    masterName,
  });

  addTitle(slide, spec, theme);
  addBody(slide, spec, theme);
  addVisuals(slide, spec, theme);
  addSpeakerNotes(slide, spec, options);
}

function toNodeBuffer(content: string | ArrayBuffer | Blob | Uint8Array): Buffer {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }
  if (typeof content === "string") {
    return Buffer.from(content, "binary");
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content);
  }
  return Buffer.from([]);
}

export async function renderSlideDeckToPptxBuffer(input: {
  deck: SlideDeck;
  theme?: SlideTheme | null;
  exportOptions?: SlideExportOptions | null;
  author?: string;
}): Promise<{ buffer: Buffer; rendererVersion: string }> {
  const pptx = new PptxGenJS();
  const theme = normalizeSlideTheme(input.theme ?? DEFAULT_SLIDE_THEME);
  const exportOptions = normalizeSlideExportOptions(
    input.exportOptions ?? DEFAULT_SLIDE_EXPORT_OPTIONS
  );

  pptx.layout = theme.tokens.pageSize || "LAYOUT_WIDE";
  pptx.author = input.author ?? "Doc Forge";
  pptx.company = "Doc Forge";
  pptx.subject = input.deck.title;
  pptx.title = input.deck.title;

  defineMasters(pptx, theme);

  for (const spec of input.deck.slides) {
    renderSlide(pptx, spec, theme, exportOptions);
  }

  const content = await pptx.write({ outputType: "nodebuffer" });
  return {
    buffer: toNodeBuffer(content),
    rendererVersion: PPTX_RENDERER_VERSION,
  };
}
