"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SendIcon, LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function ChatInput({ onSend, disabled, loading }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 44), 220);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 220 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeInput();
  }, [value, resizeInput]);

  const handleSend = useCallback(() => {
    if (disabled || loading) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => {
      resizeInput();
      inputRef.current?.focus();
    });
  }, [value, onSend, disabled, loading, resizeInput]);

  return (
    <div className="flex items-center gap-2 p-3">
      <textarea
        ref={inputRef}
        placeholder="メッセージを入力..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            if (
              isComposing ||
              e.nativeEvent.isComposing ||
              e.nativeEvent.keyCode === 229
            ) {
              return;
            }
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={disabled}
        rows={1}
        className={cn(
          "w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2",
          "text-sm shadow-xs outline-none transition-[color,box-shadow]",
          "placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
          "resize-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        )}
      />
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={handleSend}
        disabled={disabled || loading || !value.trim()}
        aria-label="送信"
        className="h-11 w-11"
      >
        {loading ? (
          <LoaderIcon className="h-4 w-4 animate-spin" />
        ) : (
          <SendIcon className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
