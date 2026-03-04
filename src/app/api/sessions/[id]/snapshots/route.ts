import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

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
  return NextResponse.json(rows);
}
