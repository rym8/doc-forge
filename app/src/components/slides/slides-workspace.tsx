"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { LockIcon, XIcon } from "lucide-react";
import { ArchiveDrawer } from "@/components/archive-drawer";
import { SlideList } from "./slide-list";
import { SlideDetailEditor } from "./slide-detail-editor";
import { SlidePreview } from "./slide-preview";
import { ChangesSummary } from "./changes-summary";
import { useStore } from "@/lib/store";
import type {
  SlideDeck,
  SlideExportOptions,
  SlideSpec,
  SlideTheme,
} from "@/lib/types";
import { SLIDE_THEME_PRESETS, getSlideThemePreset } from "@/lib/slides/theme";
import { buildSlidesDiffSections } from "@/lib/slides/diff";
import {
  DEFAULT_SLIDE_EXPORT_OPTIONS,
  DEFAULT_SLIDE_THEME,
} from "@/lib/slides/session";

type SlidesTab = "slides" | "theme";

const SLIDE_DESIGN_WIDTH = 640;
const SLIDE_DESIGN_HEIGHT = (SLIDE_DESIGN_WIDTH * 9) / 16; // 360

function replaceSlide(deck: SlideDeck, slide: SlideSpec): SlideDeck {
  return {
    ...deck,
    slides: deck.slides.map((item) => (item.id === slide.id ? slide : item)),
  };
}

function buildNewSlide(index: number): SlideSpec {
  return {
    id: crypto.randomUUID(),
    kind: "content",
    title: `新規スライド ${index + 1}`,
    bullets: ["要点を追加"],
    body: "",
    speakerNotes: "",
    visuals: [],
    layout: "title-body",
    themeVariant: "default",
  };
}


export function SlidesWorkspace() {
  const currentSessionId = useStore((state) => state.currentSessionId);
  const sessions = useStore((state) => state.sessions);
  const documentContent = useStore((state) => state.documentContent);
  const setCurrentSlideId = useStore((state) => state.setCurrentSlideId);
  const updateDocument = useStore((state) => state.updateDocument);
  const selectSession = useStore((state) => state.selectSession);
  const [tab, setTab] = useState<SlidesTab>("slides");
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [draftDeck, setDraftDeck] = useState<SlideDeck | null>(null);
  const [draftTheme, setDraftTheme] = useState<SlideTheme | null>(null);
  const [draftExportOptions, setDraftExportOptions] =
    useState<SlideExportOptions | null>(null);
  const [comparePreset, setComparePreset] = useState<SlideTheme | null>(null);
  const [planning, setPlanning] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const [exportingGoogleSlides, setExportingGoogleSlides] = useState(false);
  const [exportingGoogleDrive, setExportingGoogleDrive] = useState(false);
  const [googleDriveUrl, setGoogleDriveUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewPanelEl, setPreviewPanelEl] = useState<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [diffDismissed, setDiffDismissed] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    if (!previewPanelEl) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width - 32; // p-4 padding
      if (width > 0) setPreviewScale(width / SLIDE_DESIGN_WIDTH);
    });
    observer.observe(previewPanelEl);
    return () => observer.disconnect();
  }, [previewPanelEl]);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [currentSessionId, sessions]
  );

  useEffect(() => {
    setDraftDeck(currentSession?.slideDeck ?? null);
    setDraftTheme(
      structuredClone(currentSession?.theme ?? DEFAULT_SLIDE_THEME)
    );
    setDraftExportOptions(
      structuredClone(currentSession?.exportOptions ?? DEFAULT_SLIDE_EXPORT_OPTIONS)
    );
    setTab("slides");
  }, [
    currentSession?.id,
    currentSession?.slideDeck,
    currentSession?.theme,
    currentSession?.exportOptions,
  ]);

  useEffect(() => {
    if (!draftDeck?.slides.length) {
      setSelectedSlideId(null);
      setCurrentSlideId(null);
      return;
    }
    if (!selectedSlideId || !draftDeck.slides.some((slide) => slide.id === selectedSlideId)) {
      setSelectedSlideId(draftDeck.slides[0]?.id ?? null);
    }
  }, [draftDeck, selectedSlideId, setCurrentSlideId]);

  useEffect(() => {
    setCurrentSlideId(selectedSlideId);
  }, [selectedSlideId, setCurrentSlideId]);

  const selectedSlide =
    draftDeck?.slides.find((slide) => slide.id === selectedSlideId) ?? null;
  const hasGeneratedSlides = Boolean(draftDeck?.slides.length);
  const diffSections = useMemo(
    () =>
      buildSlidesDiffSections({
        baseDeck: currentSession?.slideDeck ?? null,
        draftDeck,
        baseTheme: currentSession?.theme ?? null,
        draftTheme,
        baseExportOptions: currentSession?.exportOptions ?? null,
        draftExportOptions,
        warnings: currentSession?.slideDeckWarnings ?? [],
      }),
    [
      currentSession?.exportOptions,
      currentSession?.slideDeck,
      currentSession?.theme,
      draftDeck,
      draftExportOptions,
      draftTheme,
      currentSession?.slideDeckWarnings,
    ]
  );
  const deckDiffItems =
    diffSections.find((section) => section.title === "スライド")?.items ?? [];

  useEffect(() => {
    setDiffDismissed(false);
  }, [deckDiffItems.length]);

  const themeDiffCount = diffSections
    .filter((section) => !["スライド", "補正ログ"].includes(section.title))
    .reduce((sum, section) => sum + section.items.length, 0);

  const reloadCurrentSession = useCallback(async () => {
    if (!currentSessionId) return;
    await selectSession(currentSessionId);
  }, [currentSessionId, selectSession]);

  const saveDeck = useCallback(
    async (deck: SlideDeck) => {
      if (!currentSessionId) return;
      setSavingDeck(true);
      setStatusMessage(null);
      try {
        const res = await fetch(`/api/sessions/${currentSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slideDeck: deck }),
        });
        if (!res.ok) {
          throw new Error(`スライド保存に失敗しました (${res.status})`);
        }
        await reloadCurrentSession();
        setStatusMessage("スライド構成を保存しました。");
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "スライド保存に失敗しました。"
        );
      } finally {
        setSavingDeck(false);
      }
    },
    [currentSessionId, reloadCurrentSession]
  );

  const saveTheme = useCallback(
    async (
      theme: SlideTheme,
      exportOptions: SlideExportOptions | null | undefined
    ) => {
      if (!currentSessionId) return;
      setSavingTheme(true);
      setStatusMessage(null);
      try {
        const res = await fetch(`/api/sessions/${currentSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme, exportOptions }),
        });
        if (!res.ok) {
          throw new Error(`テーマ保存に失敗しました (${res.status})`);
        }
        await reloadCurrentSession();
        setStatusMessage("テーマ設定を保存しました。");
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "テーマ保存に失敗しました。"
        );
      } finally {
        setSavingTheme(false);
      }
    },
    [currentSessionId, reloadCurrentSession]
  );

  const handlePlanSlides = useCallback(async () => {
    if (!currentSessionId) return;
    setPlanning(true);
    setStatusMessage(null);
    try {
      await updateDocument(documentContent);
      const res = await fetch(`/api/sessions/${currentSessionId}/slides/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMarkdown: documentContent }),
      });
      if (!res.ok) {
        throw new Error(`原稿の読込に失敗しました (${res.status})`);
      }
      await reloadCurrentSession();
      setTab("slides");
      setStatusMessage("現在の原稿を読み込み、スライドを更新しました。");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "原稿の読込に失敗しました。"
      );
    } finally {
      setPlanning(false);
    }
  }, [currentSessionId, documentContent, reloadCurrentSession, updateDocument]);

  const handleExportArtifact = useCallback(
    async (kind: "pptx" | "google-slides") => {
      if (!currentSessionId || !hasGeneratedSlides) return;
      const sessionTitle = currentSession?.title || "slides";

      const setLoading =
        kind === "pptx" ? setExportingPptx : setExportingGoogleSlides;
        setLoading(true);
        setStatusMessage(null);
        try {
        const res = await fetch(
          `/api/sessions/${currentSessionId}/export/${
            kind === "google-slides" ? "google-slides-script" : kind
          }`,
          { method: "POST" }
        );
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            payload?.error ||
              `${kind === "pptx" ? "PowerPoint" : "Google Slides"} 出力に失敗しました (${res.status})`
          );
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download =
          kind === "pptx"
            ? `${sessionTitle}.pptx`
            : `${sessionTitle}-google-slides.pptx`;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "出力に失敗しました。"
        );
      } finally {
        setLoading(false);
      }
    },
    [currentSession?.title, currentSessionId, hasGeneratedSlides]
  );

  const handleUploadToGoogleDrive = useCallback(async () => {
    if (!currentSessionId || !hasGeneratedSlides) return;
    setExportingGoogleDrive(true);
    setStatusMessage(null);
    setGoogleDriveUrl(null);
    try {
      const res = await fetch(
        `/api/sessions/${currentSessionId}/export/google-drive`,
        { method: "POST" }
      );
      const payload = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
        notConnected?: boolean;
      } | null;

      if (!res.ok) {
        if (payload?.notConnected) {
          setStatusMessage(
            "Google Drive に未接続です。メニュー > 設定 > Google Drive で接続してください。"
          );
        } else {
          throw new Error(
            payload?.error ?? `Google Drive アップロードに失敗しました (${res.status})`
          );
        }
        return;
      }

      if (payload?.url) {
        setGoogleDriveUrl(payload.url);
        setStatusMessage("Google Slides にアップロードしました。");
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "アップロードに失敗しました。"
      );
    } finally {
      setExportingGoogleDrive(false);
    }
  }, [currentSessionId, hasGeneratedSlides]);

  const handleUpdateSelectedSlide = useCallback(
    (slide: SlideSpec) => {
      if (!draftDeck) return;
      setDraftDeck(replaceSlide(draftDeck, slide));
    },
    [draftDeck]
  );

  const handleAddSlide = useCallback(() => {
    setDraftDeck((current) => {
      if (!current) return current;
      const nextSlide = buildNewSlide(current.slides.length);
      setSelectedSlideId(nextSlide.id);
      return {
        ...current,
        slides: [...current.slides, nextSlide],
      };
    });
  }, []);

  const handleDeleteSlide = useCallback(() => {
    setDraftDeck((current) => {
      if (!current || !selectedSlideId) return current;
      const nextSlides = current.slides.filter((slide) => slide.id !== selectedSlideId);
      setSelectedSlideId(nextSlides[0]?.id ?? null);
      return {
        ...current,
        slides: nextSlides,
      };
    });
  }, [selectedSlideId]);

  const handleReorderSlides = useCallback(
    (newSlides: import("@/lib/types").SlideSpec[]) => {
      setDraftDeck((current) => {
        if (!current) return current;
        return { ...current, slides: newSlides };
      });
    },
    []
  );

  const printSlidesAsPdf = useCallback(() => {
    if (!draftDeck || !draftTheme) return;
    const tokens = draftTheme.tokens;
    const bg = tokens.backgroundColor || "#ffffff";
    const text = tokens.textColor || "#000000";
    const accent = tokens.accentColor || "#000000";
    const titleFont = tokens.titleFontFamily || "sans-serif";
    const bodyFont = tokens.bodyFontFamily || "sans-serif";

    const slidesHtml = draftDeck.slides
      .map((slide) => {
        const bullets = (slide.bullets ?? [])
          .map((b) => `<li style="margin-bottom:6px">${b}</li>`)
          .join("");
        return `
<div class="slide">
  <div class="slide-title" style="font-family:${titleFont};color:${accent}">${slide.title ?? ""}</div>
  <ul class="slide-body" style="font-family:${bodyFont};color:${text}">${bullets}</ul>
</div>`;
      })
      .join("\n");

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #888; }
  .slide {
    width: 297mm;
    height: 167mm;
    background: ${bg};
    padding: 24mm 20mm;
    page-break-after: always;
    overflow: hidden;
  }
  .slide-title {
    font-size: 28pt;
    font-weight: bold;
    margin-bottom: 12mm;
    line-height: 1.2;
  }
  .slide-body {
    font-size: 16pt;
    padding-left: 6mm;
    line-height: 1.6;
    list-style-type: disc;
  }
</style>
</head>
<body>
${slidesHtml}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }, [draftDeck, draftTheme]);

  const handleSaveAndExport = useCallback(
    async (kind: "pptx" | "google-slides" | "drive" | "pdf") => {
      setExportDialogOpen(false);
      if (draftDeck && deckDiffItems.length > 0) {
        await saveDeck(draftDeck);
      }
      if (kind === "pdf") {
        printSlidesAsPdf();
      } else if (kind === "drive") {
        await handleUploadToGoogleDrive();
      } else {
        await handleExportArtifact(kind);
      }
    },
    [deckDiffItems.length, draftDeck, handleExportArtifact, handleUploadToGoogleDrive, printSlidesAsPdf, saveDeck]
  );

  if (!currentSession) {
    return null;
  }

  const planButtonLabel = planning
    ? "原稿読込中..."
    : "原稿を読み込む";

  const applyThemePreset = (presetId: string) => {
    const preset = getSlideThemePreset(presetId);
    if (!preset) return;
    setDraftTheme(structuredClone(preset));
  };

  const handleUploadImage = useCallback(
    async (file: File) => {
      if (!currentSessionId) {
        throw new Error("アクティブな slides セッションがありません。");
      }
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/sessions/${currentSessionId}/assets`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || `画像アップロードに失敗しました (${res.status})`);
      }
      return (await res.json()) as {
        src: string;
        assetPath: string;
        fileName: string;
      };
    },
    [currentSessionId]
  );

  const handleGenerateImage = useCallback(
    async (prompt: string) => {
      if (!currentSessionId) {
        throw new Error("アクティブな slides セッションがありません。");
      }
      const res = await fetch(
        `/api/sessions/${currentSessionId}/generate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || `画像生成に失敗しました (${res.status})`);
      }
      return (await res.json()) as { src: string; assetPath: string };
    },
    [currentSessionId]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["slides", "スライド"],
              ["theme", "テーマ"],
            ] as const
          ).map(([item, label]) => (
            <Button
              key={item}
              variant={tab === item ? "default" : "ghost"}
              size="sm"
              className="capitalize"
              onClick={() => {
                if (item === "theme" && !hasGeneratedSlides) return;
                setTab(item);
              }}
            >
              {label}
              {item === "theme" && !hasGeneratedSlides ? (
                <LockIcon className="h-3.5 w-3.5" />
              ) : null}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handlePlanSlides()}
            disabled={planning || !documentContent.trim()}
          >
            {planButtonLabel}
          </Button>
          <ArchiveDrawer compact={false} />
          {tab === "slides" && (
            <Button
              size="sm"
              onClick={() => setExportDialogOpen(true)}
              disabled={!hasGeneratedSlides}
            >
              スライド保存
            </Button>
          )}
          {tab === "theme" && (
            <Button
              size="sm"
              onClick={() =>
                draftTheme &&
                void saveTheme(draftTheme, draftExportOptions)
              }
              disabled={
                savingTheme ||
                !draftTheme ||
                !draftExportOptions ||
                themeDiffCount === 0
              }
            >
              {savingTheme ? "保存中..." : "テーマ保存"}
            </Button>
          )}
        </div>
      </div>
      {(statusMessage || googleDriveUrl) ? (
        <>
          <Separator />
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
            {statusMessage && <span>{statusMessage}</span>}
            {googleDriveUrl && (
              <a
                href={googleDriveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary"
              >
                Google Slides で開く →
              </a>
            )}
          </div>
        </>
      ) : null}
      <Separator />

      {tab === "slides" && (
        <div className="flex min-h-0 flex-1 flex-col">
          {deckDiffItems.length > 0 && !diffDismissed && (
            <>
              <div className="flex items-start gap-2 px-4 py-2">
                <div className="flex-1">
                  <ChangesSummary
                    sections={diffSections.filter((section) =>
                      ["補正ログ", "スライド"].includes(section.title)
                    )}
                  />
                </div>
                <button
                  onClick={() => setDiffDismissed(true)}
                  aria-label="閉じる"
                  className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <Separator />
            </>
          )}
          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[280px_1fr]">
            <ScrollArea className="min-h-0 border-r">
              <SlideList
                slides={draftDeck?.slides ?? []}
                selectedSlideId={selectedSlideId}
                onSelect={setSelectedSlideId}
                onAdd={handleAddSlide}
                onDelete={handleDeleteSlide}
                onReorder={handleReorderSlides}
              />
            </ScrollArea>
            <ResizablePanelGroup orientation="horizontal" className="min-h-0">
              <ResizablePanel defaultSize={50} minSize={30}>
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <SlideDetailEditor
                      slide={selectedSlide}
                      onChange={handleUpdateSelectedSlide}
                      onUploadImage={handleUploadImage}
                      onGenerateImage={handleGenerateImage}
                    />
                  </div>
                </ScrollArea>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={20}>
                <div ref={setPreviewPanelEl} className="flex h-full flex-col gap-3 overflow-y-auto p-4">
                  <div style={{ height: SLIDE_DESIGN_HEIGHT * previewScale }}>
                    <div
                      style={{
                        width: SLIDE_DESIGN_WIDTH,
                        transformOrigin: "top left",
                        transform: `scale(${previewScale})`,
                      }}
                    >
                      <SlidePreview slide={selectedSlide} theme={draftTheme} />
                    </div>
                  </div>
                  {selectedSlide?.speakerNotes && (
                    <div className="rounded-lg border bg-muted/40 px-4 py-3">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        発表者ノート
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/80">
                        {selectedSlide.speakerNotes}
                      </p>
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      )}

      {tab === "theme" && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-4 p-4 xl:grid-cols-[420px_1fr]">
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <ChangesSummary
                sections={diffSections.filter((section) => section.title !== "スライド")}
              />
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  テーマプリセット
                </label>
                <div className="grid gap-2">
                  {SLIDE_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.presetId}
                      type="button"
                      onClick={() => applyThemePreset(preset.presetId)}
                      onMouseEnter={() => setComparePreset(preset)}
                      onMouseLeave={() => setComparePreset(null)}
                      className="rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{preset.presetId}</span>
                        <div className="flex items-center gap-2">
                          {draftTheme?.presetId === preset.presetId && (
                            <span className="text-xs text-green-600">✓</span>
                          )}
                          <span
                            className="h-4 w-8 rounded-full border"
                            style={{ backgroundColor: preset.tokens.accentColor }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 text-[11px] text-muted-foreground">
                        <span>{preset.tokens.titleFontFamily}</span>
                        <span>·</span>
                        <span>{preset.tokens.bodyFontFamily}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Preset ID
                </label>
                <Input
                  aria-label="テーマPreset ID"
                  value={draftTheme?.presetId ?? ""}
                  onChange={(event) =>
                    setDraftTheme((current) =>
                      current
                        ? { ...current, presetId: event.target.value }
                        : current
                    )
                  }
                />
              </div>
              {(
                [
                  ["pageSize", "ページサイズ"],
                  ["titleFontFamily", "タイトルフォント"],
                  ["bodyFontFamily", "本文フォント"],
                  ["headerText", "ヘッダー"],
                  ["footerText", "フッター"],
                  ["logoAssetPath", "ロゴ画像パス"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {label}
                  </label>
                  <Input
                    value={draftTheme?.tokens[key] ?? ""}
                    onChange={(event) =>
                      setDraftTheme((current) =>
                        current
                          ? {
                              ...current,
                              tokens: {
                                ...current.tokens,
                                [key]: event.target.value,
                              },
                            }
                          : current
                      )
                    }
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["backgroundColor", "背景色"],
                    ["textColor", "文字色"],
                    ["accentColor", "アクセント色"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {label}
                    </label>
                    <input
                      type="color"
                      value={draftTheme?.tokens[key] ?? "#000000"}
                      onChange={(event) =>
                        setDraftTheme((current) =>
                          current
                            ? {
                                ...current,
                                tokens: {
                                  ...current.tokens,
                                  [key]: event.target.value,
                                },
                              }
                            : current
                        )
                      }
                      className="h-10 w-full rounded-md border bg-transparent p-1"
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  出力オプション
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    aria-label="speaker notes を出力"
                    type="checkbox"
                    checked={draftExportOptions?.includeSpeakerNotes ?? false}
                    onChange={(event) =>
                      setDraftExportOptions((current) =>
                        current
                          ? {
                              ...current,
                              includeSpeakerNotes: event.target.checked,
                            }
                          : current
                      )
                    }
                  />
                  speaker notes を出力する
                </label>
              </div>
            </div>
            {comparePreset ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">現在</div>
                  <SlidePreview slide={selectedSlide ?? draftDeck?.slides[0] ?? null} theme={draftTheme} />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">比較: {comparePreset.presetId}</div>
                  <SlidePreview slide={selectedSlide ?? draftDeck?.slides[0] ?? null} theme={comparePreset} />
                </div>
              </div>
            ) : (
              <SlidePreview slide={selectedSlide ?? draftDeck?.slides[0] ?? null} theme={draftTheme} />
            )}
          </div>
        </ScrollArea>
      )}

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>出力先を選択</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={() => void handleSaveAndExport("pptx")}
              disabled={exportingPptx}
              className="w-full justify-start"
            >
              {exportingPptx ? "Go中..." : "Go: PowerPoint"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleSaveAndExport("google-slides")}
              disabled={exportingGoogleSlides}
              className="w-full justify-start"
            >
              {exportingGoogleSlides ? "Go中..." : "Go: Google Slides"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleSaveAndExport("drive")}
              disabled={exportingGoogleDrive}
              className="w-full justify-start"
            >
              {exportingGoogleDrive ? "アップロード中..." : "Go: Drive Upload"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleSaveAndExport("pdf")}
              className="w-full justify-start"
            >
              PDF プレビュー
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
