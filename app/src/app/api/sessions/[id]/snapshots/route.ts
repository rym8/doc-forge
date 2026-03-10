import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { toSnapshot } from "@/lib/slides/snapshots";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.sessionId, id))
    .orderBy(desc(snapshots.createdAt));
  return NextResponse.json(rows.map(toSnapshot));
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { snapshotId } = await req.json();
  if (!snapshotId) {
    return NextResponse.json({ error: "snapshotId is required" }, { status: 400 });
  }
  await db
    .delete(snapshots)
    .where(and(eq(snapshots.id, snapshotId), eq(snapshots.sessionId, id)));
  return NextResponse.json({ ok: true });
}
