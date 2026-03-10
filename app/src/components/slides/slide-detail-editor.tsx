"use client";

import { useRef, useState } from "react";
import type {
  SlideSpec,
  SlideVisualImage,
  SlideVisualTable,
} from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getSlideKindLabel,
  getSlideLayoutLabel,
  SLIDE_LAYOUT_OPTIONS,
} from "@/lib/slides/display";

interface SlideDetailEditorProps {
  slide: SlideSpec | null;
  onChange: (slide: SlideSpec) => void;
  onUploadImage?: (
    file: File
  ) => Promise<{ src: string; assetPath: string; fileName: string }>;
  onGenerateImage?: (
    prompt: string
  ) => Promise<{ src: string; assetPath: string }>;
}

export function SlideDetailEditor({
  slide,
  onChange,
  onUploadImage,
  onGenerateImage,
}: SlideDetailEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [imageGenPrompt, setImageGenPrompt] = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  if (!slide) {
    return (
      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        編集対象のスライドを選択してください。
      </div>
    );
  }

  const primaryImage = slide.visuals.find(
    (visual): visual is SlideVisualImage => visual.type === "image"
  );
  const primaryTable = slide.visuals.find(
    (visual): visual is SlideVisualTable => visual.type === "table"
  );

  const updatePrimaryImage = (next: Partial<SlideVisualImage> & { src?: string }) => {
    const existing = primaryImage ?? {
      type: "image" as const,
      src: "",
      caption: "",
      alt: "",
    };

    const merged: SlideVisualImage = {
      ...existing,
      ...next,
      type: "image",
    };

    const remaining = slide.visuals.filter((visual) => visual.type !== "image");
    onChange({
      ...slide,
      visuals: merged.src.trim() ? [merged, ...remaining] : remaining,
    });
  };

  const handleUploadImage = async (file: File) => {
    if (!onUploadImage) return;
    setUploading(true);
    try {
      const uploaded = await onUploadImage(file);
      updatePrimaryImage({
        src: uploaded.src,
        assetPath: uploaded.assetPath,
        alt: file.name,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {

        fileInputRef.current.value = "";
      }
    }
  };

  const handleGenerateImage = async () => {
    if (!onGenerateImage || !imageGenPrompt.trim()) return;
    setGeneratingImage(true);
    setImageGenError(null);
    try {
      const result = await onGenerateImage(imageGenPrompt.trim());
      updatePrimaryImage({ src: result.src, assetPath: result.assetPath, alt: imageGenPrompt.trim() });
      setShowImageGen(false);
      setImageGenPrompt("");
    } catch (err) {
      setImageGenError(err instanceof Error ? err.message : "画像生成に失敗しました");
    } finally {
      setGeneratingImage(false);
    }
  };

  const updatePrimaryTable = (
    next: Partial<SlideVisualTable> & { rows?: string[][] }
  ) => {
    const existing = primaryTable ?? {
      type: "table" as const,
      rows: [],
      caption: "",
    };

    const merged: SlideVisualTable = {
      ...existing,
      ...next,
      type: "table",
    };

    const remaining = slide.visuals.filter((visual) => visual.type !== "table");
    const hasContent = merged.rows.some((row) => row.some((cell) => cell.trim()));
    onChange({
      ...slide,
      visuals: hasContent ? [...remaining, merged] : remaining,
    });
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            スライド種別
          </label>
          <select
            aria-label="スライド種別"
            value={slide.kind}
            onChange={(event) =>
              onChange({
                ...slide,
                kind: event.target.value as SlideSpec["kind"],
              })
            }
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="title">{getSlideKindLabel("title")}</option>
            <option value="section">{getSlideKindLabel("section")}</option>
            <option value="content">{getSlideKindLabel("content")}</option>
            <option value="summary">{getSlideKindLabel("summary")}</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            レイアウト
          </label>
          <select
            aria-label="スライドレイアウト"
            value={slide.layout}
            onChange={(event) =>
              onChange({
                ...slide,
                layout: event.target.value,
              })
            }
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {SLIDE_LAYOUT_OPTIONS.map((layout) => (
              <option key={layout} value={layout}>
                {getSlideLayoutLabel(layout)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          タイトル
        </label>
        <Input
          aria-label="スライドタイトル"
          value={slide.title}
          onChange={(event) =>
            onChange({
              ...slide,
              title: event.target.value,
            })
          }
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          箇条書き
        </label>
        <textarea
          aria-label="スライド箇条書き"
          value={slide.bullets.join("\n")}
          onChange={(event) =>
            onChange({
              ...slide,
              bullets: event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
          className="min-h-32 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="1行につき1 bullet"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          本文
        </label>
        <textarea
          aria-label="スライド本文"
          value={slide.body ?? ""}
          onChange={(event) =>
            onChange({
              ...slide,
              body: event.target.value,
            })
          }
          className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="補足本文"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          発表者ノート
        </label>
        <textarea
          aria-label="スピーカーノート"
          value={slide.speakerNotes ?? ""}
          onChange={(event) =>
            onChange({
              ...slide,
              speakerNotes: event.target.value,
            })
          }
          className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="発表者ノート"
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="text-xs font-medium text-muted-foreground">画像</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!onUploadImage || uploading}
          >
            {uploading ? "アップロード中..." : "画像をアップロード"}
          </Button>
          {onGenerateImage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setShowImageGen((v) => !v); setImageGenError(null); }}
            >
              ✦ AIで画像を生成
            </Button>
          )}
          <input
            ref={fileInputRef}
            aria-label="画像ファイルをアップロード"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleUploadImage(file);
              }
            }}
          />
        </div>
        {showImageGen && (
          <div className="space-y-2 rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              DALL-E 3 で画像を生成します（OpenAI APIキーが必要です）
            </p>
            <textarea
              value={imageGenPrompt}
              onChange={(e) => setImageGenPrompt(e.target.value)}
              className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="生成したい画像の説明（例: 棒グラフで売上が右肩上がりのシンプルなビジネス図）"
            />
            {imageGenError && (
              <p className="text-xs text-destructive">{imageGenError}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleGenerateImage()}
                disabled={generatingImage || !imageGenPrompt.trim()}
              >
                {generatingImage ? "生成中..." : "生成"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => { setShowImageGen(false); setImageGenError(null); }}
              >
                キャンセル
              </Button>
            </div>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            画像 URL / パス / data URL
          </label>
          <Input
            aria-label="画像URL"
            value={primaryImage?.src ?? ""}
            onChange={(event) =>
              updatePrimaryImage({
                src: event.target.value,
              })
            }
            placeholder="https://... / ./assets/chart.png / data:image/png;base64,..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            キャプション
          </label>
          <Input
            aria-label="画像キャプション"
            value={primaryImage?.caption ?? ""}
            onChange={(event) =>
              updatePrimaryImage({
                caption: event.target.value,
              })
            }
            placeholder="図の補足"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="text-xs font-medium text-muted-foreground">表</div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            TSV テーブル
          </label>
          <textarea
            aria-label="テーブルTSV"
            value={(primaryTable?.rows ?? []).map((row) => row.join("\t")).join("\n")}
            onChange={(event) =>
              updatePrimaryTable({
                rows: event.target.value
                  .split("\n")
                  .map((line) => line.split("\t").map((cell) => cell.trim()))
                  .filter((row) => row.some((cell) => cell.length > 0)),
              })
            }
            className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder={"列1\t列2\n値A\t値B"}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            テーブルキャプション
          </label>
          <Input
            aria-label="テーブルキャプション"
            value={primaryTable?.caption ?? ""}
            onChange={(event) =>
              updatePrimaryTable({
                caption: event.target.value,
              })
            }
            placeholder="表の補足"
          />
        </div>
      </div>
    </div>
  );
}
