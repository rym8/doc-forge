"use client";

import type {
  SlideSpec,
  SlideTheme,
  SlideVisualImage,
  SlideVisualTable,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface SlidePreviewProps {
  slide: SlideSpec | null;
  theme: SlideTheme | null;
  showSpeakerNotes?: boolean;
  className?: string;
}

export function SlidePreview({
  slide,
  theme,
  showSpeakerNotes = false,
  className,
}: SlidePreviewProps) {
  const tokens = theme?.tokens;
  const isTitle = slide?.kind === "title";
  const isSection = slide?.kind === "section";
  const isSummary = slide?.kind === "summary";
  const isTwoColumn = slide?.layout === "two-column";
  const isFourPanel = slide?.layout === "four-panel";
  const isFlowHorizontal = slide?.layout === "flow-horizontal";
  const isFlowVertical = slide?.layout === "flow-vertical";
  const primaryImage = slide?.visuals.find(
    (visual): visual is SlideVisualImage => visual.type === "image"
  );
  const primaryTable = slide?.visuals.find(
    (visual): visual is SlideVisualTable => visual.type === "table"
  );
  const hasImage = Boolean(primaryImage?.src.trim());
  const hasTable = Boolean(primaryTable?.rows.length);

  const bg = tokens?.backgroundColor || "#F7F4EE";
  const fg = tokens?.textColor || "#1F2937";
  const accent = tokens?.accentColor || "#C2410C";
  const titleFont = tokens?.titleFontFamily || "Aptos Display";
  const bodyFont = tokens?.bodyFontFamily || "Aptos";

  // テーブル用の半透明背景（テーマの背景色から計算）
  const tableBg = bg + "CC"; // 80% opacity hex

  if (!slide) {
    return (
      <div
        className={cn(
          "flex aspect-[16/9] items-center justify-center rounded-xl border bg-muted/30 text-sm text-muted-foreground",
          className
        )}
      >
        スライドを選択してください
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="aspect-[16/9] overflow-hidden rounded-xl border shadow-sm"
        style={{ backgroundColor: bg, color: fg }}
      >
        {/* ヘッダー帯 */}
        <div
          className="flex items-center justify-between px-6 py-1.5"
          style={{ backgroundColor: accent, color: "#fff" }}
        >
          <span className="text-[10px] font-semibold tracking-widest uppercase truncate opacity-90">
            {tokens?.headerText || "Doc Forge"}
          </span>
        </div>

        <div
          className={cn(
            "relative flex h-[calc(100%-2rem)] flex-col px-8 py-4",
            isSection && "justify-center",
            isTitle && "justify-center items-center text-center"
          )}
        >
          {/* セクションスライド: 左アクセントボーダー */}
          {isSection && (
            <div
              className="absolute left-0 top-0 h-full w-1"
              style={{ backgroundColor: accent }}
            />
          )}

          {/* タイトル */}
          <div
            className={cn(
              "mb-3 font-semibold leading-tight",
              isSection && "max-w-[80%] pl-4",
              isTitle && "max-w-[85%]"
            )}
            style={{
              fontFamily: titleFont,
              fontSize: isTitle ? "2.2rem" : isSection ? "1.9rem" : "1.45rem",
              color: isSection ? accent : fg,
            }}
          >
            {slide.title}
          </div>

          {/* タイトルスライドの装飾下線 */}
          {isTitle && (
            <div
              className="mx-auto mb-4 h-0.5 w-16"
              style={{ backgroundColor: accent }}
            />
          )}

          {slide.body && !isSection ? (
            <p
              className={cn(
                "mb-3 whitespace-pre-wrap text-sm leading-6",
                hasImage && !hasTable && "max-w-[52%]"
              )}
              style={{ fontFamily: bodyFont }}
            >
              {slide.body}
            </p>
          ) : null}

          {isSection && slide.body ? (
            <p
              className="max-w-[70%] whitespace-pre-wrap pl-4 text-base leading-7 opacity-80"
              style={{ fontFamily: bodyFont }}
            >
              {slide.body}
            </p>
          ) : null}

          {slide.bullets.length > 0 ? (
            isFlowHorizontal ? (
              <div className="grid grid-cols-4 gap-2">
                {slide.bullets.slice(0, 4).map((bullet, index) => (
                  <div
                    key={`${slide.id}-flow-h-${index}`}
                    className="rounded-lg border px-3 py-3 text-center text-sm"
                    style={{ borderColor: accent + "40" }}
                  >
                    <div
                      className="mb-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold mx-auto"
                      style={{ backgroundColor: accent, color: "#fff" }}
                    >
                      {index + 1}
                    </div>
                    {bullet}
                  </div>
                ))}
              </div>
            ) : isFlowVertical ? (
              <div className="space-y-2">
                {slide.bullets.map((bullet, index) => (
                  <div
                    key={`${slide.id}-flow-v-${index}`}
                    className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: accent + "40" }}
                  >
                    <div
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: accent, color: "#fff" }}
                    >
                      {index + 1}
                    </div>
                    {bullet}
                  </div>
                ))}
              </div>
            ) : isFourPanel ? (
              <div className="grid grid-cols-2 gap-2">
                {slide.bullets.slice(0, 4).map((bullet, index) => (
                  <div
                    key={`${slide.id}-panel-${index}`}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: accent + "40", borderLeftWidth: "3px", borderLeftColor: accent }}
                  >
                    {bullet}
                  </div>
                ))}
              </div>
            ) : isSummary ? (
              <div className="grid grid-cols-2 gap-2">
                {slide.bullets.map((bullet, index) => (
                  <div
                    key={`${slide.id}-bullet-${index}`}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: accent + "40" }}
                  >
                    {bullet}
                  </div>
                ))}
              </div>
            ) : isTwoColumn ? (
              <div className="grid grid-cols-2 gap-4">
                {[
                  slide.bullets.slice(0, Math.ceil(slide.bullets.length / 2)),
                  slide.bullets.slice(Math.ceil(slide.bullets.length / 2)),
                ].map((column, columnIndex) => (
                  <div key={`${slide.id}-col-${columnIndex}`} className="space-y-2">
                    {column.map((bullet, index) => (
                      <div
                        key={`${slide.id}-two-col-${columnIndex}-${index}`}
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: accent + "40" }}
                      >
                        {bullet}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <ul
                className={cn(
                  "space-y-1.5 pl-4 text-sm",
                  hasImage && !hasTable && "max-w-[52%]"
                )}
                style={{ fontFamily: bodyFont }}
              >
                {slide.bullets.map((bullet, index) => (
                  <li
                    key={`${slide.id}-bullet-${index}`}
                    className="flex items-start gap-2"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {hasTable ? (
            <div
              className="mt-3 overflow-hidden rounded-xl border"
              style={{ borderColor: accent + "30" }}
            >
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {primaryTable?.rows.map((row, rowIndex) => (
                    <tr
                      key={`table-row-${rowIndex}`}
                      className="border-b last:border-b-0"
                      style={{
                        backgroundColor: rowIndex === 0 ? accent + "18" : tableBg,
                      }}
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`table-cell-${rowIndex}-${cellIndex}`}
                          className={cn(
                            "border-r px-3 py-2 last:border-r-0",
                            rowIndex === 0 && "font-semibold"
                          )}
                          style={{ borderColor: accent + "20" }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {primaryTable?.caption ? (
                <div className="border-t px-3 py-1.5 text-xs opacity-70">
                  {primaryTable.caption}
                </div>
              ) : null}
            </div>
          ) : null}

          {hasImage && !hasTable ? (
            <div className="absolute right-6 top-16 w-[34%]">
              <div
                className="overflow-hidden rounded-xl border"
                style={{ borderColor: accent + "30" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={primaryImage?.src}
                  alt={primaryImage?.alt || primaryImage?.caption || slide.title}
                  className="h-48 w-full object-cover"
                />
              </div>
              {primaryImage?.caption ? (
                <div className="mt-1.5 text-xs opacity-70">{primaryImage.caption}</div>
              ) : null}
            </div>
          ) : null}

          {/* フッター */}
          <div className="mt-auto pt-3 text-[10px] opacity-60">
            {tokens?.footerText || ""}
          </div>
        </div>
      </div>

      {/* 発表者ノート（プレビュー外に表示） */}
      {showSpeakerNotes && slide.speakerNotes ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            発表者ノート
          </div>
          <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/80">
            {slide.speakerNotes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
