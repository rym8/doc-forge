"use client";

import { useCallback, useRef, useEffect } from "react";

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function MarkdownEditor({
  content,
  onChange,
  placeholder,
  className,
  ariaLabel,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [content]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <textarea
      ref={textareaRef}
      value={content}
      onChange={handleChange}
      aria-label={ariaLabel}
      className={
        className ??
        "min-h-[200px] w-full resize-none border-0 bg-transparent p-0 font-mono text-sm outline-none focus:ring-0"
      }
      placeholder={placeholder ?? "Markdownを書き始めてください..."}
    />
  );
}
