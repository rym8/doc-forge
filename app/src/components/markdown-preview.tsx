"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function resolveSafeHref(href?: string) {
  if (!href) return null;
  if (href.startsWith("#")) return href;

  try {
    const url = new URL(href, "http://localhost");
    if (
      href.startsWith("/") ||
      href.startsWith("./") ||
      href.startsWith("../")
    ) {
      return href;
    }
    if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    return href;
  } catch {
    return null;
  }
}

const markdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    const safeHref = resolveSafeHref(href);
    if (!safeHref) {
      return <span>{children}</span>;
    }

    const isExternal = /^(https?:|mailto:)/i.test(safeHref);
    return (
      <a
        {...props}
        href={safeHref}
        rel={isExternal ? "noreferrer noopener" : undefined}
        target={isExternal ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  if (!content) {
    return (
      <p className="text-sm text-muted-foreground">（ドキュメントは空です）</p>
    );
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="document">
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
