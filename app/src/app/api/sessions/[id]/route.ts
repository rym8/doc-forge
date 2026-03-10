import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, snapshots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  serializeSlideDeck,
  serializeSlideExportOptions,
  serializeSlideTheme,
  toSession,
} from "@/lib/slides/session";
import {
  buildSlidesSnapshotValues,
} from "@/lib/slides/snapshots";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id));
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toSession(session));
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const [current] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id));
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  const currentSession = toSession(current);
  const shouldSnapshotSlides =
    current.artifactType === "slides" &&
    (body.slideDeck !== undefined ||
      body.theme !== undefined ||
      body.exportOptions !== undefined);

  if (shouldSnapshotSlides) {
    let summary = "スライド構成を保存";
    if (body.theme !== undefined && body.slideDeck === undefined) {
      summary = "テーマ設定を保存";
    } else if (body.slideDeck !== undefined && body.theme !== undefined) {
      summary = "スライド構成とテーマを保存";
    } else if (body.exportOptions !== undefined && body.slideDeck === undefined) {
      summary = "出力設定を保存";
    }

    await db.insert(snapshots).values(
      buildSlidesSnapshotValues({
        session: currentSession,
        summary,
      })
    );
  }

  if (body.title !== undefined) updates.title = body.title;
  if (body.documentContent !== undefined) {
    updates.documentContent = body.documentContent;
    if (current.artifactType === "slides") {
      updates.sourceMarkdown =
        body.sourceMarkdown !== undefined
          ? body.sourceMarkdown
          : body.documentContent;
    }
  }
  if (body.sourceMarkdown !== undefined) {
    updates.sourceMarkdown = body.sourceMarkdown;
    if (current.artifactType === "slides") {
      updates.documentContent =
        body.documentContent !== undefined
          ? body.documentContent
          : body.sourceMarkdown;
    }
  }
  if (body.slideDeck !== undefined) {
    updates.slideDeckJson = serializeSlideDeck(body.slideDeck);
  }
  if (body.theme !== undefined) {
    updates.themeJson = serializeSlideTheme(body.theme);
  }
  if (body.exportOptions !== undefined) {
    updates.exportOptionsJson = serializeSlideExportOptions(body.exportOptions);
  }
  if (body.plannerVersion !== undefined) {
    updates.plannerVersion = body.plannerVersion;
  }
  if (body.rendererVersion !== undefined) {
    updates.rendererVersion = body.rendererVersion;
  }

  await db.update(sessions).set(updates).where(eq(sessions.id, id));
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id));
  return NextResponse.json(toSession(session));
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(sessions).where(eq(sessions.id, id));
  return NextResponse.json({ ok: true });
}
