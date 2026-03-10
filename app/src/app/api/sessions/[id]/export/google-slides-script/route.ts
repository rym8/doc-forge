import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { renderSlideDeckToPptxBuffer } from "@/lib/slides/pptx";
import { toSession } from "@/lib/slides/session";

function toFileName(title: string): string {
  const normalized = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ");
  return `${normalized || "slides"}-google-slides.pptx`;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));

  if (!row) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  const session = toSession(row);
  if (session.artifactType !== "slides") {
    return NextResponse.json(
      { error: "slides セッションのみ Google Slides 用ファイルを出力できます" },
      { status: 400 }
    );
  }

  if (!session.slideDeck || session.slideDeck.slides.length === 0) {
    return NextResponse.json(
      { error: "先に原稿を読み込んでスライドを作成してください" },
      { status: 400 }
    );
  }
  const rendered = await renderSlideDeckToPptxBuffer({
    deck: session.slideDeck,
    theme: session.theme,
    exportOptions: session.exportOptions,
  });

  return new Response(new Uint8Array(rendered.buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        toFileName(session.title)
      )}"`,
      "Cache-Control": "no-store",
    },
  });
}
