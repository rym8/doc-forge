"use client";

import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  updateSummary?: string;
}

export function ChatMessage({ role, content, updateSummary }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        role === "user" ? "items-end" : "items-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
      {updateSummary && (
        <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
          ドキュメント更新: {updateSummary}
        </span>
      )}
    </div>
  );
}
