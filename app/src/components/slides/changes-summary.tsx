"use client";

import type { DiffSection } from "@/lib/slides/diff";

interface ChangesSummaryProps {
  sections: DiffSection[];
}

export function ChangesSummary({ sections }: ChangesSummaryProps) {
  const items = sections.flatMap((section) => section.items);
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        未保存の変更はありません。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-medium">未保存の変更</div>
        <div className="text-xs opacity-70">{items.length} 件</div>
      </div>
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
              {section.title}
            </div>
            <ul className="space-y-2 text-xs">
              {section.items.slice(0, 6).map((item, index) => (
                <li
                  key={`${section.title}-${index}-${item.summary}`}
                  className={
                    section.variant === "warning"
                      ? "rounded-md border border-orange-200 bg-orange-100/70 px-2 py-2 text-orange-950"
                      : "rounded-md border border-amber-200/70 bg-white/50 px-2 py-2"
                  }
                >
                  <div>- {item.summary}</div>
                  {(item.before !== undefined || item.after !== undefined) && (
                    <div className="mt-1 grid gap-1 text-[11px] text-amber-900/80 md:grid-cols-2">
                      <div>
                        <div className="opacity-70">Before</div>
                        <div className="line-clamp-3 whitespace-pre-wrap break-all">
                          {item.before || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="opacity-70">After</div>
                        <div className="line-clamp-3 whitespace-pre-wrap break-all">
                          {item.after || "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {section.items.length > 6 ? (
                <li>...ほか {section.items.length - 6} 件</li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
