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

export function ArchiveDrawer() {
  const snapshots = useStore((s) => s.snapshots);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);

  if (snapshots.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="変更履歴を開く"
        >
          <HistoryIcon className="h-4 w-4" />
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
                  {snap.previousContent.slice(0, 500)}
                  {snap.previousContent.length > 500 && "..."}
                </pre>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
