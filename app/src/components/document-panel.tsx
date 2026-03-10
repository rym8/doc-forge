"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  EyeIcon,
  PencilIcon,
  ColumnsIcon,
  UndoIcon,
  DownloadIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { MarkdownPreview } from "./markdown-preview";
import { MarkdownEditor } from "./markdown-editor";
import { ArchiveDrawer } from "./archive-drawer";
import { cn } from "@/lib/utils";
import {
  composeDocumentContent,
  splitDocumentContent,
} from "@/lib/document-template";

type ViewMode = "preview" | "editor" | "split";

function buildPreviewContent(content: string): string {
  return splitDocumentContent(content).material;
}

function toMarkdownFileName(title?: string): string {
  const normalized = (title ?? "document")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ");
  const base = normalized || "document";
  return base.toLowerCase().endsWith(".md") ? base : `${base}.md`;
}

export function DocumentPanel() {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const documentContent = useStore((s) => s.documentContent);
  const updateDocument = useStore((s) => s.updateDocument);
  const setDocumentContent = useStore((s) => s.setDocumentContent);
  const undo = useStore((s) => s.undo);
  const snapshots = useStore((s) => s.snapshots);
  const [mode, setMode] = useState<ViewMode>("preview");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const isSlidesSession = currentSession?.artifactType === "slides";
  const previewContent = buildPreviewContent(documentContent);
  const splitContent = splitDocumentContent(documentContent);
  const editorContent = isSlidesSession ? previewContent : splitContent.material;
  const internalNotes = isSlidesSession ? "" : splitContent.notes;

  const scheduleDocumentSave = useCallback(
    (content: string) => {
      setDocumentContent(content);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateDocument(content);
      }, 500);
    },
    [setDocumentContent, updateDocument]
  );

  const handleDocumentChange = useCallback(
    (content: string) => {
      scheduleDocumentSave(
        isSlidesSession ? content : composeDocumentContent(content, internalNotes)
      );
    },
    [internalNotes, isSlidesSession, scheduleDocumentSave]
  );

  const handleNotesChange = useCallback(
    (notes: string) => {
      if (isSlidesSession) return;
      scheduleDocumentSave(composeDocumentContent(editorContent, notes));
    },
    [editorContent, isSlidesSession, scheduleDocumentSave]
  );

  const handleExport = useCallback(() => {
    const markdown = previewContent.trim();
    if (!markdown) return;

    const fileName = toMarkdownFileName(currentSession?.title);
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [currentSession?.title, previewContent]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+Z for undo (only when not in textarea)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "z" &&
        !e.shiftKey &&
        snapshots.length > 0 &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, snapshots.length]);

  if (!currentSessionId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between px-3">
          <h2 className="text-sm font-semibold">ドキュメント</h2>
        </div>
        <Separator />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            セッションを選択すると編集を開始できます
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-3">
        <h2 className="text-sm font-semibold">
          {isSlidesSession ? "原稿" : "ドキュメント"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {snapshots.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => undo()}
              title="直前の変更を元に戻す"
              aria-label="直前の変更を元に戻す"
            >
              <UndoIcon className="h-4 w-4" />
              <span>元に戻す</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={handleExport}
            disabled={!previewContent.trim()}
            title={isSlidesSession ? "原稿Markdownを保存" : "Markdownを保存"}
            aria-label={isSlidesSession ? "原稿Markdownを保存" : "Markdownを保存"}
          >
            <DownloadIcon className="h-4 w-4" />
            <span>{isSlidesSession ? "原稿保存" : "Markdown保存"}</span>
          </Button>
          <ArchiveDrawer compact={false} />
          <Separator orientation="vertical" className="mx-1 h-5" />
          {(
            [
              ["editor", PencilIcon, "編集"],
              ["split", ColumnsIcon, "分割"],
              ["preview", EyeIcon, "プレビュー"],
            ] as const
          ).map(([m, Icon, label]) => (
            <Button
              key={m}
              variant={mode === m ? "default" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => setMode(m)}
              aria-label={
                m === "editor"
                  ? "編集モードに切り替え"
                  : m === "split"
                    ? "分割モードに切り替え"
                    : "プレビューモードに切り替え"
              }
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Button>
          ))}
        </div>
      </div>
      <Separator />
      <div className="flex flex-1 overflow-hidden">
        {(mode === "editor" || mode === "split") && (
          <ScrollArea
            className={cn("flex-1", mode === "split" && "border-r")}
          >
            <div className="p-4">
              <MarkdownEditor
                content={editorContent}
                onChange={handleDocumentChange}
              />
              {!isSlidesSession && (
                <div className="mt-8 border-t pt-6">
                  <div className="mb-3">
                    <p className="text-sm font-semibold">
                      制作メモ（プレビュー非表示）
                    </p>
                    <p className="text-xs text-muted-foreground">
                      資料の目的、会話で固まったこと、資料に直接は出さない重要メモを残します。
                    </p>
                  </div>
                  <MarkdownEditor
                    content={internalNotes}
                    onChange={handleNotesChange}
                    ariaLabel="制作メモ（プレビュー非表示）"
                    placeholder="この資料の目的や、資料外だが重要なメモを書きます..."
                    className="min-h-[180px] w-full resize-none rounded-md border bg-muted/20 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        )}
        {(mode === "preview" || mode === "split") && (
          <ScrollArea className="flex-1">
            <div className="p-4">
              <MarkdownPreview content={previewContent} />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
