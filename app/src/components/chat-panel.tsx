"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { useStore } from "@/lib/store";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  updateSummary?: string;
}

function formatUpdateSummary(data: {
  summary?: unknown;
  warnings?: unknown;
}): string {
  const summary =
    typeof data.summary === "string" && data.summary.trim()
      ? data.summary.trim()
      : "更新";
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (warnings.length === 0) return summary;
  return `${summary} / 補正: ${warnings.slice(0, 2).join(" / ")}${warnings.length > 2 ? ` / ...ほか ${warnings.length - 2} 件` : ""}`;
}

interface ChatPanelProps {
  title?: string;
  artifactMode?: "document" | "slides";
}

export function ChatPanel({
  title = "チャット",
  artifactMode = "document",
}: ChatPanelProps) {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const currentSlideId = useStore((s) => s.currentSlideId);
  const messages = useStore((s) => s.messages);
  const setDocumentContent = useStore((s) => s.setDocumentContent);
  const selectSession = useStore((s) => s.selectSession);
  const [streamingText, setStreamingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updateSummaries, setUpdateSummaries] = useState<
    Record<string, string>
  >({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, pendingUserMessage, errorMessage]);

  // Reset transient UI state when switching sessions
  useEffect(() => {
    setStreamingText("");
    setPendingUserMessage(null);
    setErrorMessage(null);
    setUpdateSummaries({});
  }, [currentSessionId]);

  const handleSend = useCallback(
    async (message: string) => {
      if (!currentSessionId || loading) return;

      setLoading(true);
      setStreamingText("");
      setPendingUserMessage(message);
      setErrorMessage(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: currentSessionId,
            message,
            currentSlideId,
            artifactMode,
            ...(preferredProvider ? { preferredProvider } : {}),
          }),
        });

        if (!res.ok) {
          let error = `チャットリクエストに失敗しました (${res.status})`;
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const body = (await res.json()) as { error?: string };
            if (body.error) error = body.error;
          } else {
            const body = await res.text();
            if (body) error = body.slice(0, 200);
          }
          throw new Error(error);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("レスポンス本文が取得できませんでした");

        const decoder = new TextDecoder();
        let buffer = "";
        let latestSummary: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6));

            if (data.type === "text_delta") {
              setStreamingText((prev) => prev + data.text);
            } else if (data.type === "document_update") {
              setDocumentContent(data.document);
              latestSummary = formatUpdateSummary(data);
            } else if (data.type === "slide_deck_update") {
              latestSummary = formatUpdateSummary(data);
            } else if (data.type === "done") {
              // Reload session to sync messages from server
              await selectSession(currentSessionId);
              if (latestSummary) {
                const syncedMessages = useStore.getState().messages;
                const latestAssistant = [...syncedMessages]
                  .reverse()
                  .find((m) => m.role === "assistant");
                if (latestAssistant) {
                  setUpdateSummaries((prev) => ({
                    ...prev,
                    [latestAssistant.id]: latestSummary ?? "",
                  }));
                }
              }
            } else if (data.type === "error") {
              const error =
                typeof data.error === "string"
                  ? data.error
                  : "不明なチャットエラー";
              setErrorMessage(error);
            }
          }
        }
      } catch (err) {
        const error =
          err instanceof Error
            ? err.message
            : "チャットリクエストに失敗しました";
        setErrorMessage(error);
      } finally {
        setStreamingText("");
        setLoading(false);
        setPendingUserMessage(null);
      }
    },
    [
      artifactMode,
      currentSessionId,
      currentSlideId,
      loading,
      preferredProvider,
      setDocumentContent,
      selectSession,
    ]
  );

  const displayMessages: DisplayMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    updateSummary: updateSummaries[m.id],
  }));
  if (pendingUserMessage) {
    displayMessages.push({
      id: "__pending_user__",
      role: "user",
      content: pendingUserMessage,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <Separator />
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="flex flex-col gap-3 p-4">
          {!currentSessionId && (
            <p className="text-sm text-muted-foreground">
              セッションを選択するとチャットを開始できます
            </p>
          )}
          {displayMessages.map((m) => (
            <ChatMessage
              key={m.id}
              role={m.role}
              content={m.content}
              updateSummary={m.updateSummary}
            />
          ))}
          {loading && !streamingText && (
            <ChatMessage role="assistant" content="AIが考え中" pending />
          )}
          {streamingText && (
            <ChatMessage role="assistant" content={streamingText} />
          )}
          {errorMessage && (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              エラー: {errorMessage}
            </p>
          )}
        </div>
      </div>
      <Separator />
      <div className="flex items-center gap-2 px-3 py-1.5">
        <label className="text-xs text-muted-foreground whitespace-nowrap">モデル:</label>
        <select
          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
          value={preferredProvider}
          onChange={(e) => setPreferredProvider(e.target.value)}
        >
          <option value="">自動</option>
          <option value="anthropic">Claude</option>
          <option value="openai">GPT-4o</option>
          <option value="gemini">Gemini</option>
          <option value="mock">Mock</option>
        </select>
      </div>
      <ChatInput
        onSend={handleSend}
        disabled={!currentSessionId}
        loading={loading}
      />
    </div>
  );
}
