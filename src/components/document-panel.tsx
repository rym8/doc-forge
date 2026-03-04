"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { EyeIcon, PencilIcon, ColumnsIcon, UndoIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { MarkdownPreview } from "./markdown-preview";
import { MarkdownEditor } from "./markdown-editor";
import { ArchiveDrawer } from "./archive-drawer";
import { cn } from "@/lib/utils";
import { stripConversationArtifacts } from "@/lib/document-template";

type ViewMode = "preview" | "editor" | "split";

function buildPreviewContent(content: string): string {
  return stripConversationArtifacts(content);
}

export function DocumentPanel() {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const documentContent = useStore((s) => s.documentContent);
  const updateDocument = useStore((s) => s.updateDocument);
  const setDocumentContent = useStore((s) => s.setDocumentContent);
  const undo = useStore((s) => s.undo);
  const snapshots = useStore((s) => s.snapshots);
  const [mode, setMode] = useState<ViewMode>("preview");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewContent = buildPreviewContent(documentContent);

  const handleChange = useCallback(
    (content: string) => {
      setDocumentContent(content);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateDocument(content);
      }, 500);
    },
    [setDocumentContent, updateDocument]
  );

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
        <h2 className="text-sm font-semibold">ドキュメント</h2>
        <div className="flex gap-1">
          {snapshots.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => undo()}
              title="直前の変更を元に戻す"
              aria-label="直前の変更を元に戻す"
            >
              <UndoIcon className="h-4 w-4" />
            </Button>
          )}
          <ArchiveDrawer />
          <Separator orientation="vertical" className="mx-1 h-5" />
          {(
            [
              ["editor", PencilIcon],
              ["split", ColumnsIcon],
              ["preview", EyeIcon],
            ] as const
          ).map(([m, Icon]) => (
            <Button
              key={m}
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", mode === m && "bg-accent")}
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
                content={documentContent}
                onChange={handleChange}
              />
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
