"use client";

import { useCallback, useRef, useEffect } from "react";

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
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
      className="min-h-[200px] w-full resize-none border-0 bg-transparent p-0 font-mono text-sm outline-none focus:ring-0"
      placeholder="Markdownを書き始めてください..."
    />
  );
}
