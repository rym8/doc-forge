"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { HistoryIcon, UndoIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Snapshot } from "@/lib/types";

interface ArchiveDrawerProps {
  compact?: boolean;
}

function renderSnapshotPreview(snapshot: Snapshot) {
  if (snapshot.artifactType === "slides" && snapshot.payload) {
    const deckTitle = snapshot.payload.slideDeck?.title || "Untitled Deck";
    const slideCount = snapshot.payload.slideDeck?.slides.length ?? 0;
    const sourcePreview = snapshot.payload.sourceMarkdown.slice(0, 220);
    return [
      `Deck: ${deckTitle} (${slideCount} slides)`,
      "",
      sourcePreview,
      snapshot.payload.sourceMarkdown.length > 220 ? "..." : "",
    ].join("\n");
  }

  return [
    snapshot.previousContent.slice(0, 500),
    snapshot.previousContent.length > 500 ? "..." : "",
  ].join("");
}

export function ArchiveDrawer({ compact = true }: ArchiveDrawerProps) {
  const snapshots = useStore((s) => s.snapshots);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);

  if (snapshots.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={compact ? "h-7 w-7" : "h-8 gap-1.5 px-3"}
          aria-label="変更履歴を開く"
        >
          <HistoryIcon className="h-4 w-4" />
          {!compact && <span>履歴</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px]">
        <SheetHeader>
          <SheetTitle>変更履歴</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-100px)]">
          <div className="flex flex-col gap-3 pr-4">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {snap.summary || "ドキュメント更新"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(snap.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {snap.artifactType}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => restoreSnapshot(snap.id)}
                  >
                    <UndoIcon className="mr-1 h-3 w-3" />
                    復元
                  </Button>
                </div>
                <Separator className="my-2" />
                <pre className="max-h-32 overflow-auto text-xs text-muted-foreground">
                  {renderSnapshotPreview(snap)}
                </pre>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
