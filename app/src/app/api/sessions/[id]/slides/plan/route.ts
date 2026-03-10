import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, snapshots } from "@/lib/db/schema";
import { planSlideDeckFromMarkdown } from "@/lib/slides/planner";
import { serializeSlideDeck, toSession } from "@/lib/slides/session";
import { buildSlidesSnapshotValues } from "@/lib/slides/snapshots";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));

  if (!row) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  const session = toSession(row);

  const sourceMarkdown =
    typeof body.sourceMarkdown === "string"
      ? body.sourceMarkdown
      : (session.sourceMarkdown ?? session.documentContent ?? "");

  const planned = planSlideDeckFromMarkdown(sourceMarkdown, session.title, {
    maxBulletsPerSlide:
      typeof body.maxBulletsPerSlide === "number"
        ? body.maxBulletsPerSlide
        : undefined,
  });

  await db.insert(snapshots).values(
    buildSlidesSnapshotValues({
      session,
      summary: "原稿からスライド草案を生成",
    })
  );

  await db
    .update(sessions)
    .set({
      artifactType: "slides",
      documentContent: sourceMarkdown,
      sourceMarkdown,
      slideDeckJson: serializeSlideDeck(planned.deck),
      plannerVersion: planned.plannerVersion,
      updatedAt: Date.now(),
    })
    .where(eq(sessions.id, id));

  const [updated] = await db.select().from(sessions).where(eq(sessions.id, id));
  return NextResponse.json({
    deck: planned.deck,
    plannerVersion: planned.plannerVersion,
    session: toSession(updated),
  });
}
