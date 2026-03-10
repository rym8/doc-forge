"use client";

import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  updateSummary?: string;
  pending?: boolean;
}

export function ChatMessage({
  role,
  content,
  updateSummary,
  pending = false,
}: ChatMessageProps) {
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
            : "bg-muted",
          pending && "animate-pulse"
        )}
      >
        {pending ? (
          <div className="flex items-center gap-2">
            <span>{content}</span>
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
            </span>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
      {updateSummary && (
        <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
          成果物更新: {updateSummary}
        </span>
      )}
    </div>
  );
}
