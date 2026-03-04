"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MenuIcon } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SessionPanel } from "@/components/session-panel";
import { DocumentPanel } from "@/components/document-panel";
import { ChatPanel } from "@/components/chat-panel";
import { useStore } from "@/lib/store";

const FONT_SCALE_KEY = "doc-forge-font-scale";
const FONT_SCALE_DEFAULT = 100;
const FONT_SCALE_MIN = 90;
const FONT_SCALE_MAX = 130;
const FONT_SCALE_STEP = 10;
const FONT_SCALE_EVENT = "doc-forge-font-scale-change";

function clampFontScale(value: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
}

function readSavedFontScale(): number {
  if (typeof window === "undefined") return FONT_SCALE_DEFAULT;
  const raw = window.localStorage.getItem(FONT_SCALE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return FONT_SCALE_DEFAULT;
  return clampFontScale(parsed);
}

function subscribeFontScale(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== FONT_SCALE_KEY) return;
    onStoreChange();
  };
  const handleLocalChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(FONT_SCALE_EVENT, handleLocalChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(FONT_SCALE_EVENT, handleLocalChange);
  };
}

function getFontScaleSnapshot(): number {
  return readSavedFontScale();
}

function getFontScaleServerSnapshot(): number {
  return FONT_SCALE_DEFAULT;
}

function persistFontScale(nextValue: number): void {
  const clamped = clampFontScale(nextValue);
  window.localStorage.setItem(FONT_SCALE_KEY, String(clamped));
  window.dispatchEvent(new Event(FONT_SCALE_EVENT));
}

export default function Home() {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const fontScale = useSyncExternalStore(
    subscribeFontScale,
    getFontScaleSnapshot,
    getFontScaleServerSnapshot
  );
  const initialRootFontSizeRef = useRef<string | null>(null);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const loadSessions = useStore((s) => s.loadSessions);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (initialRootFontSizeRef.current === null) {
      initialRootFontSizeRef.current = document.documentElement.style.fontSize;
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}%`;
  }, [fontScale]);

  useEffect(() => {
    return () => {
      if (initialRootFontSizeRef.current !== null) {
        document.documentElement.style.fontSize = initialRootFontSizeRef.current;
      }
    };
  }, []);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId),
    [sessions, currentSessionId]
  );

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <Sheet open={sessionsOpen} onOpenChange={setSessionsOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label="メニューを開く"
              className="h-8"
            >
              <MenuIcon className="h-4 w-4" />
              メニュー
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] p-0 sm:max-w-[360px]">
            <SheetHeader className="sr-only">
              <SheetTitle>メニュー</SheetTitle>
              <SheetDescription>
                セッション管理と設定を行います。
              </SheetDescription>
            </SheetHeader>
            <SessionPanel onSessionActivated={() => setSessionsOpen(false)} />
          </SheetContent>
        </Sheet>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {currentSession
            ? `現在のセッション: ${currentSession.title}`
            : "セッション未選択"}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            aria-label="文字を小さく"
            onClick={() => persistFontScale(fontScale - FONT_SCALE_STEP)}
            disabled={fontScale <= FONT_SCALE_MIN}
          >
            A-
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            aria-label="文字サイズを標準に戻す"
            onClick={() => persistFontScale(FONT_SCALE_DEFAULT)}
            disabled={fontScale === FONT_SCALE_DEFAULT}
          >
            標準
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            aria-label="文字を大きく"
            onClick={() => persistFontScale(fontScale + FONT_SCALE_STEP)}
            disabled={fontScale >= FONT_SCALE_MAX}
          >
            A+
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="document" defaultSize={62} minSize={30}>
            <DocumentPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="chat" defaultSize={38} minSize={25}>
            <ChatPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
